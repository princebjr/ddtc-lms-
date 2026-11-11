import { Copy, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { BranchField } from '@/components/branches/BranchField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { PASSWORD_MIN, PHOTO_TYPES, photoProblem, profileSchema, resetPasswordSchema, validate } from '@/lib/auth/schemas.js';
import { callFunction } from '@/lib/functions.js';
import { formatIdNumber } from '@/lib/id-number.js';
import { NAVIGATION } from '@/lib/navigation.js';
import { limitFor, limitText, useClientSettings } from '@/lib/settings/client-settings.js';
import { getStorage } from '@/lib/storage.js';
import { getSupabase } from '@/lib/supabase.js';

// Profile settings (prototype `prof`; Phase 4): photo through the D18 pipeline, names and contact
// number, a learner's branch (D42), theme, and password. Role, status and email are not editable
// here (D02, D03); the ID number is shown with Copy and never changes (ADR-008).

const ROLE_KEY = /** @type {const} */ ({ ADMIN: 'admin', LECTURER: 'lecturer', LEARNER: 'learner' });

export default function ProfilePage() {
  const auth = useAuth();
  const profile = auth.profile;
  if (!profile) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile settings" description="Your account" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-6">
          <PhotoSection />
          <DetailsForm />
        </Card>
        <div className="flex flex-col gap-6">
          <IdNumberCard idNumber={profile.id_number} />
          <Card className="flex flex-col gap-4">
            <CardTitle>Appearance</CardTitle>
            <ThemeSwitch />
          </Card>
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}

/**
 * The person's own ID number (ADR-008) with Copy. Copy confirms in place (no toast: UI_FEEDBACK
 * lists none for it), and where the browser cannot copy, it says to select the number instead.
 * @param {{ idNumber: number | null | undefined }} props
 */
export function IdNumberCard({ idNumber }) {
  const [note, setNote] = useState('');
  const text = formatIdNumber(idNumber);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied');
    } catch {
      setNote('Copying is not available here. Select the number to copy it.');
    }
  };

  return (
    <Card as="section" className="flex flex-col gap-3" aria-labelledby="id-number-title">
      <CardTitle id="id-number-title">ID number</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <span className="select-all text-title-2 tracking-wide tabular-nums text-ink" data-testid="id-number">
          {text}
        </span>
        <Button variant="outline" onClick={copy} aria-label="Copy ID number" disabled={!text}>
          <Copy aria-hidden="true" />
          Copy
        </Button>
      </div>
      <span role="status" className="text-body-sm text-ink-secondary">
        {note}
      </span>
      <CardDescription>Your DDTC ID number. It never changes; quote it when you contact the DDTC office.</CardDescription>
    </Card>
  );
}

function PhotoSection() {
  const auth = useAuth();
  const toast = useToast();
  const profile = /** @type {NonNullable<typeof auth.profile>} */ (auth.profile);
  const imageUrl = useAvatarUrl(profile.profile_image_file_id);
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'upload' | 'remove'} */ (null));
  const pick = () => input.current?.click();
  const limit = limitFor(useClientSettings(), 'profile_image');

  /** @param {string} reason */
  const rejected = (reason) => toast.show('profile.photo-rejected', { params: { reason }, onAction: pick });

  /** @param {File} file */
  const upload = async (file) => {
    const problem = photoProblem(file, limit.maxBytes);
    if (problem) return rejected(problem);
    setBusy('upload');
    try {
      const reg = await callFunction('register-upload', { resourceType: 'PROFILE_IMAGE', filename: file.name, size: file.size });
      const { bucket, path, token, fileId } = /** @type {{ bucket: string, path: string, token: string, fileId: string }} */ (reg);
      const storage = await getStorage();
      const { error } = await storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw new Error('upload');
      await callFunction('finalize-upload', { fileId });
      await auth.refresh();
      toast.show('profile.photo-updated');
    } catch (error) {
      const message = /** @type {{ code?: string, message?: string }} */ (error);
      rejected(message.code === 'rejected' || message.code === 'too_large' || message.code === 'wrong_type' ? lower(message.message) : 'it could not be uploaded');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy('remove');
    const { error } = await getSupabase().from('profiles').update({ profile_image_file_id: null }).eq('id', profile.id);
    setBusy(null);
    if (error) return toast.show('request.failed', { onAction: remove });
    await auth.refresh();
    toast.show('profile.saved');
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar firstName={profile.first_name} secondName={profile.second_name} imageUrl={imageUrl} size={96} />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 text-headline text-ink">
          {profile.first_name} {profile.second_name}
        </p>
        <p className="m-0 text-body-sm text-ink-secondary">{NAVIGATION[ROLE_KEY[profile.role]].roleLabel}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button variant="outline" onClick={pick} loading={busy === 'upload'} loadingLabel="Uploading photo">
            <Upload aria-hidden="true" />
            Upload photo
          </Button>
          {profile.profile_image_file_id ? (
            <Button variant="ghost" onClick={remove} loading={busy === 'remove'} loadingLabel="Removing photo">
              Remove
            </Button>
          ) : null}
        </div>
        <p className="m-0 text-caption text-ink-tertiary">{`JPG, PNG or WebP${limit.maxBytes ? `, ${limitText(limit)}` : ''}.`}</p>
      </div>
    </div>
  );
}

