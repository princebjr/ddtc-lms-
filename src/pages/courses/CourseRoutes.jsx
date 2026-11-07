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
