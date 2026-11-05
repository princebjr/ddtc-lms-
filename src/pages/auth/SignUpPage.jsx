import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { GoogleSection } from '@/components/auth/GoogleSection.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { appUrl } from '@/lib/auth/routing.js';
import { PASSWORD_MIN, signUpSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Sign Up (D01; prototype screen "up"): first name, second name, email, password. The database
// makes every new account a LEARNER whatever is sent (Phase 2 trigger). A registered address gets
// exactly the same answer as a new one (D22), so the page always moves on to "Check your email".

export default function SignUpPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    const result = validate(signUpSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { firstName, secondName, email, password } = result.data;
      const { error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          // Names only. The role is never sent and would be ignored by the database.
          data: { first_name: firstName, second_name: secondName },
          emailRedirectTo: appUrl('/auth/confirm?type=signup'),
        },
      });
      if (error && error.code !== 'user_already_exists' && error.code !== 'email_exists') {
        setMessage(authErrorMessage(error, 'sign-up'));
        return;
      }
      navigate('/verify-email', { state: { email } });
    } catch (error) {
      setMessage(authErrorMessage(error, 'sign-up'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Join DDTC LMS as a learner."
      brand
      footer={
        <div className="flex flex-col gap-1 text-center text-body-sm text-ink-secondary">
          <p className="m-0">We will email you a link to verify your address.</p>
          <p className="m-0">
            Already have an account?{' '}
            <Link to="/login" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
              Sign in
            </Link>
          </p>
        </div>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" name="firstName" autoComplete="given-name" autoCapitalize="words" error={errors.firstName} />
          <FormField label="Second name" name="secondName" autoComplete="family-name" autoCapitalize="words" error={errors.secondName} />
        </div>
        <FormField label="Email address" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.org" error={errors.email} />
        <FormField label="Password" name="password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters`} error={errors.password} />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Creating your account">
          Create account
        </Button>
      </form>
      <GoogleSection />
    </AuthLayout>
  );
}
