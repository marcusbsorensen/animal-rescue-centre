#!/usr/bin/env node
/**
 * Leak check for the web build (apps/game/dist) before it goes to a public host.
 *
 *   node tools/leak-check.mjs                      scan apps/game/dist
 *   node tools/leak-check.mjs --dist <folder>      scan another folder
 *   node tools/leak-check.mjs --env <file>         read the secrets from another env file
 *   node tools/leak-check.mjs --public-config      also prove the build carries its Supabase config
 *   pnpm check:leaks                               the same, from the repo root
 *
 * What it looks for, in every file of the build:
 *   1. The VALUE of each of these, as found in the root .env.local, written
 *      plain, as base64 (standard and URL-safe, at all three byte alignments),
 *      URL-encoded (upper and lower case hex, and with + for spaces) or
 *      JSON-escaped:
 *        VITE_SUPABASE_SERVICE_ROLE_KEY
 *        VITE_ADMIN_PASSWORD
 *   2. Any JSON Web Token whose payload says "service_role", whoever issued it
 *      (a local Supabase's demo key counts).
 *
 * It never prints a secret, a fragment of one, or a line of a file. On a hit it
 * prints the file's path inside the build and nothing else about it.
 *
 * Exit codes: 0 clean; 1 a hit; 2 it could not check (no env file, no build, or
 * a --public-config failure).
 *
 * Where the env file comes from, first found wins: --env, $ARC_ENV_FILE,
 * <repo>/.env.local, then the main checkout's .env.local (a git worktree has
 * no .env.local of its own; the file is not in git).
 *
 * --public-config exists because a build made without its env file (a fresh
 * worktree) compiles happily and ships a game that cannot reach Supabase. It
 * checks that the values of VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are in
 * the build, and that the URL is not a local address (a Docker Supabase). It
 * prints "present" or "missing", never the values.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECRET_NAMES = ['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_ADMIN_PASSWORD'];
const PUBLIC_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

// Files that cannot hold a readable token. They are still searched for the
// secret values (byte for byte); only the JWT sweep skips them.
const BINARY_EXT = new Set([
  '.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.ico', '.mp3', '.ogg', '.wav',
  '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.gz', '.br',
]);

// ---- arguments ------------------------------------------------------------

// This script never calls process.exit(): after a heavy scan Node has been seen to
// hang inside its own shutdown (waiting on a V8 worker thread), and a hung check
// would hang the deploy. It sets process.exitCode and lets the event loop drain.

let distDir = path.join(repo, 'apps', 'game', 'dist');
let envFile = process.env.ARC_ENV_FILE || '';
let wantPublicConfig = false;

/** Returns an exit code to stop with, or -1 to carry on. */
function parseArgs(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dist') distDir = path.resolve(args[++i] ?? '');
    else if (a === '--env') envFile = path.resolve(args[++i] ?? '');
    else if (a === '--public-config') wantPublicConfig = true;
    else if (a === '-h' || a === '--help') {
      const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
      console.log(lines.slice(2, lines.indexOf(' */')).map((l) => l.replace(/^ ?\* ?/, '')).join('\n'));
      return 0;
    } else {
      console.error(`leak-check: unknown option ${a}`);
      return 2;
    }
  }
  return -1;
}

// ---- env file -------------------------------------------------------------

function mainCheckoutRoot() {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return path.dirname(path.resolve(repo, common));
  } catch {
    return '';
  }
}

function findEnvFile() {
  if (envFile) return existsSync(envFile) ? envFile : '';
  const candidates = [path.join(repo, '.env.local')];
  const main = mainCheckoutRoot();
  if (main && main !== repo) candidates.push(path.join(main, '.env.local'));
  return candidates.find((c) => existsSync(c)) ?? '';
}

/** dotenv-style: KEY=value, optional `export `, optional quotes, # comments. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) {
      v = v.slice(1, v.lastIndexOf(q));
      if (q === '"') v = v.replace(/\\n/g, '\n');
    } else {
      v = v.replace(/\s+#.*$/, '');
    }
    out[m[1]] = v;
  }
  return out;
}

// ---- the forms a value can take inside a file -------------------------------

/**
 * Base64 text that appears inside a larger base64 blob depends on how the
 * value lines up with 3-byte groups. Encode it at each of the three
 * alignments and keep only the characters that depend on the value alone
 * (drop the leading characters that mix in the preceding bytes and the last
 * character, which mixes in the following byte).
 */
