-- Phase 7, migration 22: grade categories, assignments, their snapshots and learner extensions, the
-- assignment-instructions-audio bucket, and their access rules (DATA_MODEL.md sections 5 and 6; D07,
-- D12, D13, D17, D18, D25, D29, ADR-009). Clients never write these tables: manage-assignments
-- (which cleans the instruction HTML) and finalize-upload do, through the trusted functions in
-- migration 23. Learners read published assignments of the courses they are enrolled in.

create type public.assignment_content_type as enum ('TEXT', 'AUDIO', 'TEXT_AND_AUDIO');

-- ---------------------------------------------------------------- helpers
/** Administrators (AAL2) and the course's active lecturers manage its assignments. */
create function private.can_manage_course(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or private.is_lecturer_of(p_course);
$$;

/**
 * Answer formats (ADR-009): always TEXT and AUDIO, optionally PDF and DOCX, no repeats.
 */
create function private.valid_formats(p text[]) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and p @> array['TEXT', 'AUDIO']
     and p <@ array['TEXT', 'AUDIO', 'PDF', 'DOCX']
     and cardinality(p) = (select count(distinct x) from unnest(p) x);
$$;

/** Whether instruction HTML has visible text (tags and spaces alone do not count). */
create function private.has_visible_text(p_html text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(regexp_replace(p_html, '<[^>]*>|&nbsp;', '', 'g'), '') ~ '[^[:space:]]';
$$;

revoke execute on function private.can_manage_course(uuid), private.valid_formats(text[]), private.has_visible_text(text) from public;
grant execute on function private.can_manage_course(uuid), private.valid_formats(text[]), private.has_visible_text(text) to authenticated, service_role;

-- ---------------------------------------------------------------- grade categories (D12)
create table public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  weight integer not null check (weight between 0 and 100),
  position integer not null check (position > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One name per course among current categories, capital letters aside; deferrable so a save can
  -- swap two names in one transaction.
  constraint grade_categories_course_name
    exclude using btree (course_id with =, (lower(btrim(name))) with =) where (archived_at is null) deferrable initially immediate
);
create index grade_categories_course_idx on public.grade_categories (course_id, position);

create trigger grade_categories_set_updated_at
  before update on public.grade_categories
  for each row execute function private.set_updated_at();

-- Every course starts with one category, Assignments, weighted 100 (D12); existing courses too.
create function private.add_default_category() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.grade_categories (course_id, name, weight, position) values (new.id, 'Assignments', 100, 1);
  return new;
end;
$$;
revoke execute on function private.add_default_category() from public;

create trigger courses_add_default_category
  after insert on public.courses
  for each row execute function private.add_default_category();

insert into public.grade_categories (course_id, name, weight, position)
select c.id, 'Assignments', 100, 1 from public.courses c
 where not exists (select 1 from public.grade_categories g where g.course_id = c.id);

/**
 * The total weight of a course's current categories, for the editor. Runs with the caller's rights,
 * so the category access rules apply (someone who cannot see the course gets 0).
 */
create function public.course_weight_total(p_course uuid) returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(weight)::int, 0) from public.grade_categories where course_id = p_course and archived_at is null;
$$;
revoke execute on function public.course_weight_total(uuid) from public, anon;
grant execute on function public.course_weight_total(uuid) to authenticated, service_role;

/**
 * Exit gate of Phase 7: grades are released only when the course's current category weights total
 * exactly 100 (D12). The release functions of Phase 9 call this first.
 */
create function private.require_weights_total_100(p_course uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select sum(weight) from public.grade_categories where course_id = p_course and archived_at is null), 0) <> 100 then
    raise exception 'Category weights must total 100 before grades can be released' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.require_weights_total_100(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- assignments
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  lesson_id uuid references public.lessons (id) on delete restrict,
  category_id uuid not null references public.grade_categories (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  content_type public.assignment_content_type not null,
  -- HTML cleaned by manage-assignments against the lesson allow-list; checked again here.
  text_instructions text not null default '' check (
    char_length(text_instructions) <= 200000
    and text_instructions !~* '<\s*/?\s*(script|iframe|frame|object|embed|style|form|input|button|textarea|select|link|meta|base|svg|math)(\s|/|>)'
    and text_instructions !~* '<[^>]*\son[a-z]+\s*='
    and text_instructions !~* '<[^>]*=\s*["'']?\s*(javascript|vbscript|data)\s*:'
  ),
  instruction_audio_file_id uuid references public.file_objects (id) on delete restrict,
  due_at timestamptz not null,
  allow_late boolean not null default false,
  max_marks numeric(7, 2) not null check (max_marks > 0 and max_marks <= 10000),
  accepted_formats text[] not null default array['TEXT', 'AUDIO'] check (private.valid_formats(accepted_formats)),
  grading_criteria text not null default '' check (char_length(grading_criteria) <= 5000),
  publication_status public.publication_status not null default 'DRAFT',
  created_by uuid not null references public.profiles (id) on delete restrict,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Instruction types (BUILD_PLAN Phase 7): a published assignment has what its type needs. A draft
  -- may wait for its audio, which is uploaded once the draft exists.
  constraint assignments_instructions_match_type check (
    publication_status <> 'PUBLISHED'
    or (content_type = 'TEXT' and private.has_visible_text(text_instructions))
    or (content_type = 'AUDIO' and instruction_audio_file_id is not null)
    or (content_type = 'TEXT_AND_AUDIO' and private.has_visible_text(text_instructions) and instruction_audio_file_id is not null)
  ),
  constraint assignments_published_has_time check (publication_status <> 'PUBLISHED' or published_at is not null)
);
create index assignments_course_idx on public.assignments (course_id, due_at);

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function private.set_updated_at();

-- Same-course rules: the category (current) and the lesson belong to the assignment's course, the
-- instruction audio is a validated instruction file of this assignment, and the course never changes.
create function private.assignments_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'An assignment cannot move to another course' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.grade_categories g where g.id = new.category_id and g.course_id = new.course_id and g.archived_at is null) then
    raise exception 'Choose a category of this course' using errcode = '22023';
  end if;
  if new.lesson_id is not null and (tg_op = 'INSERT' or new.lesson_id is distinct from old.lesson_id)
     and not exists (select 1 from public.lessons l where l.id = new.lesson_id and l.course_id = new.course_id) then
    raise exception 'Choose a lesson of this course' using errcode = '22023';
  end if;
  if new.instruction_audio_file_id is not null and (tg_op = 'INSERT' or new.instruction_audio_file_id is distinct from old.instruction_audio_file_id)
     and not exists (
       select 1 from public.file_objects f
        where f.id = new.instruction_audio_file_id and f.status = 'VALIDATED'
          and f.resource_type = 'ASSIGNMENT_INSTRUCTION_AUDIO' and f.resource_id = new.id
     ) then
    raise exception 'The instruction audio must be a validated audio file of this assignment' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger assignments_guard
  before insert or update on public.assignments
  for each row execute function private.assignments_guard();

