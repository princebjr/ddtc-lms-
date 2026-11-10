import { lazy } from 'react';
import { RoleShell } from '../RolePage.jsx';

// Course pages under a role (Phase 5): /admin/courses/new, /admin/courses/:courseId/:tab?,
// /lecturer/courses/new, /lecturer/courses/:courseId/:tab?, /learner/courses/:courseId, and (Phase 6)
// /:role/courses/:courseId/lessons/:lessonId for the lesson editor and the learner's lesson, and (Phase
// 7) /:role/courses/:courseId/assignments/:assignmentId for the assignment editor and the learner's assignment. They sit in
// the role shell with the Courses (administrator) or My Courses (lecturer, learner) item active.

const CourseEditorPage = lazy(() => import('./CourseEditorPage.jsx'));
const CourseWorkspacePage = lazy(() => import('./CourseWorkspacePage.jsx'));
const LearnerCoursePage = lazy(() => import('../learner/LearnerCoursePage.jsx'));
const LessonEditorPage = lazy(() => import('./LessonEditorPage.jsx'));
const LearnerLessonPage = lazy(() => import('../learner/LearnerLessonPage.jsx'));
const AssignmentEditorPage = lazy(() => import('./AssignmentEditorPage.jsx'));
const LearnerAssignmentPage = lazy(() => import('../learner/LearnerAssignmentPage.jsx'));
const LearnerCourseGradesPage = lazy(() => import('../learner/LearnerCourseGradesPage.jsx'));
const ExamEditorPage = lazy(() => import('./ExamEditorPage.jsx'));
const ExamResultsPage = lazy(() => import('./ExamResultsPage.jsx'));
const ExamScriptPage = lazy(() => import('./ExamScriptPage.jsx'));
const LearnerExamPage = lazy(() => import('../learner/LearnerExamPage.jsx'));
const AssignmentSubmissionsPage = lazy(() => import('./AssignmentSubmissionsPage.jsx'));
const SubmissionViewPage = lazy(() => import('./SubmissionViewPage.jsx'));

export const AdminNewCourse = () => (
  <RoleShell role="admin" slug="courses">
    <CourseEditorPage role="admin" />
  </RoleShell>
);
export const AdminCourse = () => (
  <RoleShell role="admin" slug="courses">
    <CourseWorkspacePage role="admin" />
  </RoleShell>
);
export const LecturerNewCourse = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <CourseEditorPage role="lecturer" />
  </RoleShell>
);
export const LecturerCourse = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <CourseWorkspacePage role="lecturer" />
  </RoleShell>
);
export const LearnerCourse = () => (
  <RoleShell role="learner" slug="my-courses">
    <LearnerCoursePage />
  </RoleShell>
);
export const AdminLesson = () => (
  <RoleShell role="admin" slug="courses">
    <LessonEditorPage role="admin" />
  </RoleShell>
);
export const LecturerLesson = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <LessonEditorPage role="lecturer" />
  </RoleShell>
);
export const LearnerLesson = () => (
  <RoleShell role="learner" slug="my-courses">
    <LearnerLessonPage />
  </RoleShell>
);
export const AdminAssignment = () => (
  <RoleShell role="admin" slug="courses">
    <AssignmentEditorPage role="admin" />
  </RoleShell>
);
export const LecturerAssignment = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <AssignmentEditorPage role="lecturer" />
  </RoleShell>
);
export const LearnerAssignment = () => (
  <RoleShell role="learner" slug="assignments">
    <LearnerAssignmentPage />
  </RoleShell>
);
// Phase 8: an assignment's submissions and one learner's answer, for lecturers and administrators.
export const AdminSubmissions = () => (
  <RoleShell role="admin" slug="courses">
    <AssignmentSubmissionsPage role="admin" />
  </RoleShell>
);
export const LecturerSubmissions = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <AssignmentSubmissionsPage role="lecturer" />
  </RoleShell>
);
export const AdminSubmission = () => (
  <RoleShell role="admin" slug="courses">
    <SubmissionViewPage role="admin" />
  </RoleShell>
);
export const LecturerSubmission = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <SubmissionViewPage role="lecturer" />
  </RoleShell>
);
// Phase 10 (owner request 2026-11-10): the learner's gradebook for one course, under Grades.
export const LearnerCourseGrades = () => (
  <RoleShell role="learner" slug="grades">
    <LearnerCourseGradesPage />
  </RoleShell>
);
// Phase 10.1 (ADR-016): examinations: the editor, the results and a learner's script for the course's
// lecturers and administrators; the learner's examination page.
export const AdminExam = () => (
  <RoleShell role="admin" slug="courses">
    <ExamEditorPage role="admin" />
  </RoleShell>
);
export const AdminExamResults = () => (
  <RoleShell role="admin" slug="courses">
    <ExamResultsPage role="admin" />
  </RoleShell>
);
export const AdminExamScript = () => (
  <RoleShell role="admin" slug="courses">
    <ExamScriptPage role="admin" />
  </RoleShell>
);
export const LecturerExam = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <ExamEditorPage role="lecturer" />
  </RoleShell>
);
export const LecturerExamResults = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <ExamResultsPage role="lecturer" />
  </RoleShell>
);
export const LecturerExamScript = () => (
  <RoleShell role="lecturer" slug="my-courses">
    <ExamScriptPage role="lecturer" />
  </RoleShell>
);
export const LearnerExam = () => (
  <RoleShell role="learner" slug="my-courses">
    <LearnerExamPage />
  </RoleShell>
);
