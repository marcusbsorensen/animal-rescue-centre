/**
 * Loads an Edge Function's real `index.ts` and hands back its request
 * handler, with `Deno` and supabase-js replaced (see vitest.config.ts).
 */
import { vi } from 'vitest';
import { FakeSupabase } from './fake-supabase';

export type Handler = (req: Request) => Response | Promise<Response>;

let captured: Handler | null = null;
let env: Record<string, string | undefined> = {};

/** The env a function sees through `Deno.env.get`. Read per request. */
export function setEnv(values: Record<string, string | undefined>): void {
  env = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests',
    ...values,
  };
}

function installDeno(): void {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    serve(arg: Handler | { handler: Handler }) {
      captured = typeof arg === 'function' ? arg : arg.handler;
    },
    env: { get: (key: string) => env[key] },
  };
}

/** Make `createClient` return this fake until the next call. */
export function useFakeSupabase(fake: FakeSupabase): FakeSupabase {
  (globalThis as { __arcFakeSupabase?: FakeSupabase }).__arcFakeSupabase = fake;
  return fake;
}

/**
 * Import a function module fresh and return the handler it passed to
 * `Deno.serve`. Pass a literal `() => import('…/index.ts')` so the bundler
 * can see the path.
 */
export async function loadFunction(importer: () => Promise<unknown>): Promise<Handler> {
  installDeno();
  setEnv({});
  vi.resetModules();
  captured = null;
  await importer();
  if (!captured) throw new Error('The module did not call Deno.serve');
  return captured;
}

/** A POST as the game sends it, from a given address. */
export function post(
  body: unknown,
  opts: { ip?: string | null; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  const ip = opts.ip === undefined ? '203.0.113.7' : opts.ip;
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request('http://localhost/functions/v1/test', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