-- ---------------------------------------------------------------- snapshots (D29)
create table public.assignment_versions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  content_type public.assignment_content_type not null,
  text_instructions text not null,
  instruction_audio_file_id uuid references public.file_objects (id) on delete restrict,
  due_at timestamptz not null,
  max_marks numeric(7, 2) not null,
  accepted_formats text[] not null,
  grading_criteria text not null,
  category_id uuid not null references public.grade_categories (id) on delete restrict,
  allow_late boolean not null,
  changed_by uuid not null references public.profiles (id) on delete restrict,
  change_reason text check (change_reason is null or char_length(change_reason) <= 1000),
  created_at timestamptz not null default now(),
  constraint assignment_versions_number_key unique (assignment_id, version_number)
);

-- ---------------------------------------------------------------- extensions (D10, D13)
create table public.submission_extensions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete restrict,
  learner_id uuid not null references public.profiles (id) on delete restrict,
  extended_due_at timestamptz not null,
  granted_by uuid not null references public.profiles (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_extensions_assignment_learner_key unique (assignment_id, learner_id)
);
create index submission_extensions_learner_idx on public.submission_extensions (learner_id);

create trigger submission_extensions_set_updated_at
  before update on public.submission_extensions
  for each row execute function private.set_updated_at();

/** D13: the learner's extension when they have one, otherwise the assignment's due date. */
create function private.effective_due_at(p_assignment uuid, p_learner uuid) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select x.extended_due_at from public.submission_extensions x where x.assignment_id = p_assignment and x.learner_id = p_learner),
    (select a.due_at from public.assignments a where a.id = p_assignment));
