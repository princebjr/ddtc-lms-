// register-upload (D18 step 1): checks that the caller may upload this kind of file, creates a
// PENDING file_objects row with a server-generated, immutable path, and returns a signed upload
// URL for exactly that path. The browser never chooses the path, owner or status.
//   PROFILE_IMAGE  any ACTIVE user, for their own profile; path <user id>/<file id>.<ext>
//   COURSE_COVER   an administrator (two-step verified) or a lecturer of the course, never for an
//                  archived course; path <course id>/<file id>.<ext>
//   LESSON_AUDIO, LESSON_ATTACHMENT   the same, for a lesson of that course;
//                  path <course id>/<lesson id>/<file id>.<ext> (DATA_MODEL section 6). A lesson
//                  has at most 10 audio files (ADR-007): an eleventh is refused here, before any
//                  upload, unless it replaces one (replaceAudioId, an audio in use in the lesson).
//                  The database checks both again when the file is attached.
//   ASSIGNMENT_INSTRUCTION_AUDIO  (Phase 7) the same course rights, for an assignment of that
//                  course that is not archived; path <course id>/<assignment id>/<file id>.<ext>.
//   SUBMISSION_FILE  (Phase 8) a learner's answer file: audio, or PDF and Word where the lecturer
//                  allowed them (ADR-009). submission_prepare_upload checks that the learner may
//                  send an answer now (D10), the kind and the 5-file limit, and starts the draft
//                  submission; path <assignment id>/<learner id>/<next version>/<file id>.<ext>.
// The answer includes the content type the browser must send, chosen from the extension (the
// buckets accept only those); finalize-upload checks the real bytes.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { requireCourseEditor } from '../_shared/courses.ts';
import { contentTypeFor, extensionOf, MAX_LESSON_AUDIO, RESOURCES, safeName, submissionLimitKey, submissionRoleFor } from '../_shared/files.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({
  resourceType: z.enum(['PROFILE_IMAGE', 'COURSE_COVER', 'LESSON_AUDIO', 'LESSON_ATTACHMENT', 'ASSIGNMENT_INSTRUCTION_AUDIO', 'SUBMISSION_FILE', 'EXAM_ANSWER_AUDIO', 'EXAM_ANSWER_DOCUMENT']),
  courseId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  assignmentId: z.uuid().optional(),
  examId: z.uuid().optional(),
  questionId: z.uuid().optional(),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  replaceAudioId: z.uuid().optional(),
});

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', 'Choose a file to upload');
  const b = parsed.data;
  const rule = RESOURCES[b.resourceType];
  const admin = serviceClient();
  const ext = extensionOf(b.filename);
  let limitKey = rule.limitKey;

  let resourceId = caller.id;
  let folder = caller.id;
  let version: number | null = null;
  if (b.resourceType === 'SUBMISSION_FILE') {
    if (!b.assignmentId) throw new HttpError(400, 'invalid', 'Choose the assignment first');
    const role = submissionRoleFor(ext);
    if (!role) throw new HttpError(400, 'wrong_type', 'Use an audio file (MP3, M4A, WAV, WebM or Ogg), a PDF or a Word (.docx) file');
    const { data, error } = await admin.rpc('submission_prepare_upload', { p_actor: caller.id, p_assignment: b.assignmentId, p_role: role });
    if (error) throw fromDbError(error);
    const row = (data as Array<{ submission_id: string; version_number: number }>)[0];
    resourceId = row.submission_id;
    version = row.version_number;
    folder = `${b.assignmentId}/${caller.id}/${version}`;
    limitKey = submissionLimitKey(role);
  }
  // Phase 10.1 (ADR-016): an examination answer's recording (or, since Step 10.3, an uploaded audio file or a PDF or
  // Word document), for the learner's open attempt and a short-answer or essay question (exam_prepare_upload).
  if (b.resourceType === 'EXAM_ANSWER_AUDIO' || b.resourceType === 'EXAM_ANSWER_DOCUMENT') {
    if (!b.examId || !b.questionId) throw new HttpError(400, 'invalid', 'Choose the question first');
    const { data, error } = await admin.rpc('exam_prepare_upload', { p_actor: caller.id, p_exam: b.examId, p_question: b.questionId });
    if (error) throw fromDbError(error);
    resourceId = data as string;
    folder = `exams/${b.examId}/${caller.id}/${resourceId}`;
  }
  if (b.resourceType === 'COURSE_COVER') {
    if (!b.courseId) throw new HttpError(400, 'invalid', 'Choose the course first');
    await requireCourseEditor(admin, caller.id, caller.isAdmin, b.courseId);
    resourceId = b.courseId;
    folder = b.courseId;
  }
  if (b.resourceType === 'LESSON_AUDIO' || b.resourceType === 'LESSON_ATTACHMENT') {
    if (!b.courseId || !b.lessonId) throw new HttpError(400, 'invalid', 'Choose the lesson first');
    await requireCourseEditor(admin, caller.id, caller.isAdmin, b.courseId);
    const { data: lesson } = await admin.from('lessons').select('course_id').eq('id', b.lessonId).maybeSingle();
    if (!lesson || lesson.course_id !== b.courseId) throw new HttpError(404, 'not_found', 'Lesson not found');
    resourceId = b.lessonId;
    folder = `${b.courseId}/${b.lessonId}`;
  }
  if (b.resourceType === 'ASSIGNMENT_INSTRUCTION_AUDIO') {
    if (!b.courseId || !b.assignmentId) throw new HttpError(400, 'invalid', 'Choose the assignment first');
    await requireCourseEditor(admin, caller.id, caller.isAdmin, b.courseId);
    const { data: assignment } = await admin.from('assignments').select('course_id, archived_at').eq('id', b.assignmentId).maybeSingle();
    if (!assignment || assignment.course_id !== b.courseId) throw new HttpError(404, 'not_found', 'Assignment not found');
    if (assignment.archived_at) throw new HttpError(409, 'archived', 'Restore the assignment first');
    resourceId = b.assignmentId;
    folder = `${b.courseId}/${b.assignmentId}`;
  }
  if (b.resourceType === 'LESSON_AUDIO') {
    if (b.replaceAudioId) {
      const { data: target } = await admin
        .from('lesson_audio_files')
        .select('id')
        .eq('id', b.replaceAudioId)
        .eq('lesson_id', resourceId)
        .eq('lifecycle_status', 'ACTIVE')
        .maybeSingle();
      if (!target) throw new HttpError(404, 'not_found', 'The audio to replace was not found');
    } else {
      const { count } = await admin
        .from('lesson_audio_files')
        .select('id', { count: 'exact', head: true })
        .eq('lesson_id', resourceId)
        .eq('lifecycle_status', 'ACTIVE');
      if ((count ?? 0) >= MAX_LESSON_AUDIO) {
        throw new HttpError(409, 'limit_reached', `A lesson can have up to ${MAX_LESSON_AUDIO} audio files. Delete one to add another.`);
      }
    }
  }

  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'file_limits').single();
  const maxBytes = Number(setting?.value?.[limitKey]?.max_bytes ?? 0);
  if (!maxBytes || b.size > maxBytes) throw new HttpError(400, 'too_large', `The file is larger than ${Math.round(maxBytes / 1048576)} MB`);

  const allowed = Object.values(rule.types).flat();
  if (!allowed.includes(ext)) throw new HttpError(400, 'wrong_type', `Use a ${allowed.map((e) => e.toUpperCase()).join(', ')} file`);

  const fileId = crypto.randomUUID();
  const path = `${folder}/${fileId}.${ext}`;
  const { error: insertError } = await admin.from('file_objects').insert({
    id: fileId,
    bucket_name: rule.bucket,
    storage_path: path,
    original_filename: b.filename.slice(0, 255),
    safe_download_filename: safeName(b.filename),
    uploaded_by: caller.id,
    status: 'PENDING',
    resource_type: b.resourceType,
    resource_id: resourceId,
  });
  if (insertError) throw new HttpError(500, 'server_error', 'Could not start the upload');

  const { data: signed, error: signError } = await admin.storage.from(rule.bucket).createSignedUploadUrl(path);
  if (signError || !signed) throw new HttpError(500, 'server_error', 'Could not start the upload');
  return json(req, 200, { fileId, bucket: rule.bucket, path, token: signed.token, contentType: contentTypeFor(b.resourceType, ext), version });
});