/** @param {string | undefined} text */
function lower(text) {
  const t = (text ?? 'it could not be checked').replace(/\.$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * Names, contact number and, for learners, their branch (D42). Save changes is enabled once anything
 * differs from what is saved. The database re-checks everything: only learners have a branch, and
 * only an open one.
 */
export function DetailsForm() {
  const auth = useAuth();
  const toast = useToast();
  const profile = /** @type {NonNullable<typeof auth.profile>} */ (auth.profile);
  const isLearner = profile.role === 'LEARNER';
  const savedBranch = profile.branch_id ?? '';
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [pending, setPending] = useState(false);
  const [textChanged, setTextChanged] = useState(false);
  const [branchId, setBranchId] = useState(savedBranch);
  const changed = textChanged || (isLearner && branchId !== savedBranch);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onEdit = (event) => {
    const values = formValues(event.currentTarget);
    const saved = { firstName: profile.first_name, secondName: profile.second_name, contactNumber: profile.contact_number ?? '' };
    setTextChanged(Object.entries(saved).some(([key, value]) => (values[key] ?? '').trim() !== value));
  };

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    const result = validate(profileSchema, formValues(event.currentTarget));
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setPending(true);
    const { error } = await getSupabase()
      .from('profiles')
      .update({
        first_name: result.data.firstName,
        second_name: result.data.secondName,
        contact_number: result.data.contactNumber || null,
        ...(isLearner ? { branch_id: branchId || null } : {}),
      })
      .eq('id', profile.id);
    setPending(false);
    // 22023: the branch is no longer open (closed while the page was open).
    if (error?.code === '22023') return setErrors({ branchId: 'Choose one of the branches' });
    if (error) return toast.show('request.failed');
    await auth.refresh();
    setTextChanged(false);
    toast.show('profile.saved');
  };

  return (
    <form noValidate onSubmit={onSubmit} onChange={onEdit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="First name" name="firstName" autoComplete="given-name" defaultValue={profile.first_name} error={errors.firstName} />
        <FormField label="Second name" name="secondName" autoComplete="family-name" defaultValue={profile.second_name} error={errors.secondName} />
      </div>
      <FormField label="Email address" name="emailShown" type="email" value={profile.email} readOnly hint="Contact the DDTC office to change your email address." />
      <FormField
        label="Contact number (optional)"
        name="contactNumber"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={profile.contact_number ?? ''}
        error={errors.contactNumber}
      />
      {isLearner ? (
        <BranchField
          value={branchId}
          currentId={profile.branch_id}
          onChange={(id) => {
            setBranchId(id);
            setErrors((e) => ({ ...e, branchId: '' }));
          }}
          hint="Your lecturers and administrators can see your branch."
          error={errors.branchId}
        />
      ) : null}
      <div>
        <Button type="submit" disabled={!changed} loading={pending} loadingLabel="Saving">
          Save changes
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage(null);
    const result = validate(resetPasswordSchema, formValues(form));
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setPending(true);
    const { error } = await getSupabase().auth.updateUser({ password: result.data.password });
    setPending(false);
    if (error) return setMessage(authErrorMessage(error, 'reset'));
    form.reset();
    toast.show('account.password-changed');
  };

  return (
    <Card as="section" className="flex flex-col gap-4">
      <CardTitle>Change password</CardTitle>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="New password" name="password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters`} error={errors.password} />
        <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" error={errors.confirmPassword} />
        <FormMessage>{message}</FormMessage>
        <div>
          <Button type="submit" loading={pending} loadingLabel="Saving">
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