$$;
revoke execute on function private.effective_due_at(uuid, uuid) from public, anon, authenticated;
grant execute on function private.effective_due_at(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- who may see an assignment
/** Its course's managers, and learners enrolled (ACTIVE or COMPLETED) once it is published and current. */
create function private.can_see_assignment(p_assignment uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
     where a.id = p_assignment
       and (private.can_manage_course(a.course_id)
            or (a.publication_status = 'PUBLISHED' and a.archived_at is null and private.can_see_course(a.course_id)))
  );
$$;

/**
 * Storage rule for assignment-instructions-audio (D19): a VALIDATED instruction file, read by the
 * course's managers (replaced and draft files included), or by a learner who may see the assignment
 * when the file is its current instruction audio.
 */
create function private.can_read_instruction_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
      join public.assignments a on a.id = f.resource_id
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
       and f.resource_type = 'ASSIGNMENT_INSTRUCTION_AUDIO'
       and (private.can_manage_course(a.course_id)
            or (a.instruction_audio_file_id = f.id and a.publication_status = 'PUBLISHED' and a.archived_at is null
                and private.can_see_course(a.course_id)))
  );
$$;

revoke execute on function private.can_see_assignment(uuid), private.can_read_instruction_object(text, text) from public;
grant execute on function private.can_see_assignment(uuid), private.can_read_instruction_object(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- privileges and policies
alter table public.grade_categories enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_versions enable row level security;
alter table public.submission_extensions enable row level security;

revoke all on public.grade_categories, public.assignments, public.assignment_versions, public.submission_extensions from anon, authenticated;
grant select on public.grade_categories, public.assignments, public.assignment_versions, public.submission_extensions to authenticated;
grant select, insert, update on public.grade_categories, public.assignments, public.assignment_versions, public.submission_extensions to service_role;

create policy grade_categories_select on public.grade_categories
  for select to authenticated using ((select private.can_see_course(course_id)));

create policy assignments_select on public.assignments
  for select to authenticated
  using (
    (select private.can_manage_course(course_id))
    or (publication_status = 'PUBLISHED' and archived_at is null and (select private.can_see_course(course_id)))
  );

create policy assignment_versions_select_managers on public.assignment_versions
  for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and (select private.can_manage_course(a.course_id))));

create policy submission_extensions_select_own on public.submission_extensions
  for select to authenticated using (learner_id = (select auth.uid()) and (select private.is_active_user()));
create policy submission_extensions_select_managers on public.submission_extensions
  for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and (select private.can_manage_course(a.course_id))));

-- ---------------------------------------------------------------- the instruction audio's facts
-- file_objects shows people only their own uploads, so learners get an assignment's current
-- instruction audio here, and only for assignments they may see. Paths are then signed with the
-- user's own session (D19); Storage checks again.
create function public.assignment_media(p_assignment uuid)
returns table (
  file_object_id uuid, bucket_name text, storage_path text, safe_download_filename text, mime_type text,
  file_size bigint, duration_seconds numeric, waveform_peaks real[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.bucket_name, f.storage_path, f.safe_download_filename, f.detected_mime_type, f.file_size, f.duration_seconds, f.waveform_peaks
    from public.assignments a
    join public.file_objects f on f.id = a.instruction_audio_file_id and f.status = 'VALIDATED'
   where a.id = p_assignment and private.can_see_assignment(p_assignment);
$$;
revoke execute on function public.assignment_media(uuid) from public, anon;
grant execute on function public.assignment_media(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- bucket (D17)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assignment-instructions-audio', 'assignment-instructions-audio', false, 26214400, array['audio/mpeg', 'audio/mp4', 'audio/wav']);

create policy assignment_instructions_audio_read on storage.objects
  for select to authenticated
  using (bucket_id = 'assignment-instructions-audio' and (select private.is_active_user()) and private.can_read_instruction_object(bucket_id, name));
