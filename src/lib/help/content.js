// Help & Support text (owner request 2026-11-13, ADR-027): Getting Started, How to Use DDTC and Frequently Asked
// Questions, one set for learners and one for lecturers. Written from how the app works; the owner approves the
// wording. Keep it in step with the screens: a renamed button or a changed rule changes this text too.

/** @typedef {{ title: string, body: string }} GettingStartedStep */
/** @typedef {{ title: string, steps: string[] }} HowTo */
/** @typedef {{ question: string, answer: string }} Faq */
/** @typedef {{ intro: string, gettingStarted: GettingStartedStep[], howTo: HowTo[], faq: Faq[] }} HelpContent */

/** Shared answers (both roles). */
const SIGNED_OUT = {
  question: 'Why was I signed out?',
  answer:
    'For your safety, DDTC LMS signs you out when you have not used it for a while (10 minutes unless DDTC has changed it). A warning appears 2 minutes before: choose Continue Session to stay signed in. Anything you were typing is kept on this device as a draft for 24 hours, and comes back when you sign in again.',
};
const PASSWORD = {
  question: 'I forgot my password. What do I do?',
  answer: 'On the Sign In page choose Forgot password?, enter your email address, and follow the link in the email we send you to choose a new password.',
};
const NOTIFICATIONS = {
  question: 'How do I stop the emails?',
  answer:
    'Open Notifications (the bell) and turn off Email me about my courses. You still see every notification in the app. Emails about your account, such as password resets, are always sent.',
};
const AUDIO = {
  question: 'The audio does not play. What can I do?',
  answer:
    'Check your connection and your phone’s volume, then press Retry on the player. On a slow connection the audio starts once enough of it has arrived; the text of the lesson is always there to read meanwhile. If it still does not play, contact support below.',
};

/** @type {HelpContent} */
const LEARNER = {
  intro: 'Everything you need to study with DDTC: your courses, lessons, assignments, examinations and grades.',
  gettingStarted: [
    { title: 'Complete your profile', body: 'Open Profile from the menu. Check your name and branch, and add a photo if you like, so your lecturers know who you are.' },
    { title: 'Find your courses', body: 'My Courses lists the courses DDTC has enrolled you in. Open one to see its lessons, assignments, examinations and your grade.' },
    { title: 'Work through the lessons', body: 'Read each lesson, listen to its audio, then mark it complete. Your progress shows on the course page and your dashboard.' },
    { title: 'Send your assignments on time', body: 'Assignments shows what is due soon, in Ghana time. Answer in writing, by recording or uploading audio, or with a PDF or Word file, then press Submit.' },
    { title: 'Watch for your grades', body: 'When your lecturer releases a grade you get a notification. Grades shows every result and its feedback.' },
  ],
  howTo: [
    {
      title: 'Read and listen to a lesson',
      steps: [
        'Open My Courses, choose the course, then the lesson.',
        'Press Play on the audio player. Use the speed button to listen faster or slower, and the 15-second buttons to go back or forward.',
        'Download the audio or the attachments if you want to keep them.',
        'When you have finished, press Mark complete. Use Next lesson to carry on.',
      ],
    },
    {
      title: 'Answer an assignment',
      steps: [
        'Open Assignments and choose the assignment. Read or listen to the instructions.',
        'Write your answer, record your answer in the app, or upload an audio, PDF or Word file (the screen shows the limits).',
        'Your work is saved as a draft while you go. Press Submit when you are ready.',
        'If the assignment is still open you can send a new version later; your lecturer sees every version.',
      ],
    },
    {
      title: 'Take an examination',
      steps: [
        'Open the course and choose the examination when it opens. There is no countdown timer, but it closes at the time shown.',
        'Press Start examination, answer each section (multiple choice, short answer or essay) and move between sections freely. Your answers are saved as you go.',
        'For a written answer you may also record or upload audio, or upload a PDF or Word file, where the question allows it.',
        'Press Submit when you have finished. You cannot change your answers after submitting.',
      ],
    },
    {
      title: 'See your grades and feedback',
      steps: [
        'Open Grades from the menu, or a course’s grade page.',
        'Each assignment and examination shows its score and your lecturer’s feedback once released.',
        'The course grade combines weekly assignments (40%), Local Assembly practicals (30%) and final examinations (30%).',
      ],
    },
    {
      title: 'Manage your notifications',
      steps: ['Open the bell at the top of the screen.', 'Tap a notification to open what it is about.', 'Clear one with its X, or all of them with Clear all; Undo brings them back.'],
    },
  ],
  faq: [
    { question: 'I cannot see a course I should be in.', answer: 'DDTC enrols learners in their courses. If a course is missing from My Courses, contact support below or speak to your lecturer.' },
    { question: 'I missed a due date. Can I still send my answer?', answer: 'Only if the lecturer allows late answers for that assignment; the assignment then says so and marks your answer as late. Otherwise ask your lecturer, who can give you an extension.' },
    { question: 'Can I change my answer after I submit it?', answer: 'For an assignment, yes: while it is open you can send a new version, and your lecturer sees every version. For an examination, no: once submitted it is final.' },
    { question: 'Why can I not see my grade yet?', answer: 'Grades appear when your lecturer releases them, not as soon as they mark. You get a notification when a grade is released.' },
    { question: 'My file will not upload.', answer: 'Check its size and type against the limits shown under the upload button. Audio may be MP3, M4A or WAV; documents may be PDF or Word. A file renamed to look like another type is refused.' },
    AUDIO,
    SIGNED_OUT,
    PASSWORD,
    NOTIFICATIONS,
  ],
};

