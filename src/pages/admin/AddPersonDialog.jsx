import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { signUpSchema, validate } from '@/lib/auth/schemas.js';
import { callFunction } from '@/lib/functions.js';
import * as z from 'zod/mini';

// Add learner (bulk-import-learners with one row), Provision lecturer (provision-lecturer) and
// Invite administrator (provision-admin, ADR-003). Each sends an invitation email; the person chooses
// their own password. A new administrator must also set up two-step verification at first sign-in.

const personSchema = z.pick(signUpSchema, { firstName: true, secondName: true, email: true });

const TEXT = {
  learner: { title: 'Add learner', body: 'They get an invitation email to set a password. Enrol them in courses from Enrolments.', submit: 'Add learner' },
  lecturer: { title: 'Provision lecturer', body: 'An existing account is made a lecturer; a new address gets an invitation email to set a password.', submit: 'Send invitation' },
  admin: {
    title: 'Invite administrator',
    body: 'They get an invitation email, choose a password, and must set up two-step verification before any admin page opens. They count as an administrator once they accept.',
    submit: 'Send invitation',
  },
};

/** @param {{ kind: 'learner' | 'lecturer' | 'admin', onClose: () => void, onDone: () => void }} props */
export function AddPersonDialog({ kind, onClose, onDone }) {
  const toast = useToast();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const lecturer = kind === 'lecturer';

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    const result = validate(personSchema, formValues(event.currentTarget));
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setPending(true);
    try {
      if (kind === 'admin') {
        await callFunction('provision-admin', result.data);
        toast.show('admin.administrator-invited');
      } else if (lecturer) {
        await callFunction('provision-lecturer', { ...result.data, canCreateCourses: canCreate });
        toast.show('admin.lecturer-invited');
      } else {
        const res = /** @type {{ results: Array<{ status: string, message?: string }> }} */ (
          await callFunction('bulk-import-learners', { rows: [result.data], commit: true })
        );
        const row = res.results[0];
        if (row?.status !== 'created') {
          setMessage(row?.message ?? 'The learner could not be added.');
          return;
        }
        toast.show('admin.learner-added');
      }
      onDone();
      onClose();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TEXT[kind].title}</DialogTitle>
          <DialogDescription>{TEXT[kind].body}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" name="firstName" autoComplete="off" error={errors.firstName} />
            <FormField label="Second name" name="secondName" autoComplete="off" error={errors.secondName} />
          </div>
          <FormField label="Email address" name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} error={errors.email} />
          {lecturer ? (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="new-lecturer-create">Can create courses</Label>
              <Switch id="new-lecturer-create" checked={canCreate} onCheckedChange={setCanCreate} />
            </div>
          ) : null}
          <FormMessage>{message}</FormMessage>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingLabel="Sending invitation">
              {TEXT[kind].submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
