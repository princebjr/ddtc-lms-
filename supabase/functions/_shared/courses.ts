// Course rights checked on the server for course files (D06): an administrator, or an ACTIVE
// lecturer who currently teaches the course. Archived courses are read-only (D07).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { HttpError } from './http.ts';

export async function requireCourseEditor(admin: SupabaseClient, userId: string, isAdmin: boolean, courseId: string) {
  const { data: course } = await admin.from('courses').select('status').eq('id', courseId).maybeSingle();
  if (!course) throw new HttpError(404, 'not_found', 'Course not found');
  if (course.status === 'ARCHIVED') throw new HttpError(409, 'archived', 'This course is archived');
  if (isAdmin) return;
  const { data: teaching } = await admin
    .from('course_lecturers')
    .select('id, profiles!course_lecturers_lecturer_id_fkey(role, account_status)')
    .eq('course_id', courseId)
    .eq('lecturer_id', userId)
    .is('removed_at', null)
    .maybeSingle();
  const person = teaching?.profiles as { role?: string; account_status?: string } | null | undefined;
  if (!teaching || person?.role !== 'LECTURER' || person?.account_status !== 'ACTIVE') {
    throw new HttpError(403, 'forbidden', 'Only the course lecturers can change the cover');
  }
}
