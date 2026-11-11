import { holdAwake } from '@/lib/auth/activity.js';
import { parsePublicEnv } from './env.js';
import { callFunction, FunctionError } from './functions.js';

// The browser's part of the D18 upload pipeline: register-upload (the server chooses the path and
// checks the right), the upload itself to exactly that path, then finalize-upload (the server checks
// the bytes and validates or rejects). Files over 25 MB use resumable upload (tus, D18) so a
// dropped connection or a suspended app continues where it stopped; answers and recordings (Phase
// 8) always do: when the device goes offline the upload waits and carries on once it is back.

export const RESUMABLE_OVER = 25 * 1024 * 1024;

/**
 * @typedef {object} UploadRequest
 * @property {'PROFILE_IMAGE' | 'COURSE_COVER' | 'LESSON_AUDIO' | 'LESSON_ATTACHMENT' | 'ASSIGNMENT_INSTRUCTION_AUDIO' | 'SUBMISSION_FILE' | 'EXAM_ANSWER_AUDIO' | 'EXAM_ANSWER_DOCUMENT'} resourceType
 * @property {File} file
 * @property {string} [courseId]
 * @property {string} [lessonId]
 * @property {string} [assignmentId]  ASSIGNMENT_INSTRUCTION_AUDIO (Phase 7) and SUBMISSION_FILE (Phase 8): the assignment
 * @property {string} [examId]  EXAM_ANSWER_AUDIO (Phase 10.1): the examination
 * @property {string} [questionId]  EXAM_ANSWER_AUDIO: the short-answer or essay question
 * @property {string} [replaceAudioId]  LESSON_AUDIO: the lesson audio this file replaces (ADR-007); sent to both steps
 * @property {Record<string, unknown>} [finalize]  extra fields for finalize-upload (peaks, title)
 * @property {Promise<Record<string, unknown>>} [finalizeLater]  fields that are still being prepared (peaks)
 * @property {(fraction: number) => void} [onProgress]
 * @property {boolean} [alwaysResumable]  resumable whatever the size, waiting out a lost connection (Phase 8)
 * @property {() => void} [onResumed]  an interrupted upload carried on ("Upload resumed")
 * @property {(fileId: string) => void} [onRegistered]  the file's id once the server has registered it
 * @property {AbortSignal} [signal]  cancels the upload
 */

/**
 * @template T
 * @param {UploadRequest} req
 * @returns {Promise<T>} finalize-upload's answer
 */
export async function uploadFile(req) {
  // An upload in progress counts as activity: nobody is signed out for idleness during one (D43).
  const release = holdAwake();
  try {
    return await upload(req);
  } finally {
    release();
  }
}

/**
 * @template T
 * @param {UploadRequest} req
 * @returns {Promise<T>}
 */
async function upload({
  resourceType,
  file,
  courseId,
  lessonId,
  assignmentId,
  examId,
  questionId,
  replaceAudioId,
  finalize = {},
  finalizeLater,
  onProgress,
  alwaysResumable,
  onResumed,
  onRegistered,
  signal,
}) {
  const replace = replaceAudioId ? { replaceAudioId } : {};
  const reg = /** @type {{ fileId: string, bucket: string, path: string, token: string, contentType: string | null }} */ (
    await callFunction('register-upload', {
      resourceType,
      courseId,
      lessonId,
      assignmentId,
      ...(examId ? { examId, questionId } : {}),
      filename: file.name,
      size: file.size,
      ...replace,
    })
  );
  onRegistered?.(reg.fileId);
  if (signal?.aborted) throw cancelled();
  const contentType = reg.contentType ?? file.type;
  if (alwaysResumable || file.size > RESUMABLE_OVER) await resumable(reg, file, contentType, { onProgress, onResumed, signal });
  else await single(reg, file, contentType, onProgress, signal);
  onProgress?.(1);
  const later = finalizeLater ? await finalizeLater.catch(() => ({})) : {};
  const result = await callFunction('finalize-upload', {
    fileId: reg.fileId,
    ...replace,
    ...finalize,
    ...later,
  });
  // Where the file is (from register-upload), so the caller can play or open it at once.
  return /** @type {T} */ ({ .../** @type {object} */ (result), bucket: reg.bucket, storagePath: reg.path });
}

