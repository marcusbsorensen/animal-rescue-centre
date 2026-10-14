/**
 * A stand-in for the supabase-js client, enough for the Edge Functions.
 *
 * Every query a function builds is recorded as a `Query` when it is
 * awaited, and answered by the test's `respond` callback (default: no
 * rows, no error). Every `rpc` call is recorded too; the rate-limit RPCs
 * answer "allowed" unless the test says otherwise.
 *
 * Tests then assert on `queries` and `rpcs` — what was written, and with
 * which keys — rather than on a database.
 */

export type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface Query {
  table: string;
  op: Op;
  /** Columns asked for by `select(...)`, also after an insert or update. */
  columns?: string;
  /** The row(s) passed to insert, update or upsert. */
  values?: unknown;
  filters: Array<{ kind: string; column: string; value: unknown }>;
  /** How the query was finished. */
  shape: 'many' | 'single' | 'maybeSingle';
}

export interface Result {
  data: unknown;
  error: unknown;
}

export type Responder = (q: Query) => Result | undefined;
export type RpcResponder = (fn: string, args: Record<string, unknown>) => Result | undefined;

const ALLOWED: Result = { data: [{ allowed: true, retry_after_ms: 0 }], error: null };

function defaultRpc(fn: string): Result {
  if (fn === 'check_rate_limit' || fn === 'peek_rate_limit') return ALLOWED;
  return { data: null, error: null };
}

export class FakeSupabase {
  readonly queries: Query[] = [];
  readonly rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

  constructor(
    private readonly respond: Responder = () => undefined,
    private readonly respondRpc: RpcResponder = () => undefined,
  ) {}

  from(table: string): Builder {
    return new Builder(this, table);
  }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    this.rpcs.push({ fn, args });
    return Promise.resolve(this.respondRpc(fn, args) ?? defaultRpc(fn));
  }

  /** @internal */
  resolve(q: Query): Result {
    this.queries.push(q);
    return this.respond(q) ?? { data: q.shape === 'many' ? [] : null, error: null };
  }

  /** Every query against one table, optionally of one kind. */
  on(table: string, op?: Op): Query[] {
    return this.queries.filter((q) => q.table === table && (!op || q.op === op));
  }

  /** Every key passed to any rate-limit RPC, in order. */
  rateLimitKeys(): string[] {
    return this.rpcs
      .map((r) => r.args.p_key)
      .filter((k): k is string => typeof k === 'string');
  }
}

class Builder implements PromiseLike<Result> {
  private op: Op = 'select';
  private columns?: string;
  private values?: unknown;
  private readonly filters: Query['filters'] = [];

  constructor(private readonly client: FakeSupabase, private readonly table: string) {}

  select(columns = '*'): this {
    this.columns = columns;
    return this;
  }
  insert(values: unknown): this { this.op = 'insert'; this.values = values; return this; }
  update(values: unknown): this { this.op = 'update'; this.values = values; return this; }
  upsert(values: unknown): this { this.op = 'upsert'; this.values = values; return this; }
  delete(): this { this.op = 'delete'; return this; }

  private filter(kind: string, column: string, value: unknown): this {
    this.filters.push({ kind, column, value });
    return this;
  }
  eq(c: string, v: unknown): this { return this.filter('eq', c, v); }
  neq(c: string, v: unknown): this { return this.filter('neq', c, v); }
  lt(c: string, v: unknown): this { return this.filter('lt', c, v); }
  lte(c: string, v: unknown): this { return this.filter('lte', c, v); }
  gt(c: string, v: unknown): this { return this.filter('gt', c, v); }
  gte(c: string, v: unknown): this { return this.filter('gte', c, v); }
  in(c: string, v: unknown): this { return this.filter('in', c, v); }
  is(c: string, v: unknown): this { return this.filter('is', c, v); }
  or(v: string): this { return this.filter('or', '', v); }
  order(): this { return this; }
  limit(): this { return this; }

  private finish(shape: Query['shape']): Promise<Result> {
    return Promise.resolve(this.client.resolve({
      table: this.table,
      op: this.op,
      columns: this.columns,
      values: this.values,
      filters: [...this.filters],
      shape,
    }));
  }
  single(): Promise<Result> { return this.finish('single'); }
  maybeSingle(): Promise<Result> { return this.finish('maybeSingle'); }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.finish('many').then(onFulfilled, onRejected);
  }
}

/** True when a query has an `eq` filter on `column` with `value`. */
export function hasEq(q: Query, column: string, value?: unknown): boolean {
  return q.filters.some(
    (f) => f.kind === 'eq' && f.column === column && (value === undefined || f.value === value),
  );
}
