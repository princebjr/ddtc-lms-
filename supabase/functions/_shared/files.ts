// File rules for the D18 upload pipeline. Phase 4 accepts profile images, Phase 5 course covers,
// Phase 6 lesson audio and lesson attachments, Phase 7 assignment instruction audio, Phase 8
// learners' answer files (and in-app recordings of lesson audio). Limits come from
// system_settings.file_limits (D17).

export type ResourceType =
  | 'PROFILE_IMAGE'
  | 'COURSE_COVER'
  | 'LESSON_AUDIO'
  | 'LESSON_ATTACHMENT'
  | 'ASSIGNMENT_INSTRUCTION_AUDIO'
  | 'SUBMISSION_FILE'
  | 'EXAM_ANSWER_AUDIO'
  | 'EXAM_ANSWER_DOCUMENT';

const IMAGE_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
/** Uploaded audio of any kind (D17); browsers record WebM, Ogg or MP4 (Phase 8). */
const RECORDING_TYPES = {
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/wav': ['wav'],
  'audio/webm': ['webm', 'weba'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
};
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUBMISSION_DOCUMENT_TYPES = { 'application/pdf': ['pdf'], [DOCX]: ['docx'] };

export type SubmissionRole = 'AUDIO' | 'PDF' | 'DOCX';

/** The kind of answer file a name stands for (from its extension), or null. */
export function submissionRoleFor(ext: string): SubmissionRole | null {
  if (Object.values(RECORDING_TYPES).flat().includes(ext)) return 'AUDIO';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx') return 'DOCX';
  return null;
}

/** The limit key for an answer file: audio 25 MB and 10 minutes, PDF and Word 10 MB (D17). */
export const submissionLimitKey = (role: SubmissionRole) => (role === 'AUDIO' ? 'submission_audio' : 'submission_document');

/** Audio files a lesson may have at once (ADR-007, owner decision 2026-11-07); the database enforces it too. */
export const MAX_LESSON_AUDIO = 10;

export const RESOURCES: Record<ResourceType, { bucket: string; limitKey: string; types: Record<string, string[]> }> = {
  PROFILE_IMAGE: {
    bucket: 'profile-images',
    limitKey: 'profile_image',
    // detected MIME type -> allowed extensions
    types: IMAGE_TYPES,
  },
  COURSE_COVER: {
    bucket: 'course-covers',
    limitKey: 'course_cover',
    types: IMAGE_TYPES,
  },
  // Phase 8 (owner decision 5): in-app recordings arrive as WebM or Ogg (Chrome, Android, Firefox)
  // or MP4 (Safari); the limits stay 100 MB and 90 minutes.
  LESSON_AUDIO: {
    bucket: 'lesson-audio',
    limitKey: 'lesson_audio',
    types: RECORDING_TYPES,
  },
  // Phase 8: a learner's answer file, waiting for their next version until they submit (D10).
  SUBMISSION_FILE: {
    bucket: 'learner-submissions',
    limitKey: 'submission_audio',
    types: { ...RECORDING_TYPES, ...SUBMISSION_DOCUMENT_TYPES },
  },
  // Phase 10.1 (ADR-016): a learner's recorded examination answer, with the submission audio limits (D17).
  EXAM_ANSWER_AUDIO: {
    bucket: 'learner-submissions',
    limitKey: 'submission_audio',
    types: RECORDING_TYPES,
  },
  // Step 10.3 (owner request 2026-11-10): a learner's PDF or Word examination answer, with the submission document limit (D17).
  EXAM_ANSWER_DOCUMENT: {
    bucket: 'learner-submissions',
    limitKey: 'submission_document',
    types: SUBMISSION_DOCUMENT_TYPES,
  },
  // Phase 7: the lecturer's instruction audio for an assignment (25 MB, 10 minutes, D17).
  ASSIGNMENT_INSTRUCTION_AUDIO: {
    bucket: 'assignment-instructions-audio',
    limitKey: 'instruction_audio',
    types: { 'audio/mpeg': ['mp3'], 'audio/mp4': ['m4a'], 'audio/wav': ['wav'] },
  },
  LESSON_ATTACHMENT: {
    bucket: 'lesson-attachments',
    limitKey: 'lesson_attachment',
    types: {
      'application/pdf': ['pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    },
  },
};

/** The content type the browser must send for a file with this extension (the bucket accepts only these). */
export function contentTypeFor(type: ResourceType, ext: string): string | null {
  for (const [mime, exts] of Object.entries(RESOURCES[type].types)) if (exts.includes(ext)) return mime;
  return null;
}

/** The real type from the first bytes (magic numbers), never from the name or the browser. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** A filename safe for Content-Disposition: letters, digits, dot, dash, underscore, space. */
export function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'file';
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}
