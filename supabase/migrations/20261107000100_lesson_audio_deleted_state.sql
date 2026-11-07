-- Phase 6, migration 19 (ADR-007, owner decision 2026-11-07): a DELETED state for lesson audio.
-- On its own because a new enum value cannot be used in the transaction that adds it; migration 20
-- uses it.
alter type public.audio_lifecycle add value 'DELETED';