function base64Needles(buf) {
  const out = [];
  for (let lead = 0; lead < 3; lead += 1) {
    const padded = Buffer.concat([Buffer.alloc(lead), buf]);
    const enc = padded.toString('base64').replace(/=+$/, '');
    const skipHead = [0, 2, 3][lead];
    const dropTail = padded.length % 3 === 0 ? 0 : 1;
    const core = enc.slice(skipHead, enc.length - dropTail);
    if (core.length >= 8) {
      out.push(core);
      out.push(core.replace(/\+/g, '-').replace(/\//g, '_'));
    }
  }
  return out;
}

function needlesFor(value) {
  const forms = new Set([value]);
  const enc = encodeURIComponent(value);
  forms.add(enc);
  forms.add(enc.replace(/%[0-9A-F]{2}/g, (h) => h.toLowerCase()));
  forms.add(enc.replace(/%20/g, '+'));
  forms.add(encodeURI(value));
  forms.add(JSON.stringify(value).slice(1, -1));
  const buffers = [...forms].filter((f) => f.length > 0).map((f) => Buffer.from(f, 'utf8'));
  for (const b64 of base64Needles(Buffer.from(value, 'utf8'))) buffers.push(Buffer.from(b64, 'latin1'));
  // De-duplicate by content.
  const seen = new Set();
  return buffers.filter((b) => {
    const k = b.toString('latin1');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---- JWT sweep ----------------------------------------------------------------

const JWT = /eyJ[A-Za-z0-9_-]{4,}\.(eyJ[A-Za-z0-9_-]{4,})\.[A-Za-z0-9_-]*/g;

function hasServiceRoleJwt(buf) {
  const text = buf.toString('latin1');
  if (!text.includes('eyJ')) return false;
  for (const m of text.matchAll(JWT)) {
    let payload = '';
    try {
      payload = Buffer.from(m[1], 'base64url').toString('utf8');
    } catch {
      continue;
    }
    if (payload.includes('service_role')) return true;
  }
  return false;
}

// ---- walk the build -------------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // A link could point outside the build; the host would copy its target.
      yield { full, link: true };
    } else if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield { full, link: false };
    }
  }
}

// ---- main ---------------------------------------------------------------------

function main() {
const early = parseArgs(process.argv.slice(2));
if (early >= 0) return early;

if (!existsSync(distDir) || !lstatSync(distDir).isDirectory()) {
  console.error(`leak-check: no build folder at ${distDir}`);
  return 2;
}

const envPath = findEnvFile();
if (!envPath) {
  console.error(
    'leak-check: cannot check. No env file found (looked for --env, $ARC_ENV_FILE, ' +
      '<repo>/.env.local and the main checkout\'s .env.local). Without it the values of the ' +
      'secrets are unknown, so a clean result would mean nothing.',
  );
  return 2;
}
const env = parseEnv(readFileSync(envPath, 'utf8'));

const targets = []; // { name, needles }
for (const name of SECRET_NAMES) {
  const value = env[name] ?? '';
  if (!value) {
    console.warn(`leak-check: ${name} is not set in ${path.basename(envPath)}; nothing to look for.`);
    continue;
  }
  if (value.length < 8) {
    console.warn(`leak-check: ${name} is only ${value.length} characters; a match in a binary file may be chance.`);
  }
  targets.push({ name, needles: needlesFor(value) });
}

const hits = [];
let fileCount = 0;
const publicSeen = Object.fromEntries(PUBLIC_NAMES.map((n) => [n, false]));
const publicNeedles = PUBLIC_NAMES.filter((n) => env[n]).map((n) => ({ name: n, needle: Buffer.from(env[n], 'utf8') }));

for (const { full, link } of walk(distDir)) {
  const rel = path.relative(distDir, full);
  if (link) {
    hits.push(`${rel}  (a symbolic link: the host would copy its target)`);
    continue;
  }
  fileCount += 1;
  const buf = readFileSync(full);
  let hit = targets.some((t) => t.needles.some((n) => buf.includes(n)));
  if (!hit && !BINARY_EXT.has(path.extname(full).toLowerCase())) hit = hasServiceRoleJwt(buf);
  if (hit) hits.push(rel);
  if (wantPublicConfig) {
    for (const p of publicNeedles) if (!publicSeen[p.name] && buf.includes(p.needle)) publicSeen[p.name] = true;
  }
}

if (hits.length > 0) {
  console.error(`leak-check: FAILED. ${hits.length} file(s) in the build carry a secret:`);
  for (const h of hits) console.error(`  ${h}`);
  console.error('Nothing was uploaded. Remove the reference from the source, rebuild, and run this again.');
  return 1;
}

console.log(
  `leak-check: clean. ${fileCount} files scanned for ${targets.length} secret value(s) ` +
    `(plain, base64, URL-encoded) and for service_role tokens.`,
);
if (targets.length < SECRET_NAMES.length) {
  console.warn('leak-check: one or more secrets could not be looked for (see above).');
}

if (wantPublicConfig) {
  let bad = false;
  for (const n of PUBLIC_NAMES) {
    if (!env[n]) {
      console.error(`leak-check: ${n} is not set in ${path.basename(envPath)}.`);
      bad = true;
    } else if (!publicSeen[n]) {
      console.error(`leak-check: ${n} is missing from the build. Was it built without the env file?`);
      bad = true;
    } else {
      console.log(`leak-check: ${n} present in the build.`);
    }
  }
  const url = env.VITE_SUPABASE_URL ?? '';
  if (url) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    const local = !host || host === 'localhost' || host === '0.0.0.0' || host === '[::1]' ||
      host.endsWith('.local') || host.endsWith('.localhost') ||
      /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
    if (local) {
      console.error('leak-check: VITE_SUPABASE_URL is a local or private address; this build would not work for players.');
      bad = true;
    } else if (!url.startsWith('https://')) {
      console.error('leak-check: VITE_SUPABASE_URL is not https.');
      bad = true;
    }
  }
  if (bad) return 2;
}
return 0;
}

process.exitCode = main();
