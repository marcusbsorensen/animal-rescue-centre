/**
 * The voice booth's server half: a connect-style handler that saves recordings
 * to disk. Kept apart from the Vite plugin so it can be tested without Vite
 * (plugins/__tests__/voice-booth.test.ts runs it on a plain http server).
 *
 * Layout, under `dir` (apps/game/voice-takes, gitignored):
 *
 *   raw/<speaker>/<line>__take<N>.<ext>   every take ever recorded, kept for the session
 *   keep/<line>.<ext>                     the chosen take for a line
 *   keep/<line>.json                      what was said, who said it, and that they agreed
 *
 * Everything here answers under /__voice. Anything else falls through to the
 * next middleware. The booth is a development tool on a trusted machine, and
 * it still refuses what a stray web page could send it: only same-origin
 * writes, only plain ids in paths, only audio, only so much of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const VOICE_PREFIX = '/__voice';
/** A line is a few seconds. Twenty-five megabytes is a long WAV, and a ceiling. */
export const MAX_TAKE_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

/** Line and speaker ids: lower-case letters, digits, hyphens. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TAKE_FILE = /^([a-z0-9][a-z0-9-]{0,63})__take(\d{1,4})\.([a-z0-9]{2,5})$/;

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/aiff': 'aif',
  'audio/x-aiff': 'aif',
  'audio/3gpp': '3gp',
};
const MIME_BY_EXT: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  '3gp': 'audio/3gpp',
};

export interface VoiceBoothOptions {
  /** Where takes live. Created on first write. */
  dir: string;
}

export interface TakeInfo {
  file: string;
  n: number;
  ext: string;
  bytes: number;
  modified: number;
}

export interface KeptInfo {
  lineId: string;
  speakerId: string;
  file: string;
  ext: string;
  text: string;
  textHash: string;
  textVersion: string;
  by: string;
  consent: boolean;
  keptAt: string;
  takeFile: string;
  bytes: number;
}

export function sha1(text: string): string {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(json);
}

