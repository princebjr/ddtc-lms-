// Creating accounts for provisioning and import. New accounts get an invitation email; the link
// lands on /auth/confirm?type=invite, where the person chooses a password. The sign-up trigger
// makes every new account a LEARNER; any other role is applied afterwards by admin_set_user.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { z } from 'npm:zod@4.6.7';

export const Person = z.object({
  firstName: z.string().trim().min(1, 'First name is missing').max(100, 'First name is too long'),
  secondName: z.string().trim().min(1, 'Second name is missing').max(100, 'Second name is too long'),
  email: z.string().trim().toLowerCase().email('Email address is not valid').max(320),
});
export type PersonInput = z.infer<typeof Person>;

/** Finds an existing profile by email (case-insensitive). */
export async function findByEmail(admin: SupabaseClient, email: string) {
  const { data } = await admin.from('profiles').select('id, role, account_status').ilike('email', email).maybeSingle();
  return data as { id: string; role: string; account_status: string } | null;
}

/** Invites a new person; returns their user id. */
export async function invite(admin: SupabaseClient, person: PersonInput, origin: string | null): Promise<string> {
  const redirectTo = origin ? `${origin}/auth/confirm?type=invite` : undefined;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(person.email, {
    data: { first_name: person.firstName, second_name: person.secondName },
    redirectTo,
  });
  if (error || !data.user) throw error ?? new Error('Invitation failed');
  return data.user.id;
}

/** Writes an audit record for the acting administrator (service role may insert). */
export async function audit(admin: SupabaseClient, actor: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  await admin.from('audit_logs').insert({ actor_id: actor, action, entity_type: entityType, entity_id: entityId, metadata });
}
