// finalize-upload (D18 step 3): verifies the uploaded object itself (real type from its bytes, size,
// duration where it applies, ownership) and sets VALIDATED or REJECTED. Rejected objects are removed.
//   PROFILE_IMAGE      becomes the profile photo; the previous one is removed at once (a failed
//                      removal is marked DELETE_FAILED and retried by cleanup-files).
//   COURSE_COVER       (Phase 5) the uploader's right to edit the course is checked again; the new
//                      file becomes the course cover and the previous cover is removed the same way.
//   LESSON_AUDIO       (Phase 6) MP3, M4A or WAV within the size and duration limits (D17), read
//                      from the file's own header; added to the lesson with its title (up to 10,
//                      ADR-007), or in place of replaceAudioId, which is kept as SUPERSEDED (D09).
//                      Waveform peaks from the uploader's browser are stored when they have the right
//                      shape (ADR-006).
//   LESSON_ATTACHMENT  (Phase 6) PDF, DOCX or PPTX by content, macros refused; added to the lesson.
//   ASSIGNMENT_INSTRUCTION_AUDIO  (Phase 7) the same audio checks as lesson audio within 25 MB and
//                      10 minutes (D17); becomes the assignment's instruction audio (a replaced
//                      file is kept for the snapshots).
//   SUBMISSION_FILE    (Phase 8) a learner's answer file: audio (MP3, M4A, WAV, WebM or Ogg, also
//                      browser recordings) within 25 MB and 10 minutes, or PDF or Word (.docx,
//                      macros refused) within 10 MB (D17). It then waits for the learner's next
//                      version; submit-assignment adds it when they send their answer.
// The file name's extension must match the real content.
import { z } from 'npm:zod@4.6.7';
import { AUDIO_EXTENSIONS, cleanPeaks, inspectAudio } from '../_shared/audio.ts';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { requireCourseEditor } from '../_shared/courses.ts';
import { DOCUMENT_EXTENSIONS, inspectDocument } from '../_shared/documents.ts';
import { extensionOf, RESOURCES, sha256, sniffImage, submissionLimitKey, submissionRoleFor, type ResourceType } from '../_shared/files.ts';

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { removeStoredFile } from '../_shared/remove-file.ts';
import { storageReader } from '../_shared/storage-reader.ts';

const Body = z.object({
  fileId: z.uuid(),
  peaks: z.array(z.number()).optional(),
  title: z.string().trim().max(200).optional(),
  replaceAudioId: z.uuid().optional(),
});