function fail(res: ServerResponse, status: number, message: string): void {
  send(res, status, { error: message });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Read a request body, refusing more than `limit` bytes. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tooBig = () => new HttpError(413, `That is more than ${Math.round(limit / 1024 / 1024) || 1} MB.`);
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(tooBig());
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(tooBig());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Writes only from the page that served the booth: same origin, or no Origin at all (curl). */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function idParam(value: string | null, what: string): string {
  if (!value || !ID_PATTERN.test(value)) {
    throw new HttpError(400, `${what} must be lower-case letters, digits and hyphens.`);
  }
  return value;
}

/** True when `p` is inside `root` (after resolving), so a join cannot climb out. */
function inside(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function listTakes(rawDir: string, speaker: string): TakeInfo[] {
  const dir = path.join(rawDir, speaker);
  if (!fs.existsSync(dir)) return [];
  const out: TakeInfo[] = [];
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(TAKE_FILE);
    if (!m) continue;
    const st = fs.statSync(path.join(dir, file));
    out.push({ file, n: Number(m[2]), ext: m[3], bytes: st.size, modified: st.mtimeMs });
  }
  return out.sort((a, b) => a.n - b.n);
}

export function createVoiceBoothHandler(options: VoiceBoothOptions) {
  const root = path.resolve(options.dir);
  const rawDir = path.join(root, 'raw');
  const keepDir = path.join(root, 'keep');

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://voice.local');
    const route = url.pathname.slice(VOICE_PREFIX.length) || '/';
    const method = req.method ?? 'GET';

    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
      throw new HttpError(403, 'Writes are only accepted from the voice booth page itself.');
    }

    // ── GET /__voice/ping ──
    if (route === '/ping' && method === 'GET') {
      return send(res, 200, { ok: true, dir: root });
    }

    // ── GET /__voice/status: every take and every kept line ──
    if (route === '/status' && method === 'GET') {
      const takes: Record<string, TakeInfo[]> = {};
      if (fs.existsSync(rawDir)) {
        for (const speaker of fs.readdirSync(rawDir)) {
          if (!ID_PATTERN.test(speaker)) continue;
          for (const t of listTakes(rawDir, speaker)) {
            const line = t.file.match(TAKE_FILE)![1];
            (takes[line] ??= []).push(t);
          }
        }
      }
      const kept: Record<string, KeptInfo> = {};
      if (fs.existsSync(keepDir)) {
        for (const f of fs.readdirSync(keepDir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const info = JSON.parse(fs.readFileSync(path.join(keepDir, f), 'utf8')) as KeptInfo;
            if (ID_PATTERN.test(info.lineId)) kept[info.lineId] = info;
          } catch { /* a half-written sidecar is not a kept line */ }
        }
      }
      return send(res, 200, { takes, kept });
    }

    // ── POST /__voice/take?speaker=&line=  (body: the audio) ──
    if (route === '/take' && method === 'POST') {
      const speaker = idParam(url.searchParams.get('speaker'), 'speaker');
      const line = idParam(url.searchParams.get('line'), 'line');
      const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const ext = EXT_BY_MIME[mime];
      if (!ext) throw new HttpError(415, `That is not audio I can keep (${mime || 'no content type'}).`);
      const body = await readBody(req, MAX_TAKE_BYTES);
      if (body.length < 64) throw new HttpError(400, 'That recording is empty.');
      const dir = path.join(rawDir, speaker);
      fs.mkdirSync(dir, { recursive: true });
      const next = Math.max(0, ...listTakes(rawDir, speaker)
        .filter((t) => t.file.startsWith(`${line}__take`))
        .map((t) => t.n)) + 1;
      const file = `${line}__take${next}.${ext}`;
      const target = path.join(dir, file);
      if (!inside(rawDir, target)) throw new HttpError(400, 'Bad path.');
      fs.writeFileSync(target, body);
      return send(res, 201, { file, n: next, ext, bytes: body.length });
    }

    // ── GET|DELETE /__voice/take?speaker=&file= ──
    if (route === '/take' && (method === 'GET' || method === 'DELETE')) {
      const speaker = idParam(url.searchParams.get('speaker'), 'speaker');
      const file = url.searchParams.get('file') ?? '';
      const m = file.match(TAKE_FILE);
      if (!m) throw new HttpError(400, 'Bad take name.');
      const target = path.join(rawDir, speaker, file);
      if (!inside(rawDir, target) || !fs.existsSync(target)) throw new HttpError(404, 'No such take.');
      if (method === 'DELETE') {
        fs.unlinkSync(target);
        return send(res, 200, { deleted: file });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_BY_EXT[m[3]] ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(fs.statSync(target).size));
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(target).pipe(res);
      return;
    }

    // ── POST /__voice/keep  {speaker, line, file, text, textVersion, by, consent} ──
    if (route === '/keep' && method === 'POST') {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8')) as Record<string, unknown>;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(400, 'That is not JSON.');
      }
      const speaker = idParam(String(data.speaker ?? ''), 'speaker');
      const line = idParam(String(data.line ?? ''), 'line');
      const file = String(data.file ?? '');
      const m = file.match(TAKE_FILE);
      if (!m || m[1] !== line) throw new HttpError(400, 'That take is not for this line.');
      const text = String(data.text ?? '').trim();
      if (!text || text.length > 500) throw new HttpError(400, 'Say which words were recorded.');
      if (text.includes('{animal}')) {
        throw new HttpError(400, "A line with the animal's name in it cannot be recorded; see the voice plan.");
      }
      if (data.consent !== true) {
        throw new HttpError(400, 'Whoever is speaking has to have agreed to the consent line first.');
      }
      const source = path.join(rawDir, speaker, file);
      if (!inside(rawDir, source) || !fs.existsSync(source)) throw new HttpError(404, 'No such take.');

      fs.mkdirSync(keepDir, { recursive: true });
      // One kept take per line: drop an older one in another format.
      for (const f of fs.readdirSync(keepDir)) {
        if (f.startsWith(`${line}.`)) fs.unlinkSync(path.join(keepDir, f));
      }
      const ext = m[3];
      const target = path.join(keepDir, `${line}.${ext}`);
      fs.copyFileSync(source, target);
      const info: KeptInfo = {
        lineId: line,
        speakerId: speaker,
        file: `${line}.${ext}`,
        ext,
        text,
        textHash: sha1(text),
        textVersion: String(data.textVersion ?? ''),
        by: String(data.by ?? '').slice(0, 80),
        consent: true,
        keptAt: new Date().toISOString(),
        takeFile: file,
        bytes: fs.statSync(target).size,
      };
      fs.writeFileSync(path.join(keepDir, `${line}.json`), `${JSON.stringify(info, null, 2)}\n`);
      return send(res, 200, info);
    }

    // ── DELETE /__voice/keep?line= ──
    if (route === '/keep' && method === 'DELETE') {
      const line = idParam(url.searchParams.get('line'), 'line');
      let removed = 0;
      if (fs.existsSync(keepDir)) {
        for (const f of fs.readdirSync(keepDir)) {
          if (f.startsWith(`${line}.`)) {
            fs.unlinkSync(path.join(keepDir, f));
            removed += 1;
          }
        }
      }
      return send(res, 200, { removed });
    }

    throw new HttpError(404, 'No such voice booth endpoint.');
  }

  return function voiceBoothMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): void {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== VOICE_PREFIX && !pathname.startsWith(`${VOICE_PREFIX}/`)) return next();
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (e instanceof HttpError) return fail(res, e.status, e.message);
      return fail(res, 500, e instanceof Error ? e.message : 'Something went wrong.');
    });
  };
}
