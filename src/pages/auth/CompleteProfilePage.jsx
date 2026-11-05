import { useState } from 'react';
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { completeProfileSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Complete your profile (D27 item 3; prototype screen "cp"): shown before any dashboard when
// Google did not share both names. The database derives profile_completed from the names.

export default function CompleteProfilePage() {
  const auth = useAuth();
  const toast = useToast();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);
  const profile = auth.profile;

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!profile) return;
    setMessage(null);
    const result = validate(completeProfileSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ first_name: result.data.firstName, second_name: result.data.secondName })
        .eq('id', profile.id);
      if (error) {
        setMessage(authErrorMessage(error, 'profile'));
        return;
      }
      toast.show('profile.saved');
      await auth.refresh();
    } catch (error) {
      setMessage(authErrorMessage(error, 'profile'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Complete your profile" description="Google did not share your full name. Add it to continue.">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="First name" name="firstName" autoComplete="given-name" autoCapitalize="words" defaultValue={profile?.first_name ?? ''} error={errors.firstName} />
        <FormField label="Second name" name="secondName" autoComplete="family-name" autoCapitalize="words" defaultValue={profile?.second_name ?? ''} error={errors.secondName} />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Saving">
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