type Admin = ReturnType<typeof serviceClient>;

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', 'A file id is required');
  const admin = serviceClient();

  const { data: file } = await admin
    .from('file_objects')
    .select('id, bucket_name, storage_path, resource_type, resource_id, status, uploaded_by, original_filename')
    .eq('id', parsed.data.fileId)
    .maybeSingle();
  if (!file || file.uploaded_by !== caller.id) throw new HttpError(404, 'not_found', 'Upload not found');
  if (file.status !== 'PENDING') throw new HttpError(409, 'conflict', 'This upload has already been checked');
  const type = file.resource_type as ResourceType;
  const rule = RESOURCES[type];
  if (!rule) throw new HttpError(400, 'invalid', 'Unsupported file');
  if (type === 'COURSE_COVER') await requireCourseEditor(admin, caller.id, caller.isAdmin, file.resource_id as string);
  if (type === 'LESSON_AUDIO' || type === 'LESSON_ATTACHMENT' || type === 'ASSIGNMENT_INSTRUCTION_AUDIO') {
    await requireCourseEditor(admin, caller.id, caller.isAdmin, (file.storage_path as string).split('/')[0]);
  }

  const reject = async (reason: string): Promise<never> => {
    await admin.from('file_objects').update({ status: 'REJECTED', validation_error: reason }).eq('id', file.id);
    const { error } = await admin.storage.from(file.bucket_name).remove([file.storage_path]);
    if (!error) await admin.from('file_objects').update({ status: 'DELETED', deleted_at: new Date().toISOString() }).eq('id', file.id);
    throw new HttpError(422, 'rejected', reason);
  };

  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'file_limits').single();
  const limits = setting?.value?.[rule.limitKey] ?? {};
  const maxBytes = Number(limits.max_bytes ?? 0);
  const maxSeconds = Number(limits.max_seconds ?? 0);
  const ext = extensionOf(file.original_filename as string);

  /** Marks the file VALIDATED with the facts found (only if it is still PENDING). */
  const validate = async (facts: Record<string, unknown>) => {
    const { error } = await admin
      .from('file_objects')
      .update({ status: 'VALIDATED', validated_at: new Date().toISOString(), ...facts })
      .eq('id', file.id)
      .eq('status', 'PENDING');
    if (error) throw new HttpError(500, 'server_error', 'Could not save the upload');
  };

  // ---------------------------------------------------------------- images (Phases 4 and 5)
  if (type === 'PROFILE_IMAGE' || type === 'COURSE_COVER') {
    const { data: blob, error: downloadError } = await admin.storage.from(file.bucket_name).download(file.storage_path);
    if (downloadError || !blob) await reject('The file did not arrive. Try again.');
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    if (bytes.length === 0) await reject('The file is empty.');
    if (bytes.length > maxBytes) await reject(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    const detected = sniffImage(bytes);
    if (!detected || !(detected in rule.types)) await reject('The file is not a JPG, PNG or WebP image.');
    await validate({ detected_mime_type: detected, file_size: bytes.length, checksum: await sha256(bytes) });

    if (type === 'PROFILE_IMAGE') {
      const { data: profile } = await admin.from('profiles').select('profile_image_file_id').eq('id', caller.id).single();
      const previous = profile?.profile_image_file_id as string | null;
      const { error: setError } = await admin.from('profiles').update({ profile_image_file_id: file.id }).eq('id', caller.id);
      if (setError) throw new HttpError(500, 'server_error', 'Could not update the profile photo');
      if (previous && previous !== file.id) await removeStoredFile(admin, previous);
    } else {
      const courseId = file.resource_id as string;
      const { data: course } = await admin.from('courses').select('cover_image_file_id').eq('id', courseId).single();
      const previous = course?.cover_image_file_id as string | null;
      const { error: setError } = await admin.from('courses').update({ cover_image_file_id: file.id }).eq('id', courseId);
      if (setError) throw new HttpError(500, 'server_error', 'Could not update the course cover');
      if (previous && previous !== file.id) await removeStoredFile(admin, previous);
    }
    return json(req, 200, { fileId: file.id, status: 'VALIDATED', mimeType: detected, size: bytes.length });
  }

  // ---------------------------------------------------------------- audio and documents (Phase 6)
  const reader = await storageReader(file.bucket_name, file.storage_path);
  if (reader.size === 0) await reject('The file is empty.');
  if (reader.size > maxBytes) await reject(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);

  if (type === 'SUBMISSION_FILE') {
    const role = submissionRoleFor(ext);
    if (role === 'AUDIO') {
      const facts = await inspectAudio(reader);
      if (!facts || !(facts.mime in rule.types)) await reject('The file is not an audio file we can play (MP3, M4A, WAV, WebM or Ogg).');
      if (!AUDIO_EXTENSIONS[facts!.mime].includes(ext)) await reject('The file content does not match its name. Use the original audio file.');
      if (maxSeconds && facts!.durationSeconds > maxSeconds) await reject(`The audio is longer than ${Math.round(maxSeconds / 60)} minutes.`);
      await validate({
        detected_mime_type: facts!.mime,
        file_size: reader.size,
        duration_seconds: Math.round(facts!.durationSeconds * 100) / 100,
        waveform_peaks: cleanPeaks(parsed.data.peaks),
      });
      return json(req, 200, { fileId: file.id, status: 'VALIDATED', role, mimeType: facts!.mime, size: reader.size, durationSeconds: facts!.durationSeconds });
    }
    const documentLimit = Number(setting?.value?.[submissionLimitKey('PDF')]?.max_bytes ?? 0);
    if (!documentLimit || reader.size > documentLimit) await reject(`The file is larger than ${Math.round(documentLimit / 1048576)} MB.`);
    const mime = await inspectDocument(reader);
    if (!mime || mime === PPTX || !role) await reject('The file is not a PDF or Word (.docx) file, or it contains macros.');
    if (!DOCUMENT_EXTENSIONS[mime!].includes(ext)) await reject('The file content does not match its name.');
    await validate({ detected_mime_type: mime, file_size: reader.size });
    return json(req, 200, { fileId: file.id, status: 'VALIDATED', role, mimeType: mime, size: reader.size });
  }

  if (type === 'LESSON_AUDIO' || type === 'ASSIGNMENT_INSTRUCTION_AUDIO') {
    const facts = await inspectAudio(reader);
    if (!facts || !(facts.mime in rule.types)) {
      await reject(type === 'LESSON_AUDIO' ? 'The file is not an audio file we can play (MP3, M4A, WAV, WebM or Ogg).' : 'The file is not an MP3, M4A or WAV audio file.');
    }
    if (!AUDIO_EXTENSIONS[facts!.mime].includes(ext)) await reject('The file content does not match its name. Use the original audio file.');
    if (maxSeconds && facts!.durationSeconds > maxSeconds) await reject(`The audio is longer than ${Math.round(maxSeconds / 60)} minutes.`);
    await validate({
      detected_mime_type: facts!.mime,
      file_size: reader.size,
      duration_seconds: Math.round(facts!.durationSeconds * 100) / 100,
      waveform_peaks: cleanPeaks(parsed.data.peaks),
    });
    const { data, error } =
      type === 'LESSON_AUDIO'
        ? await admin.rpc('lesson_audio_activate', {
            p_actor: caller.id,
            p_as_admin: caller.isAdmin,
            p_file: file.id,
            p_replace: parsed.data.replaceAudioId ?? null,
            p_title: parsed.data.title || null,
          })
        : await admin.rpc('assignment_audio_activate', { p_actor: caller.id, p_as_admin: caller.isAdmin, p_file: file.id });
    if (error) await undo(admin, file, fromDbError(error));
    return json(req, 200, {
      fileId: file.id,
      status: 'VALIDATED',
      mimeType: facts!.mime,
      size: reader.size,
      durationSeconds: facts!.durationSeconds,
      replaced: Boolean((data as { replaced?: boolean } | null)?.replaced),
      audioId: (data as { audio?: string } | null)?.audio ?? null,
    });
  }

  if (type === 'LESSON_ATTACHMENT') {
    const mime = await inspectDocument(reader);
    if (!mime) await reject('The file is not a PDF, Word (.docx) or PowerPoint (.pptx) file, or it contains macros.');
    if (!DOCUMENT_EXTENSIONS[mime!].includes(ext)) await reject('The file content does not match its name.');
    await validate({ detected_mime_type: mime, file_size: reader.size });
    const { data, error } = await admin.rpc('lesson_attachment_add', {
      p_actor: caller.id,
      p_as_admin: caller.isAdmin,
      p_file: file.id,
      p_title: parsed.data.title ?? '',
    });
    if (error) await undo(admin, file, fromDbError(error));
    return json(req, 200, { fileId: file.id, status: 'VALIDATED', mimeType: mime, size: reader.size, attachmentId: data });
  }

  throw new HttpError(400, 'invalid', 'Unsupported file');
});

/**
 * The file passed its checks but could not be attached (for example the course was archived
 * meanwhile): mark it REJECTED, remove the object, and answer with the reason.
 */
async function undo(admin: Admin, file: { id: string; bucket_name: string; storage_path: string }, reason: HttpError): Promise<never> {
  await admin.from('file_objects').update({ status: 'REJECTED', validation_error: reason.message.slice(0, 500) }).eq('id', file.id);
  const { error } = await admin.storage.from(file.bucket_name).remove([file.storage_path]);
  if (!error) await admin.from('file_objects').update({ status: 'DELETED', deleted_at: new Date().toISOString() }).eq('id', file.id);
  throw reason;
}
