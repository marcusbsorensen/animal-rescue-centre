/**
 * Tests for tools/leak-check.mjs, with FAKE secrets in a small synthetic build.
 *   node --test tools/leak-check.test.mjs      (or: pnpm test:leaks)
 * The real build and the real .env.local are never read here.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'leak-check.mjs');

const PW = 'Fake-Pa55 w0rd&x=y/z+q'; // spaces and symbols, so the encoded forms differ from the plain one
const jwt = (payload) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b(payload)}.ZmFrZS1zaWduYXR1cmUtZmFrZQ`;
};
const SERVICE = jwt({ iss: 'supabase', ref: 'fakefakefake', role: 'service_role', exp: 1999999999 });
const ANON = jwt({ iss: 'supabase', ref: 'fakefakefake', role: 'anon', exp: 1999999999 });
const OTHER_SERVICE = jwt({ iss: 'supabase-demo', role: 'service_role', exp: 1983812996 });
const URL_OK = 'https://fakefakefake.supabase.co';

function setup(envText) {
  const root = mkdtempSync(path.join(tmpdir(), 'leakcheck-'));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<html><body>clean</body></html>');
  writeFileSync(path.join(dist, 'assets', 'index-AbCdEf12.js'), 'console.log("clean");');
  const env = path.join(root, 'fake.env');
  writeFileSync(
    env,
    envText ??
      `VITE_SUPABASE_URL=${URL_OK}\nVITE_SUPABASE_ANON_KEY=${ANON}\n` +
        `VITE_SUPABASE_SERVICE_ROLE_KEY=${SERVICE}\nVITE_ADMIN_PASSWORD="${PW}"\n`,
  );
  const run = (...extra) => {
    const r = spawnSync('node', [script, '--dist', dist, '--env', env, ...extra], { encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  return { root, dist, env, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Plant `content` in a file, run, and expect exit 1 naming only that file. */
function plantTest(name, file, content) {
  test(`catches: ${name}`, () => {
    const t = setup();
    try {
      writeFileSync(path.join(t.dist, file), content);
      const r = t.run();
      assert.equal(r.code, 1);
      assert.ok(r.out.includes(file), 'names the file');
      for (const frag of ['Fake-Pa55', 'w0rd', SERVICE.slice(0, 24), 'ZmFrZS1zaWduYXR1cmU', Buffer.from(PW).toString('base64').slice(0, 12)]) {
        assert.ok(!r.out.includes(frag), `output must not echo ${frag.slice(0, 6)}...`);
      }
    } finally {
      t.cleanup();
    }
  });
}

test('a clean build passes', () => {
  const t = setup();
  try {
    assert.equal(t.run().code, 0);
  } finally {
    t.cleanup();
  }
});

plantTest('admin password, plain', 'a.js', `var p=${JSON.stringify('x')};//${PW}`);
plantTest('admin password, URL-encoded', 'a.html', `<a href="/?pw=${encodeURIComponent(PW)}">`);
plantTest('admin password, form-encoded', 'a.html', `<a href="/?pw=${encodeURIComponent(PW).replace(/%20/g, '+')}">`);
for (const lead of ['', 'a', 'ab']) {
  plantTest(`admin password inside base64 (alignment ${lead.length})`, 'a.txt', `xx${Buffer.from(`${lead}${PW}tail`).toString('base64')}yy`);
}
plantTest('admin password, URL-safe base64', 'a.txt', Buffer.from(PW).toString('base64url'));
plantTest('service-role key, plain', 'a.js', `const k="${SERVICE}";`);
plantTest('service-role key inside base64', 'a.txt', Buffer.from(`k=${SERVICE}`).toString('base64'));
plantTest('admin password in a binary-type file', 'pic.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]), Buffer.from(PW)]));
plantTest('a service_role JWT the env file does not know', 'a.js', `const k="${OTHER_SERVICE}";`);

test('a JWT with role anon is allowed', () => {
  const t = setup();
  try {
    writeFileSync(path.join(t.dist, 'a.js'), `const k="${ANON}";`);
    assert.equal(t.run().code, 0);
  } finally {
    t.cleanup();
  }
});

test('a symbolic link in the build fails', () => {
  const t = setup();
  try {
    symlinkSync('/etc/hosts', path.join(t.dist, 'link'));
    assert.equal(t.run().code, 1);
  } finally {
    t.cleanup();
  }
});

test('no env file: exit 2, not a clean pass', () => {
  const t = setup();
  try {
    const r = spawnSync('node', [script, '--dist', t.dist, '--env', path.join(t.root, 'missing.env')], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  } finally {
    t.cleanup();
  }
});

test('no build folder: exit 2', () => {
  const t = setup();
  try {
    const r = spawnSync('node', [script, '--dist', path.join(t.root, 'nope'), '--env', t.env], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  } finally {
    t.cleanup();
  }
});

test('--public-config: passes when the URL and anon key are in the build', () => {
  const t = setup();
  try {
    writeFileSync(path.join(t.dist, 'assets', 'cfg.js'), `const u="${URL_OK}",k="${ANON}";`);
    assert.equal(t.run('--public-config').code, 0);
  } finally {
    t.cleanup();
  }
});

test('--public-config: exit 2 when the build was made without them', () => {
  const t = setup();
  try {
    assert.equal(t.run('--public-config').code, 2);
  } finally {
    t.cleanup();
  }
});

test('--public-config: exit 2 for a local Supabase URL', () => {
  const t = setup(`VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=${ANON}\nVITE_ADMIN_PASSWORD=${PW}\n`);
  try {
    writeFileSync(path.join(t.dist, 'assets', 'cfg.js'), `const u="http://127.0.0.1:54321",k="${ANON}";`);
    const r = t.run('--public-config');
    assert.equal(r.code, 2);
    assert.ok(r.out.includes('local or private'));
  } finally {
    t.cleanup();
  }
});