const cancelled = () => new FunctionError(0, 'cancelled', 'The upload was cancelled.');

/** One request with progress events (XMLHttpRequest reports upload progress; fetch does not). */
function single(
  /** @type {{ bucket: string, path: string, token: string }} */ reg,
  /** @type {File} */ file,
  /** @type {string} */ contentType,
  /** @type {((f: number) => void) | undefined} */ onProgress,
  /** @type {AbortSignal | undefined} */ signal,
) {
  const env = parsePublicEnv(import.meta.env);
  const url = `${env.VITE_SUPABASE_URL}/storage/v1/object/upload/sign/${reg.bucket}/${reg.path}?token=${encodeURIComponent(reg.token)}`;
  return /** @type {Promise<void>} */ (
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FunctionError(xhr.status, 'upload_failed', 'The upload did not finish. Try again.'));
      xhr.onerror = () => reject(new FunctionError(0, 'network', 'The upload stopped. Check your connection and try again.'));
      xhr.onabort = () => reject(cancelled());
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(file);
    })
  );
}

/**
 * Resumable (tus) upload with the signed-upload token; loaded only when needed. When the device
 * goes offline the upload waits for the connection to come back and carries on from where it
 * stopped (onResumed is called once it moves again).
 */
async function resumable(
  /** @type {{ bucket: string, path: string, token: string }} */ reg,
  /** @type {File} */ file,
  /** @type {string} */ contentType,
  /** @type {{ onProgress?: (f: number) => void, onResumed?: () => void, signal?: AbortSignal }} */ { onProgress, onResumed, signal },
) {
  const env = parsePublicEnv(import.meta.env);
  const { Upload } = await import('tus-js-client');
  await new Promise((resolve, reject) => {
    let interrupted = false;
    let stopped = false;
    /** @type {() => void} */
    let onOnline = () => {};
    const upload = new Upload(file, {
      endpoint: `${env.VITE_SUPABASE_URL}/storage/v1/upload/resumable/sign`,
      headers: { 'x-signature': reg.token, apikey: env.VITE_SUPABASE_ANON_KEY },
      // Supabase Storage takes resumable uploads in 6 MB chunks.
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: reg.bucket,
        objectName: reg.path,
        contentType,
        cacheControl: '3600',
      },
      onShouldRetry: () => {
        interrupted = true;
        return true;
      },
      onProgress: (sent, total) => {
        if (interrupted && sent > 0) {
          interrupted = false;
          onResumed?.();
        }
        onProgress?.(total ? sent / total : 0);
      },
      onSuccess: () => {
        window.removeEventListener('online', onOnline);
        // Some browsers send no progress for a small file: an interrupted upload that finished has resumed.
        if (interrupted) {
          interrupted = false;
          onResumed?.();
        }
        resolve(undefined);
      },
      onError: () => {
        if (stopped) return;
        // Offline (a lost signal, a network change): wait for the connection and carry on.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          interrupted = true;
          window.removeEventListener('online', onOnline);
          onOnline = () => upload.start();
          window.addEventListener('online', onOnline, { once: true });
          return;
        }
        reject(new FunctionError(0, 'upload_failed', 'The upload stopped. Check your connection and try again.'));
      },
    });
    signal?.addEventListener(
      'abort',
      () => {
        stopped = true;
        window.removeEventListener('online', onOnline);
        upload.abort(true).catch(() => undefined);
        reject(cancelled());
      },
      { once: true },
    );
    // Continue an earlier attempt of the same file if there is one.
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}
