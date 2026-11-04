#!/usr/bin/env node
// DDTC LMS secret guard (CLAUDE.md section 3, BUILD_PLAN section 9).
// Fails when:
//   1. any "service role" text appears under src/
//   2. a JWT whose payload role is service_role appears in any scanned file
//   3. a Supabase secret API key (sb_secret_...) appears in any scanned file
//   4. a VITE_ variable name suggests a secret (SERVICE, SECRET, PRIVATE, PASSWORD)
// Matched values are never printed, so the scan output is safe for CI logs.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ path: string, content: string }} ScannedFile */
/** @typedef {{ path: string, line: number, rule: string, message: string }} Finding */

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.m4a', '.wav', '.webm', '.ogg', '.mp4',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-e2e', 'dist-shots', 'coverage', 'playwright-report', 'test-results', '.lighthouseci']);
const MAX_BYTES = 2 * 1024 * 1024;

const SERVICE_ROLE_TEXT = /service[\s_-]?role/i;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const SB_SECRET = /\bsb_secret_[A-Za-z0-9_-]{8,}/;
const SECRET_VITE_VAR = /\bVITE_[A-Z0-9_]*(?:SERVICE|SECRET|PRIVATE|PASSWORD)[A-Z0-9_]*/;

/**
 * Decodes the payload of a JWT-shaped string and reports whether it carries the service_role claim.
 * @param {string} token
 * @returns {boolean}
 */
export function isServiceRoleJwt(token) {
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json !== null && typeof json === 'object' && json.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath repository-relative path with forward slashes
 * @returns {boolean}
 */
function isUnderSrc(filePath) {
  return filePath === 'src' || filePath.startsWith('src/');
}

/**
 * Scans in-memory files and returns every finding. Pure, so it is unit-tested directly.
 * @param {ScannedFile[]} files
 * @returns {Finding[]}
 */
export function scanFiles(files) {
  /** @type {Finding[]} */
  const findings = [];
  for (const file of files) {
    const normalised = file.path.replaceAll('\\', '/');
    const lines = file.content.split(/\r?\n/);
    lines.forEach((text, index) => {
      const line = index + 1;
      if (isUnderSrc(normalised) && SERVICE_ROLE_TEXT.test(text)) {
        findings.push({ path: normalised, line, rule: 'service-role-text-in-src', message: 'Service-role text is not allowed under src/.' });
      }
      for (const match of text.matchAll(JWT)) {
        if (isServiceRoleJwt(match[0])) {
          findings.push({ path: normalised, line, rule: 'service-role-jwt', message: 'A service-role JWT was found.' });
        }
      }
      if (SB_SECRET.test(text)) {
        findings.push({ path: normalised, line, rule: 'supabase-secret-key', message: 'A Supabase secret API key was found.' });
      }
      if (SECRET_VITE_VAR.test(text)) {
        findings.push({ path: normalised, line, rule: 'secret-in-vite-variable', message: 'VITE_ variables are public; a secret-looking VITE_ name is not allowed.' });
      }
    });
  }
  return findings;
}

/**
 * Lists candidate files: tracked plus untracked-but-not-ignored when inside git, otherwise a directory walk.
 * @param {string} root
 * @returns {string[]} repository-relative paths
 */
export function listFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const inside = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(inside) === path.resolve(root)) {
      return out.split('\0').filter(Boolean);
    }
  } catch {
    // not a git repository: fall through to the walk
  }
  /** @type {string[]} */
  const result = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        result.push(path.join(dir, entry.name).replaceAll('\\', '/'));
      }
    }
  };
  walk('');
  return result;
}

/**
 * Reads and scans every candidate file under root.
 * @param {string} root
 * @returns {{ scanned: number, findings: Finding[] }}
 */
export function scanDirectory(root) {
  /** @type {ScannedFile[]} */
  const files = [];
  for (const rel of listFiles(root)) {
    if (BINARY_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
    const full = path.join(root, rel);
    let size;
    try {
      size = statSync(full).size;
    } catch {
      continue; // deleted but still listed by git
    }
    if (size > MAX_BYTES) continue;
    files.push({ path: rel, content: readFileSync(full, 'utf8') });
  }
  return { scanned: files.length, findings: scanFiles(files) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const { scanned, findings } = scanDirectory(root);
  if (findings.length > 0) {
    for (const f of findings) console.error(`${f.path}:${f.line}  [${f.rule}]  ${f.message}`);
    console.error(`\nSecret scan FAILED: ${findings.length} finding(s) in ${scanned} files.`);
    process.exit(1);
  }
  console.log(`Secret scan passed: ${scanned} files, 0 findings.`);
}
