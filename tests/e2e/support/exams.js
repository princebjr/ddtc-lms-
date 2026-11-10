import { call, signIn as apiSignIn } from '../../functions/support.js';

// Phase 10.1 end-to-end fixtures: an examination set up through manage-examinations with the lecturer's
// own session (the screens under test are the learner's examination, the results and the script), so the
// state before them is reached quickly and exactly as the app reaches it.

/**
 * A published examination open now (until p_hours from now) with one multiple-choice question (B is
 * correct, 2 marks) and one essay (8 marks).
 * @param {{ email: string, password: string }} lecturer @param {string} courseId @param {string} title @param {number} [hours]
 * @returns {Promise<string>} the examination's id
 */
export async function createExamFixture(lecturer, courseId, title, hours = 48) {
  const { token } = await apiSignIn(lecturer.email, lecturer.password);
  const fields = { title, pass_mark: 50, instructions: 'Answer every question.', opens_at: new Date(Date.now() - 3600000).toISOString(), closes_at: new Date(Date.now() + hours * 3600000).toISOString() };
  const saved = await call('manage-examinations', token, { action: 'save', courseId, fields });
  if (saved.status !== 200) throw new Error(`examination not saved: ${saved.status} ${JSON.stringify(saved.body)}`);
  const examId = saved.body.examId;
  const structure = await call('manage-examinations', token, {
    action: 'structure',
    examId,
    sections: [
      { title: 'Section A: Multiple choice', questions: [{ kind: 'MCQ', prompt: 'Who led Israel out of Egypt?', marks: 2, options: { A: 'Aaron', B: 'Moses', C: 'Joshua', D: 'Samuel' }, correct: 'B' }] },
      { title: 'Section B: Essay', questions: [{ kind: 'ESSAY', prompt: 'Discuss the covenant in Genesis.', marks: 8, guide: 'Abraham, land, blessing.' }] },
    ],
  });
  if (structure.status !== 200) throw new Error(`questions not saved: ${structure.status} ${JSON.stringify(structure.body)}`);
  const published = await call('manage-examinations', token, { action: 'publish', examId, publish: true });
  if (published.status !== 200) throw new Error(`examination not published: ${published.status} ${JSON.stringify(published.body)}`);
  return examId;
}
