import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { FormSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { validate } from '@/lib/auth/schemas.js';
import { createCourse, fetchActiveLecturers, transitionCourse } from '@/lib/courses/courses.js';
import { courseSchema } from '@/lib/courses/schemas.js';

// New course (prototype `lnew`). A lecturer with course creation creates a course they own; an
// administrator chooses the lecturer who will own it (ADR-005 decision, 2026-11-06). The course is
// saved as a draft, then optionally submitted (lecturer) or published (administrator) at once.
// The cover image is added on the course's Overview tab once the course exists.

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function CourseEditorPage({ role }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const admin = role === 'admin';
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'draft' | 'submit'} */ (null));
  const [ownerId, setOwnerId] = useState('');
  const lecturers = useLoad(() => (admin ? fetchActiveLecturers() : Promise.resolve([])), [admin]);
  const direct = Boolean(auth.profile?.can_publish_directly);

  /** @param {HTMLFormElement} form @param {'draft' | 'submit'} mode */
  const save = async (form, mode) => {
    setMessage(null);
    const result = validate(courseSchema, formValues(form));
    /** @type {Record<string, string>} */
    const nextErrors = result.ok ? {} : { ...result.errors };
    if (admin && !ownerId) nextErrors.owner = 'Choose the lecturer who will own the course';
    if (!result.ok || Object.keys(nextErrors).length) return setErrors(nextErrors);
    setErrors({});
    setBusy(mode);
    try {
      const id = await createCourse({ ...result.data, ...(admin ? { ownerId } : {}) });
      if (mode === 'draft') {
        toast.show('lecturer.draft-saved');
      } else {
        const status = await transitionCourse(id, admin ? 'publish' : 'submit');
        toast.show(admin ? 'admin.course-approved' : status === 'PUBLISHED' ? 'lecturer.course-published' : 'lecturer.submitted-for-approval');
      }
      navigate(`/${role}/courses/${id}`, { replace: true });
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!admin && !auth.profile?.can_create_courses) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New course" />
        <ErrorState title="You cannot create courses yet" description="An administrator can allow you to create courses." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New course" description={admin ? 'Create a course for a lecturer' : 'Describe your course'} />
      <LoadingRegion loading={lecturers.state === 'loading'} skeleton={<FormSkeleton fields={5} />} onRetry={lecturers.reload}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save(e.currentTarget, 'draft');
          }}
          className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        >
          <Card className="flex flex-col gap-4 lg:col-span-2">
            <FormField label="Course title" name="title" placeholder="e.g. Introduction to Biblical Studies" autoComplete="off" error={errors.title} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Course code" name="courseCode" placeholder="BIB101" autoComplete="off" autoCapitalize="characters" spellCheck={false} error={errors.courseCode} />
              <FormField label="Category" name="category" placeholder="Biblical Studies" autoComplete="off" error={errors.category} />
            </div>
            <TextArea label="Description" name="description" placeholder="Describe what learners will study" error={errors.description} />
            <TextArea label="Learning objectives" name="learningObjectives" placeholder="One objective per line" error={errors.learningObjectives} />
            {admin ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="course-owner">Owner (lecturer)</Label>
                <Select value={ownerId || undefined} onValueChange={setOwnerId}>
                  <SelectTrigger id="course-owner" aria-label="Owner (lecturer)" aria-invalid={errors.owner ? true : undefined} aria-describedby={errors.owner ? 'course-owner-error' : undefined}>
                    <SelectValue placeholder="Choose a lecturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lecturers.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.first_name} {l.second_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.owner ? (
                  <p id="course-owner-error" className="m-0 text-body-sm text-error">
                    {errors.owner}
                  </p>
                ) : null}
              </div>
            ) : null}
            <FormMessage>{message}</FormMessage>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="submit" variant="outline" loading={busy === 'draft'} loadingLabel="Saving" disabled={busy !== null}>
                Save draft
              </Button>
              <Button
                type="button"
                loading={busy === 'submit'}
                loadingLabel={admin || direct ? 'Publishing' : 'Submitting'}
                disabled={busy !== null}
                onClick={(e) => {
                  const form = e.currentTarget.form;
                  if (form) save(form, 'submit');
                }}
              >
                {admin || direct ? 'Publish' : 'Submit for approval'}
              </Button>
            </div>
          </Card>
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-2">
              <CardTitle>Course status</CardTitle>
              <span>
                <StatusChip>Draft</StatusChip>
              </span>
              <CardDescription>
                {admin
                  ? 'Publishing makes the course visible to the learners you enrol.'
                  : direct
                    ? 'You may publish directly: enrolled learners see the course as soon as you publish it.'
                    : 'Administrator approval is required before learners can see this course.'}
              </CardDescription>
            </Card>
            <Card className="flex flex-col gap-2">
              <CardTitle>Enrolment</CardTitle>
              <CardDescription>Learners are enrolled by an administrator.</CardDescription>
            </Card>
            <Card className="flex flex-col gap-2">
              <CardTitle>Cover image</CardTitle>
              <CardDescription>Add a cover on the course's Overview once it is saved. JPG, PNG or WebP, up to 2 MB.</CardDescription>
            </Card>
          </div>
        </form>
      </LoadingRegion>
    </div>
  );
}

/** A labelled textarea with an inline error. @param {{ label: string, name: string, placeholder?: string, error?: string, defaultValue?: string, disabled?: boolean }} props */
export function TextArea({ label, name, placeholder, error, defaultValue, disabled }) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        rows={4}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="m-0 text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
