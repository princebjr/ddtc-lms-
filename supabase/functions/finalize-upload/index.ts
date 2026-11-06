// finalize-upload (D18 step 3): verifies the uploaded object itself (real type from its first
// bytes, size, ownership) and sets VALIDATED or REJECTED. Rejected objects are removed. For a
// profile image the new file becomes the profile photo and the previous one is removed at once;
// a failed removal is marked DELETE_FAILED and retried by cleanup-files. For a course cover (Phase 5)
// the uploader's right to edit the course is checked again, the new file becomes the course cover
// and the previous cover is removed the same way.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { requireCourseEditor } from '../_shared/courses.ts';
import { RESOURCES, sha256, sniffImage, type ResourceType } from '../_shared/files.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({ fileId: z.uuid() });

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
  const rule = RESOURCES[file.resource_type as ResourceType];
  if (!rule) throw new HttpError(400, 'invalid', 'Unsupported file');
  if (file.resource_type === 'COURSE_COVER') await requireCourseEditor(admin, caller.id, caller.isAdmin, file.resource_id as string);

  const reject = async (reason: string) => {
    await admin.from('file_objects').update({ status: 'REJECTED', validation_error: reason }).eq('id', file.id);
    const { error } = await admin.storage.from(file.bucket_name).remove([file.storage_path]);
    if (!error) await admin.from('file_objects').update({ status: 'DELETED', deleted_at: new Date().toISOString() }).eq('id', file.id);
    throw new HttpError(422, 'rejected', reason);
  };

  const { data: blob, error: downloadError } = await admin.storage.from(file.bucket_name).download(file.storage_path);
  if (downloadError || !blob) await reject('The file did not arrive. Try again.');
  const bytes = new Uint8Array(await blob!.arrayBuffer());

  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'file_limits').single();
  const maxBytes = Number(setting?.value?.[rule.limitKey]?.max_bytes ?? 0);
  if (bytes.length === 0) await reject('The file is empty.');
  if (bytes.length > maxBytes) await reject(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);

  const detected = sniffImage(bytes);
  if (!detected || !(detected in rule.types)) await reject('The file is not a JPG, PNG or WebP image.');

  const { error: validateError } = await admin
    .from('file_objects')
    .update({
      status: 'VALIDATED',
      detected_mime_type: detected,
      file_size: bytes.length,
      checksum: await sha256(bytes),
      validated_at: new Date().toISOString(),
    })
    .eq('id', file.id)
    .eq('status', 'PENDING');
  if (validateError) throw new HttpError(500, 'server_error', 'Could not save the upload');

  if (file.resource_type === 'PROFILE_IMAGE') {
    const { data: profile } = await admin.from('profiles').select('profile_image_file_id').eq('id', caller.id).single();
    const previous = profile?.profile_image_file_id as string | null;
    const { error: setError } = await admin.from('profiles').update({ profile_image_file_id: file.id }).eq('id', caller.id);
    if (setError) throw new HttpError(500, 'server_error', 'Could not update the profile photo');
    if (previous && previous !== file.id) await removeFile(admin, previous);
  }

  if (file.resource_type === 'COURSE_COVER') {
    const courseId = file.resource_id as string;
    const { data: course } = await admin.from('courses').select('cover_image_file_id').eq('id', courseId).single();
    const previous = course?.cover_image_file_id as string | null;
    const { error: setError } = await admin.from('courses').update({ cover_image_file_id: file.id }).eq('id', courseId);
    if (setError) throw new HttpError(500, 'server_error', 'Could not update the course cover');
    if (previous && previous !== file.id) await removeFile(admin, previous);
  }

  return json(req, 200, { fileId: file.id, status: 'VALIDATED', mimeType: detected, size: bytes.length });
});

/** Removes a replaced file's object now; on failure cleanup-files retries (DELETE_FAILED). */
async function removeFile(admin: ReturnType<typeof serviceClient>, fileId: string) {
  const { data: old } = await admin.from('file_objects').select('bucket_name, storage_path').eq('id', fileId).single();
  if (!old) return;
  const { error } = await admin.storage.from(old.bucket_name).remove([old.storage_path]);
  await admin
    .from('file_objects')
    .update(error ? { status: 'DELETE_FAILED' } : { status: 'DELETED', deleted_at: new Date().toISOString() })
    .eq('id', fileId);
}