/** @type {HelpContent} */
const LECTURER = {
  intro: 'How to teach on DDTC LMS: courses, lessons, assignments, examinations, grading and announcements.',
  gettingStarted: [
    { title: 'Complete your profile', body: 'Open Profile from the menu and check your name and photo; learners see them on your courses.' },
    { title: 'Open your courses', body: 'My Courses lists the courses you teach. If you may create courses, New course starts one; DDTC may need to approve it before it is published.' },
    { title: 'Add lessons', body: 'In a course, add lessons with text, audio (recorded in the app or uploaded, up to 10 per lesson) and attachments, then publish them when they are ready.' },
    { title: 'Set assignments', body: 'Create an assignment with its due date (Ghana time), instructions in text or audio, and whether late answers are accepted, then publish it.' },
    { title: 'Grade and release', body: 'To grade lists answers waiting for marks. Grade with a score and feedback; learners see a grade only after you release it.' },
  ],
  howTo: [
    {
      title: 'Create and publish a lesson',
      steps: [
        'Open the course, then Lessons, then Add lesson.',
        'Write the lesson text, then add audio: record it in the app or upload an MP3, M4A or WAV file. Add attachments if needed.',
        'Save, then Publish. Learners see only published lessons. Use the up and down arrows on the Lessons tab to change their order.',
      ],
    },
    {
      title: 'Set an assignment',
      steps: [
        'Open the course, then Assignments, then New assignment.',
        'Give it a title, instructions (text, audio or both), a due date and the marks, and choose whether late answers are accepted.',
        'Publish it. To give one learner more time, open the assignment’s answers and set an extension for them.',
      ],
    },
    {
      title: 'Grade answers and release grades',
      steps: [
        'Open To grade, or an assignment’s answers.',
        'Read or listen to the answer, enter a score and feedback, and save.',
        'Release one grade, or every saved grade of the assignment at once. Learners are notified when their grade is released.',
      ],
    },
    {
      title: 'Use the gradebook',
      steps: [
        'Open Gradebooks, or a course’s Gradebook tab.',
        'See every learner’s marks and course grade, grouped by branch if you like, with the class charts.',
        'Enter Local Assembly practical marks in the mark sheet, and download the gradebook as CSV or Excel.',
      ],
    },
    {
      title: 'Run an examination',
      steps: [
        'Open the course, then Examinations, then New examination. Choose its types of question (multiple choice, short answer, essay); each section has one type.',
        'Add the questions and their marks, set when it opens and closes, and publish it.',
        'After it closes, mark the scripts (multiple choice is marked automatically) and release the results.',
      ],
    },
    {
      title: 'Send an announcement',
      steps: ['Open Announcements, choose the course, write the message and send it.', 'Learners see it in their notifications and on the course page, and by email if they receive course emails.'],
    },
  ],
  faq: [
    { question: 'A learner cannot see my lesson or assignment.', answer: 'Check that it is published and that the learner is enrolled in the course. Drafts are visible only to the course’s lecturers.' },
    { question: 'A learner needs more time.', answer: 'Open the assignment’s answers, choose the learner and set an extension. You can take it back, and Undo restores the previous date.' },
    { question: 'I saved a grade but the learner cannot see it.', answer: 'Saved grades are drafts until you release them. Release the grade from the answer or the assignment.' },
    { question: 'I made a mistake in a released grade.', answer: 'Open the answer, change the score or feedback with a reason, and release it again. Every change is kept in the grade history.' },
    { question: 'My recording or upload failed.', answer: 'Check your connection and the limits shown under the upload button, then try again. A recording is kept on the device until it uploads, so it is not lost if the connection drops.' },
    AUDIO,
    SIGNED_OUT,
    PASSWORD,
    NOTIFICATIONS,
  ],
};

/** @param {'learner' | 'lecturer'} role @returns {HelpContent} */
export function helpContent(role) {
  return role === 'lecturer' ? LECTURER : LEARNER;
}

/** The sections, in order, with their anchors (the dashboard card links to each). */
export const HELP_SECTIONS = /** @type {const} */ ([
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'how-to', title: 'How to Use DDTC' },
  { id: 'faq', title: 'Frequently Asked Questions' },
  { id: 'contact', title: 'Contact Support' },
]);

/**
 * A WhatsApp link for a phone number: wa.me needs the international number in digits only. Numbers given in the
 * local Ghana form (0 followed by 9 digits) get Ghana's 233 in place of the 0.
 * @param {string} phone
 */
export function whatsAppLink(phone) {
  let digits = phone.replace(/[^0-9]/g, '');
  if (!phone.trim().startsWith('+') && /^0\d{9}$/.test(digits)) digits = `233${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

/** A tel: link (keeps a leading + and the digits). @param {string} phone */
export function telLink(phone) {
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/[^0-9]/g, '')}`;
}
