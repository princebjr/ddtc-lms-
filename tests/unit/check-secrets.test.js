import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { isServiceRoleJwt, scanDirectory, scanFiles } from '../../scripts/check-secrets.mjs';

// Fixture strings are assembled at runtime so this file never contains a literal secret.
const ROLE = ['service', 'role'].join('_');
/** @param {object} payload */
const fakeJwt = (payload) =>
  [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'c2lnbmF0dXJlLW5vdC1yZWFs',
  ].join('.');
const SERVICE_JWT = fakeJwt({ iss: 'supabase-demo', role: ROLE, exp: 1 });
const ANON_JWT = fakeJwt({ iss: 'supabase-demo', role: 'anon', exp: 1 });
const SCRIPT = path.resolve('scripts/check-secrets.mjs');

/** @type {string[]} */
const tempDirs = [];
/** @param {Record<string, string>} files */
function tempRepo(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ddtc-scan-'));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(/** @type {string} */ (tempDirs.pop()), { recursive: true, force: true });
});

describe('isServiceRoleJwt', () => {
  it('detects a JWT carrying the service role claim', () => {
    expect(isServiceRoleJwt(SERVICE_JWT)).toBe(true);
  });
  it('ignores an anon JWT and malformed tokens', () => {
    expect(isServiceRoleJwt(ANON_JWT)).toBe(false);
    expect(isServiceRoleJwt('eyJnot.eyJvalid.x')).toBe(false);
  });
});

describe('scanFiles', () => {
  it('passes a clean source file', () => {
    expect(scanFiles([{ path: 'src/main.js', content: "export const x = 'DDTC LMS';" }])).toEqual([]);
  });

  it.each([
    ['upper-case constant', `const key = import.meta.env.SUPABASE_${ROLE.toUpperCase()}_KEY;`],
    ['lower-case text', `// uses the ${ROLE} key`],
    ['hyphenated text', '// service-role client'],
  ])('fails on service-role text under src/ (%s)', (_label, content) => {
    const findings = scanFiles([{ path: 'src/lib/client.js', content }]);
    expect(findings.map((f) => f.rule)).toContain('service-role-text-in-src');
  });

  it('allows service-role text outside src/ (documentation)', () => {
    const findings = scanFiles([{ path: 'docs/SECURITY.md', content: `The ${ROLE} key lives in Edge Functions.` }]);
    expect(findings).toEqual([]);
  });

  it('fails on a service-role JWT anywhere and reports the line', () => {
    const findings = scanFiles([{ path: 'supabase/functions/x/index.ts', content: `ok\nconst k = "${SERVICE_JWT}";` }]);
    expect(findings).toEqual([expect.objectContaining({ rule: 'service-role-jwt', line: 2 })]);
  });

  it('does not flag the public anon JWT', () => {
    expect(scanFiles([{ path: '.env.example', content: `VITE_SUPABASE_ANON_KEY=${ANON_JWT}` }])).toEqual([]);
  });

  it('fails on a Supabase secret API key', () => {
    const key = ['sb', 'secret', 'abcdefghijklmnop1234'].join('_');
    expect(scanFiles([{ path: 'config.js', content: `const k = '${key}';` }]).map((f) => f.rule)).toEqual(['supabase-secret-key']);
  });

  it.each(['SERVICE_KEY', 'SECRET', 'PRIVATE_TOKEN', 'ADMIN_PASSWORD'])('fails on a secret-looking VITE_ variable (%s)', (name) => {
    const findings = scanFiles([{ path: '.env.production', content: `VITE_${name}=x` }]);
    expect(findings.map((f) => f.rule)).toContain('secret-in-vite-variable');
  });

  it('never includes the matched secret in a finding', () => {
    const findings = scanFiles([{ path: 'src/a.js', content: `const k = "${SERVICE_JWT}";` }]);
    expect(JSON.stringify(findings)).not.toContain(SERVICE_JWT);
  });
});

describe('scanDirectory and CLI', () => {
  it('passes a clean tree', () => {
    const dir = tempRepo({ 'src/main.js': 'export {};', 'README.md': '# ok' });
    expect(scanDirectory(dir).findings).toEqual([]);
  });

  it('exits 1 when a fake service-role string is added under src/', () => {
    const dir = tempRepo({ 'src/leak.js': `export const k = "${SERVICE_JWT}"; // ${ROLE}` });
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('src/leak.js:1');
    expect(run.stderr).not.toContain(SERVICE_JWT);
  });

  it('exits 0 on a clean tree', () => {
    const dir = tempRepo({ 'src/main.js': 'export {};' });
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(run.status).toBe(0);
  });

  it('skips node_modules', () => {
    const dir = tempRepo({ 'node_modules/pkg/index.js': `// ${SERVICE_JWT}`, 'src/main.js': 'export {};' });
    expect(scanDirectory(dir).findings).toEqual([]);
  });
});
