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

// Add learner (bulk-import-learners with one row) and Provision lecturer (provision-lecturer).
// Both send an invitation email; the person chooses their own password.

const personSchema = z.pick(signUpSchema, { firstName: true, secondName: true, email: true });

/** @param {{ kind: 'learner' | 'lecturer', onClose: () => void, onDone: () => void }} props */
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
      if (lecturer) {
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
          <DialogTitle>{lecturer ? 'Provision lecturer' : 'Add learner'}</DialogTitle>
          <DialogDescription>
            {lecturer
              ? 'An existing account is made a lecturer; a new address gets an invitation email to set a password.'
              : 'They get an invitation email to set a password. Enrolment in courses comes with courses.'}
          </DialogDescription>
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
              {lecturer ? 'Send invitation' : 'Add learner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
