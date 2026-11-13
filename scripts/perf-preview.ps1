# Builds the app against the running local Supabase (address and public key read live, never a stale .env) and
# serves it on http://127.0.0.1:4173 for tests/perf/baseline.mjs. Local only. Run from PowerShell in C:\dev\ddtc-lms:
# building from Git Bash (/c/dev/...) gives the same files two names (c: and C:), React is bundled twice and the
# app fails at start ("Cannot read properties of null (reading 'useState')").
Set-Location C:\dev\ddtc-lms
$envs = npx supabase status -o env 2>$null
$env:VITE_SUPABASE_URL = (($envs | Select-String '^API_URL=') -replace '^API_URL="?([^"]*)"?$', '$1')
$env:VITE_SUPABASE_ANON_KEY = (($envs | Select-String '^ANON_KEY=') -replace '^ANON_KEY="?([^"]*)"?$', '$1')
npx vite build --outDir dist-perf --emptyOutDir
npx vite preview --outDir dist-perf --host 127.0.0.1 --port 4173 --strictPort
