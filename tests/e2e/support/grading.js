import { randomUUID } from 'node:crypto';
import { call, signIn as apiSignIn } from '../../functions/support.js';

// Phase 9 end-to-end fixtures: answers sent and grades saved through the real Edge Functions with the
// user's own session (the screens under test are the grading, results and learner pages, so the
// states before them are set up quickly and exactly as the app would set them).

/**
 * The learner sends a text answer (submit-assignment).
 * @param {{ email: string, password: string }} learner @param {string} assignmentId @param {string} [text]
 */
export async function sendAnswerFixture(learner, assignmentId, text = 'Genesis 1 shows a God who creates with purpose.') {
  const { token } = await apiSignIn(learner.email, learner.password);
  const res = await call('submit-assignment', token, { action: 'submit', assignmentId, text, fileIds: [], requestId: randomUUID() });
  if (res.status !== 200) throw new Error(`answer not sent: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/**
 * The lecturer saves a grade (grade-submission).
 * @param {{ email: string, password: string }} lecturer @param {string} assignmentId @param {string} learnerId @param {number} score @param {string} [feedback]
 */
export async function gradeFixture(lecturer, assignmentId, learnerId, score, feedback = '') {
  const { token } = await apiSignIn(lecturer.email, lecturer.password);
  const res = await call('grade-submission', token, { action: 'save', assignmentId, learnerId, score, feedback });
  if (res.status !== 200) throw new Error(`grade not saved: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
