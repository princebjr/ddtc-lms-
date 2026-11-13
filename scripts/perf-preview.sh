#!/usr/bin/env sh
# Builds the app against the running local Supabase (address and public key read live, never a stale .env)
# and serves it on http://127.0.0.1:4173 for tests/perf/baseline.mjs. Local only.
set -e
ENVS=$(npx supabase status -o env 2>/dev/null)
export VITE_SUPABASE_URL=$(echo "$ENVS" | grep '^API_URL=' | cut -d'"' -f2)
export VITE_SUPABASE_ANON_KEY=$(echo "$ENVS" | grep '^ANON_KEY=' | cut -d'"' -f2)
npx vite build --outDir dist-perf --emptyOutDir
exec npx vite preview --outDir dist-perf --host 127.0.0.1 --port 4173 --strictPort
