// register-upload (D18 step 1): checks that the caller may upload this kind of file, creates a
// PENDING file_objects row with a server-generated, immutable path, and returns a signed upload
// URL for exactly that path. The browser never chooses the path, owner or status.
//   PROFILE_IMAGE  any ACTIVE user, for their own profile; path <user id>/<file id>.<ext>
//   COURSE_COVER   an administrator (two-step verified) or a lecturer of the course, never for an
//                  archived course; path <course id>/<file id>.<ext>
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { requireCourseEditor } from '../_shared/courses.ts';
import { extensionOf, RESOURCES, safeName } from '../_shared/files.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({
  resourceType: z.enum(['PROFILE_IMAGE', 'COURSE_COVER']),
  courseId: z.uuid().optional(),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', 'Choose a file to upload');
  const b = parsed.data;
  const rule = RESOURCES[b.resourceType];
  const admin = serviceClient();

  let resourceId = caller.id;
  if (b.resourceType === 'COURSE_COVER') {
    if (!b.courseId) throw new HttpError(400, 'invalid', 'Choose the course first');
    await requireCourseEditor(admin, caller.id, caller.isAdmin, b.courseId);
    resourceId = b.courseId;
  }

  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'file_limits').single();
  const maxBytes = Number(setting?.value?.[rule.limitKey]?.max_bytes ?? 0);
  if (!maxBytes || b.size > maxBytes) throw new HttpError(400, 'too_large', `The file is larger than ${Math.round(maxBytes / 1048576)} MB`);

  const ext = extensionOf(b.filename);
  const allowed = Object.values(rule.types).flat();
  if (!allowed.includes(ext)) throw new HttpError(400, 'wrong_type', `Use a ${allowed.map((e) => e.toUpperCase()).join(', ')} file`);

  const fileId = crypto.randomUUID();
  const path = `${resourceId}/${fileId}.${ext}`;
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
  return json(req, 200, { fileId, bucket: rule.bucket, path, token: signed.token });
});

