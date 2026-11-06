import { lazy } from 'react';
import { RoleShell } from '../RolePage.jsx';

// Course pages under a role (Phase 5): /admin/courses/new, /admin/courses/:courseId/:tab?,
// /lecturer/courses/new, /lecturer/courses/:courseId/:tab?, /learner/courses/:courseId. They sit in
// the role shell with the Courses (administrator) or My Courses (lecturer, learner) item active.

const CourseEditorPage = lazy(() => import('./CourseEditorPage.jsx'));
const CourseWorkspacePage = lazy(() => import('./CourseWorkspacePage.jsx'));
const LearnerCoursePage = lazy(() => import('../learner/LearnerCoursePage.jsx'));

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
