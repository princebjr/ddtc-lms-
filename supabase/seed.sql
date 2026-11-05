-- Local development and CI seed only (supabase db reset). Never run against staging or production:
-- `supabase db push` does not seed. Accounts use the reserved .test domain so no real mailbox is
-- ever contacted. Shared local password for every seed account: DdtcLocal-2026
--
-- Accounts are created through auth.users, so the real sign-up trigger makes each one a LEARNER;
-- roles are then applied by the trusted path (as set-user-role will do in Phase 4), which audits.
-- The administrator still needs TOTP enrolment (Phase 3) before any AAL2-only screen works.

do $$
declare
  v_people jsonb := '[
    {"email":"admin@ddtc.test",     "first":"Prince",  "second":"Boateng", "role":"ADMIN"},
    {"email":"lecturer1@ddtc.test", "first":"Sarah",   "second":"Ofori",   "role":"LECTURER", "can_create":true},
    {"email":"lecturer2@ddtc.test", "first":"Daniel",  "second":"Mensah",  "role":"LECTURER", "can_create":false},
    {"email":"learner1@ddtc.test",  "first":"Ama",     "second":"Asante",  "role":"LEARNER"},
    {"email":"learner2@ddtc.test",  "first":"Kwame",   "second":"Owusu",   "role":"LEARNER"},
    {"email":"learner3@ddtc.test",  "first":"Esi",     "second":"Addo",    "role":"LEARNER"}
  ]';
  v_person jsonb;
  v_id uuid;
begin
  for v_person in select * from jsonb_array_elements(v_people) loop
    v_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_person ->> 'email', extensions.crypt('DdtcLocal-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('first_name', v_person ->> 'first', 'second_name', v_person ->> 'second'),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_person ->> 'email', 'email_verified', true),
      now(), now(), now()
    );

    if v_person ->> 'role' <> 'LEARNER' then
      update public.profiles
         set role = (v_person ->> 'role')::public.user_role,
             can_create_courses = coalesce((v_person ->> 'can_create')::boolean, false)
       where id = v_id;
    end if;
  end loop;
end;
$$;
