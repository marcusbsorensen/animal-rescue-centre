// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  createVoiceBoothHandler,
  MAX_TAKE_BYTES,
  sha1,
  type KeptInfo,
} from '../voice-booth-handler';
import voiceBoothPlugin from '../voice-booth';

/**
 * The voice booth's save endpoint, run on a plain http server so no Vite is
 * needed (the dev server in use is never touched). It writes into a temp
 * folder; the real one is apps/game/voice-takes/.
 */

let dir: string;
let server: http.Server;
let base: string;
let nextCalled: string[];

/** A few hundred bytes that look like an audio payload. */
const audio = (n = 400): Buffer => Buffer.alloc(n, 7);

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-voice-'));
  nextCalled = [];
  const handler = createVoiceBoothHandler({ dir });
  server = http.createServer((req, res) => {
    handler(req, res, () => {
      nextCalled.push(req.url ?? '');
      res.statusCode = 404;
      res.end('not mine');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function postTake(speaker: string, line: string, type = 'audio/webm;codecs=opus', body: Buffer = audio()) {
  return fetch(`${base}/__voice/take?speaker=${speaker}&line=${line}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: body as unknown as BodyInit,
  });
}

async function keep(over: Record<string, unknown> = {}) {
  return fetch(`${base}/__voice/keep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speaker: 'warden',
      line: 'handover-warden-1',
      file: 'handover-warden-1__take1.webm',
      text: 'Meet our little friend! This one has been hoping for the perfect home.',
      textVersion: 'name-free',
      by: 'Test voice',
      consent: true,
      ...over,
    }),
  });
}

describe('voice booth endpoint', () => {
  it('lets anything that is not /__voice fall through to the next middleware', async () => {
    const res = await fetch(`${base}/assets/voice/x.mp3`);
    expect(res.status).toBe(404);
    expect(nextCalled).toEqual(['/assets/voice/x.mp3']);
    // A path that merely starts with the same letters is not the booth either.
    await fetch(`${base}/__voiceover`);
    expect(nextCalled).toContain('/__voiceover');
  });

  it('answers ping, so the booth can tell saving is switched on', async () => {
    const res = await fetch(`${base}/__voice/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('saves a take under raw/<speaker>/ and numbers the next one itself', async () => {
    const a = await postTake('warden', 'handover-warden-1');
    expect(a.status).toBe(201);
    expect(await a.json()).toMatchObject({ file: 'handover-warden-1__take1.webm', n: 1, ext: 'webm' });
    const b = await postTake('warden', 'handover-warden-1');
    expect(await b.json()).toMatchObject({ file: 'handover-warden-1__take2.webm', n: 2 });
    // Another line starts again at 1.
    const c = await postTake('warden', 'handover-warden-3');
    expect(await c.json()).toMatchObject({ file: 'handover-warden-3__take1.webm', n: 1 });
    expect(fs.readdirSync(path.join(dir, 'raw/warden')).sort()).toEqual([
      'handover-warden-1__take1.webm',
      'handover-warden-1__take2.webm',
      'handover-warden-3__take1.webm',
    ]);
    expect(fs.readFileSync(path.join(dir, 'raw/warden/handover-warden-1__take1.webm'))).toEqual(audio());
  });

  it('names the file by what the browser recorded: Chrome gives webm, Safari gives mp4', async () => {
    expect((await (await postTake('warden', 'handover-warden-1', 'audio/mp4')).json()).file).toBe('handover-warden-1__take1.m4a');
    expect((await (await postTake('warden', 'handover-warden-3', 'audio/wav')).json()).file).toBe('handover-warden-3__take1.wav');
  });

  it('refuses what is not audio, what is empty, and what is too big', async () => {
    expect((await postTake('warden', 'handover-warden-1', 'text/html')).status).toBe(415);
    expect((await postTake('warden', 'handover-warden-1', 'application/octet-stream')).status).toBe(415);
    expect((await postTake('warden', 'handover-warden-1', 'audio/webm', Buffer.alloc(10))).status).toBe(400);
    const big = await postTake('warden', 'handover-warden-1', 'audio/webm', Buffer.alloc(MAX_TAKE_BYTES + 1024, 1)).catch(() => null);
    // Either a clean 413, or the connection is closed on us once the limit is passed.
    if (big) expect(big.status).toBe(413);
    expect(fs.existsSync(path.join(dir, 'raw/warden'))).toBe(false);
  });

  it('refuses ids that could climb out of the folder or hide anything', async () => {
    for (const bad of ['..', '../x', 'a/b', 'A-b', 'x y', '', '%2e%2e', '..%2f..%2fetc']) {
      const res = await fetch(`${base}/__voice/take?speaker=${bad}&line=handover-warden-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: audio() as unknown as BodyInit,
      });
      expect([400, 404], `speaker ${JSON.stringify(bad)}`).toContain(res.status);
    }
    const res = await fetch(`${base}/__voice/take?speaker=warden&file=..%2F..%2Fsecret.webm`);
    expect(res.status).toBe(400);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a write from another website, and allows the page itself', async () => {
    const other = await fetch(`${base}/__voice/take?speaker=warden&line=handover-warden-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm', Origin: 'https://evil.example' },
      body: audio() as unknown as BodyInit,
    });
    expect(other.status).toBe(403);
    const self = await fetch(`${base}/__voice/take?speaker=warden&line=handover-warden-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm', Origin: base },
      body: audio() as unknown as BodyInit,
    });
    expect(self.status).toBe(201);
  });

  it('plays a take back, with the right type', async () => {
    await postTake('warden', 'handover-warden-1');
    const res = await fetch(`${base}/__voice/take?speaker=warden&file=handover-warden-1__take1.webm`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/webm');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(audio());
    expect((await fetch(`${base}/__voice/take?speaker=warden&file=handover-warden-1__take9.webm`)).status).toBe(404);
  });

  it('deletes a take', async () => {
    await postTake('warden', 'handover-warden-1');
    const res = await fetch(`${base}/__voice/take?speaker=warden&file=handover-warden-1__take1.webm`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(dir, 'raw/warden/handover-warden-1__take1.webm'))).toBe(false);
  });

  it('keeps a take: copies it to keep/ with a sidecar that says what was said and who agreed', async () => {
    await postTake('warden', 'handover-warden-1');
    const res = await keep();
    expect(res.status).toBe(200);
    const info = (await res.json()) as KeptInfo;
    expect(info).toMatchObject({
      lineId: 'handover-warden-1',
      speakerId: 'warden',
      file: 'handover-warden-1.webm',
      takeFile: 'handover-warden-1__take1.webm',
      textVersion: 'name-free',
      by: 'Test voice',
      consent: true,
    });
    expect(info.textHash).toBe(sha1(info.text));
    expect(fs.readFileSync(path.join(dir, 'keep/handover-warden-1.webm'))).toEqual(audio());
    const sidecar = JSON.parse(fs.readFileSync(path.join(dir, 'keep/handover-warden-1.json'), 'utf8')) as KeptInfo;
    expect(sidecar.text).toContain('little friend');
  });

  it('keeping another take replaces the first, even in a different format', async () => {
    await postTake('warden', 'handover-warden-1', 'audio/webm');
    await postTake('warden', 'handover-warden-1', 'audio/mp4');
    await keep();
    await keep({ file: 'handover-warden-1__take2.m4a' });
    expect(fs.readdirSync(path.join(dir, 'keep')).sort()).toEqual(['handover-warden-1.json', 'handover-warden-1.m4a']);
  });

  it('will not keep without the speaker\'s agreement, or a line that needs the animal\'s name', async () => {
    await postTake('warden', 'handover-warden-1');
    expect((await keep({ consent: false })).status).toBe(400);
    expect((await keep({ consent: undefined })).status).toBe(400);
    expect((await keep({ text: 'This is {animal}. {animal} has been hoping for the perfect home.' })).status).toBe(400);
    expect((await keep({ text: '' })).status).toBe(400);
    expect((await keep({ file: 'handover-warden-3__take1.webm' })).status).toBe(400); // another line's take
    expect(fs.existsSync(path.join(dir, 'keep'))).toBe(false);
  });

  it('reports every take and every kept line', async () => {
    await postTake('warden', 'handover-warden-1');
    await postTake('warden', 'handover-warden-1');
    await postTake('01-priya', 'handover-01-priya-2');
    await keep();
    const status = (await (await fetch(`${base}/__voice/status`)).json()) as {
      takes: Record<string, Array<{ file: string; n: number }>>;
      kept: Record<string, KeptInfo>;
    };
    expect(status.takes['handover-warden-1'].map((t) => t.n)).toEqual([1, 2]);
    expect(status.takes['handover-01-priya-2']).toHaveLength(1);
    expect(Object.keys(status.kept)).toEqual(['handover-warden-1']);
  });

  it('can un-keep a line', async () => {
    await postTake('warden', 'handover-warden-1');
    await keep();
    const res = await fetch(`${base}/__voice/keep?line=handover-warden-1`, { method: 'DELETE' });
    expect(await res.json()).toEqual({ removed: 2 });
    expect(fs.readdirSync(path.join(dir, 'keep'))).toEqual([]);
  });

  it('answers 404 for an endpoint it does not have', async () => {
    expect((await fetch(`${base}/__voice/nothing`)).status).toBe(404);
  });
});

describe('voice booth plugin', () => {
  it('mounts the endpoint on the dev server, saving under <root>/voice-takes', () => {
    const plugin = voiceBoothPlugin();
    const mounted: unknown[] = [];
    const logged: string[] = [];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-root-'));
    const server = {
      config: { root, server: { port: 5173 }, logger: { info: (m: string) => logged.push(m) } },
      middlewares: { use: (fn: unknown) => mounted.push(fn) },
    };
    (plugin.configureServer as (s: unknown) => void)(server);
    expect(mounted).toHaveLength(1);
    expect(typeof mounted[0]).toBe('function');
    expect(logged.join(' ')).toContain('/admin/voice-booth.html');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('has no build or preview hook that mounts an endpoint', () => {
    const plugin = voiceBoothPlugin() as unknown as Record<string, unknown>;
    expect(plugin.configurePreviewServer).toBeUndefined();
    expect(plugin.configureServer).toBeDefined();
  });
});
