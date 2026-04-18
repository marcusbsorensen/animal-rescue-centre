import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { BADGE_DEFINITIONS } from '@arc/badges';
import {
  setRelationship,
  clearRelationship,
  getRelationship,
  syncSiblingIds,
} from '@arc/game-logic';
import type { AnimalRelationship, RelationshipType, Animal } from '@arc/shared-types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ── Types ──────────────────────────────────────────────────

interface PendingUsername {
  username: string;
  generated_at: string;
}

interface UserRecord {
  id: string;
  username: string;
  avatar_emoji: string;
  avatar_bg_colour: string;
  created_at: string;
  last_seen_at: string;
  is_active: boolean;
}

interface PoolStats {
  total: number;
  available: number;
  claimed: number;
}

// ── Components ─────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: (pw: string) => void }) {
  const [password, setPassword] = useState('');
  return (
    <div style={{ padding: '2rem', maxWidth: 400, margin: '0 auto' }}>
      <h1>A.R.C. Admin</h1>
      <p>Enter admin password:</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onLogin(password)}
        style={{ padding: '8px', width: '100%', marginBottom: '8px' }}
      />
      <button onClick={() => onLogin(password)} style={btnStyle}>
        Login
      </button>
    </div>
  );
}

function UsernameReview() {
  const [pending, setPending] = useState<PendingUsername[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('username_pending_review')
      .select('*')
      .is('approved', null)
      .order('generated_at', { ascending: false });
    setPending(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const review = async (username: string, approved: boolean) => {
    if (!supabase) return;
    await supabase
      .from('username_pending_review')
      .update({ approved, reviewed_at: new Date().toISOString() })
      .eq('username', username);

    if (approved) {
      await supabase
        .from('username_pool')
        .insert({ username, source: 'llm_approved' });
    }
    fetchPending();
  };

  if (loading) return <p>Loading pending usernames...</p>;

  return (
    <div>
      <h2>Username Review ({pending.length} pending)</h2>
      {pending.length === 0 ? (
        <p style={{ color: '#666' }}>No usernames to review.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th>Username</th><th>Generated</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.username} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.username}</td>
                <td style={{ padding: '8px', color: '#666' }}>
                  {new Date(p.generated_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '8px' }}>
                  <button onClick={() => review(p.username, true)} style={{ ...btnStyle, background: '#4a9c5d' }}>
                    Approve
                  </button>
                  <button onClick={() => review(p.username, false)} style={{ ...btnStyle, background: '#c0392b', marginLeft: 8 }}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PoolStatus() {
  const [stats, setStats] = useState<PoolStats>({ total: 0, available: 0, claimed: 0 });

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: all } = await supabase.from('username_pool').select('claimed_at');
      const total = all?.length ?? 0;
      const available = all?.filter((r) => !r.claimed_at).length ?? 0;
      setStats({ total, available, claimed: total - available });
    })();
  }, []);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2>Username Pool</h2>
      <div style={{ display: 'flex', gap: '2rem' }}>
        <Stat label="Total" value={stats.total} />
        <Stat label="Available" value={stats.available} colour={stats.available < 25 ? '#c0392b' : '#4a9c5d'} />
        <Stat label="Claimed" value={stats.claimed} />
      </div>
    </div>
  );
}

function Stat({ label, value, colour }: { label: string; value: number; colour?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: colour ?? '#333' }}>{value}</div>
      <div style={{ color: '#666' }}>{label}</div>
    </div>
  );
}

function UserManagement({ onInspect }: { onInspect?: (userId: string, username: string) => void }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setUsers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleActive = async (userId: string, currentActive: boolean) => {
    if (!supabase) return;
    await supabase
      .from('users')
      .update({ is_active: !currentActive })
      .eq('id', userId);
    fetchUsers();
  };

  if (loading) return <p>Loading users...</p>;

  return (
    <div>
      <h2>Users ({users.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Avatar</th><th>Username</th><th>Created</th>
            <th>Last Seen</th><th>Active</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #eee', opacity: u.is_active ? 1 : 0.5 }}>
              <td style={{ padding: '8px', fontSize: '1.5rem', background: u.avatar_bg_colour }}>
                {u.avatar_emoji}
              </td>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>{u.username}</td>
              <td style={{ padding: '8px', color: '#666' }}>
                {new Date(u.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '8px', color: '#666' }}>
                {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : 'Never'}
              </td>
              <td style={{ padding: '8px' }}>
                {u.is_active ? '✅' : '❌'}
              </td>
              <td style={{ padding: '8px' }}>
                {onInspect && (
                  <button
                    onClick={() => onInspect(u.id, u.username)}
                    style={{ ...btnStyle, background: '#2E6B8A', marginRight: 8 }}
                  >
                    Inspect
                  </button>
                )}
                <button
                  onClick={() => toggleActive(u.id, u.is_active)}
                  style={{ ...btnStyle, background: u.is_active ? '#c0392b' : '#4a9c5d' }}
                >
                  {u.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Game State Inspector ───────────────────────────────────

interface GameStateRow {
  user_id: string;
  state: Record<string, unknown>;
  level: number;
  updated_at: string;
}

function GameStateInspector({ userId, username, onBack }: { userId: string; username: string; onBack: () => void }) {
  const [row, setRow] = useState<GameStateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchState = async () => {
    if (!supabase) return;
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from('game_states')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) setErr(error.message);
    setRow(data ?? null);
    setLoading(false);
  };

  useEffect(() => { fetchState(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [userId]);

  const state = row?.state ?? {};
  const animals = Array.isArray((state as Record<string, unknown>).animals)
    ? ((state as Record<string, unknown>).animals as Array<Animal>)
    : [];
  const placedDecorations = Array.isArray((state as Record<string, unknown>).placedDecorations)
    ? ((state as Record<string, unknown>).placedDecorations as Array<Record<string, unknown>>)
    : [];
  const economy = ((state as Record<string, unknown>).economy ?? {}) as Record<string, number>;
  const earnedBadges = Array.isArray((state as Record<string, unknown>).earnedBadges)
    ? ((state as Record<string, unknown>).earnedBadges as string[])
    : [];
  const relationships = Array.isArray((state as Record<string, unknown>).relationships)
    ? ((state as Record<string, unknown>).relationships as AnimalRelationship[])
    : [];

  /** Write a new relationships array back to this user's game_state row.
   *  Also syncs the legacy `siblingId` field on animals. */
  const saveRelationships = async (nextRels: AnimalRelationship[]) => {
    if (!supabase || !row) return;
    const nextAnimals = syncSiblingIds(animals, nextRels);
    const nextState = {
      ...(row.state as Record<string, unknown>),
      relationships: nextRels,
      animals: nextAnimals,
    };
    const { error: upsertErr } = await supabase
      .from('game_states')
      .update({ state: nextState, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (upsertErr) {
      setErr(upsertErr.message);
      return;
    }
    setRow({ ...row, state: nextState, updated_at: new Date().toISOString() });
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...btnStyle, background: '#888', marginBottom: 12 }}>
        ← Back to users
      </button>
      <h2>Game State: {username}</h2>
      {loading && <p>Loading…</p>}
      {err && <p style={{ color: '#c0392b' }}>Error: {err}</p>}
      {!loading && !row && (
        <p style={{ color: '#666' }}>No saved game state for this user yet.</p>
      )}
      {row && (
        <>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <Stat label="Level" value={row.level} />
            <Stat label="Animals" value={animals.length} />
            <Stat label="Coins" value={economy.coins ?? 0} />
            <Stat label="Lifetime" value={economy.lifetimeEarnings ?? 0} />
            <Stat label="Badges" value={earnedBadges.length} />
            <Stat label="Decor placed" value={placedDecorations.length} />
          </div>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '1rem' }}>
            Last updated {new Date(row.updated_at).toLocaleString()}
          </p>

          <h3>Animals ({animals.length})</h3>
          {animals.length === 0 ? (
            <p style={{ color: '#666' }}>No animals yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Name</th>
                  <th style={{ padding: '4px 8px' }}>Species</th>
                  <th style={{ padding: '4px 8px' }}>Variant</th>
                  <th style={{ padding: '4px 8px' }}>State</th>
                  <th style={{ padding: '4px 8px' }}>Bond</th>
                  <th style={{ padding: '4px 8px' }}>Health</th>
                  <th style={{ padding: '4px 8px' }}>Sibling</th>
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => {
                  const sibId = (a as { siblingId?: string }).siblingId;
                  return (
                    <tr key={String(a.id)} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 'bold' }}>{String(a.name)}</td>
                      <td style={{ padding: '4px 8px' }}>{String(a.species)}</td>
                      <td style={{ padding: '4px 8px', color: '#666' }}>{String(a.variant ?? '—')}</td>
                      <td style={{ padding: '4px 8px' }}>{String(a.state)}</td>
                      <td style={{ padding: '4px 8px' }}>{String(a.bondLevel)}</td>
                      <td style={{ padding: '4px 8px' }}>{String(a.health)}</td>
                      <td style={{ padding: '4px 8px' }}>{sibId ? '🔗' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <RelationshipEditor
            animals={animals}
            relationships={relationships}
            onSave={saveRelationships}
          />

          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Raw state JSON</summary>
            <pre style={{
              background: '#f5efe4',
              padding: '1rem',
              borderRadius: 4,
              fontSize: 12,
              overflow: 'auto',
              maxHeight: 500,
            }}>
              {JSON.stringify(state, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

// ── Relationship Editor ────────────────────────────────────

const REL_META: Record<RelationshipType, { emoji: string; label: string; colour: string }> = {
  sibling:    { emoji: '🫂', label: 'Sibling',    colour: '#9b59b6' },
  friend:     { emoji: '💛', label: 'Friend',     colour: '#f1c40f' },
  enemy:      { emoji: '😡', label: 'Enemy',      colour: '#c0392b' },
  intolerant: { emoji: '😾', label: 'Intolerant', colour: '#e67e22' },
};

function RelationshipEditor({
  animals,
  relationships,
  onSave,
}: {
  animals: Animal[];
  relationships: AnimalRelationship[];
  onSave: (next: AnimalRelationship[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (animals.length < 2) {
    return (
      <div style={{ marginTop: '2rem', color: '#666' }}>
        <h3>Relationships</h3>
        <p>
          Need at least two animals before you can set up friendships or
          rivalries.
        </p>
      </div>
    );
  }

  const toggle = (id: string) => {
    if (picked.includes(id)) {
      setPicked(picked.filter((p) => p !== id));
    } else if (picked.length >= 2) {
      setPicked([id]);
    } else {
      setPicked([...picked, id]);
    }
  };

  const setRel = async (type: RelationshipType | null) => {
    if (picked.length !== 2) return;
    setSaving(true);
    const [a, b] = picked;
    const nextRels = type
      ? setRelationship(relationships, a, b, type)
      : clearRelationship(relationships, a, b);
    await onSave(nextRels);
    setSaving(false);
    setPicked([]);
  };

  const currentBetweenPicked: RelationshipType | undefined =
    picked.length === 2 ? getRelationship(relationships, picked[0], picked[1]) : undefined;

  // For display: group relationships by pair (dedupe the two directions)
  const seen = new Set<string>();
  const uniquePairs: { a: Animal; b: Animal; type: RelationshipType }[] = [];
  for (const r of relationships) {
    const key = [r.fromId, r.toId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const animalA = animals.find((x) => x.id === r.fromId);
    const animalB = animals.find((x) => x.id === r.toId);
    if (animalA && animalB) {
      uniquePairs.push({ a: animalA, b: animalB, type: r.type });
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3>Relationships</h3>
      <p style={{ color: '#666', fontSize: 13 }}>
        Click an animal, then click another — pick how they feel about each other.
        These affect conflicts, bond bonuses, and (later) vehicle loading on vet trips.
      </p>

      {/* Picker row — all animals as tappable chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {animals.map((a) => {
          const on = picked.includes(a.id);
          return (
            <button
              key={a.id}
              onClick={() => toggle(a.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                border: on ? '2px solid #4a9c5d' : '1px solid #ccc',
                background: on ? '#e8f5ea' : '#fff',
                color: '#333',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: on ? 'bold' : 'normal',
              }}
            >
              {a.name} <span style={{ color: '#999', fontSize: 12 }}>({a.species})</span>
            </button>
          );
        })}
      </div>

      {/* Action bar — shown once a pair is selected */}
      {picked.length === 2 && (
        <div style={{
          padding: '1rem',
          background: '#fef9ef',
          border: '1px solid #d4c8b8',
          borderRadius: 4,
          marginBottom: '1rem',
        }}>
          <div style={{ marginBottom: 8 }}>
            <strong>{animals.find((x) => x.id === picked[0])?.name}</strong>
            {' ↔ '}
            <strong>{animals.find((x) => x.id === picked[1])?.name}</strong>
            {currentBetweenPicked && (
              <span style={{ marginLeft: 12, color: REL_META[currentBetweenPicked].colour, fontWeight: 'bold' }}>
                currently {REL_META[currentBetweenPicked].emoji} {REL_META[currentBetweenPicked].label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(REL_META) as RelationshipType[]).map((t) => (
              <button
                key={t}
                onClick={() => setRel(t)}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: REL_META[t].colour,
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 'bold',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {REL_META[t].emoji} {REL_META[t].label}
              </button>
            ))}
            <button
              onClick={() => setRel(null)}
              disabled={saving}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #aaa',
                background: '#fff',
                color: '#333',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 13,
                opacity: saving ? 0.6 : 1,
              }}
            >
              Clear
            </button>
            <button
              onClick={() => setPicked([])}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #aaa',
                background: '#f5efe4',
                color: '#666',
                cursor: 'pointer',
                fontSize: 13,
                marginLeft: 'auto',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing pairs table */}
      {uniquePairs.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No relationships set yet. Pick two animals above to create one.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Pair</th>
              <th style={{ padding: '6px 8px' }}>Relationship</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {uniquePairs.map((p) => (
              <tr key={p.a.id + '|' + p.b.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px' }}>
                  <strong>{p.a.name}</strong> ↔ <strong>{p.b.name}</strong>
                </td>
                <td style={{ padding: '6px 8px', color: REL_META[p.type].colour, fontWeight: 'bold' }}>
                  {REL_META[p.type].emoji} {REL_META[p.type].label}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <button
                    onClick={async () => {
                      setSaving(true);
                      await onSave(clearRelationship(relationships, p.a.id, p.b.id));
                      setSaving(false);
                    }}
                    disabled={saving}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #c0392b',
                      background: '#fff',
                      color: '#c0392b',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Clear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Badge Progress ─────────────────────────────────────────

interface BadgeEarnedRow {
  user_id: string;
  badge_code: string;
  earned_at: string;
}

function BadgeProgress() {
  const [rows, setRows] = useState<BadgeEarnedRow[]>([]);
  const [usersById, setUsersById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      setLoading(true);
      const { data: badges } = await supabase
        .from('badges_earned')
        .select('*')
        .order('earned_at', { ascending: false });
      const { data: users } = await supabase
        .from('users')
        .select('id, username');
      const map = new Map<string, string>();
      for (const u of users ?? []) map.set(u.id, u.username);
      setUsersById(map);
      setRows(badges ?? []);
      setLoading(false);
    })();
  }, []);

  // Count earned per badge code
  const earnedByCode = new Map<string, number>();
  for (const r of rows) {
    earnedByCode.set(r.badge_code, (earnedByCode.get(r.badge_code) ?? 0) + 1);
  }

  if (loading) return <p>Loading badge data…</p>;

  return (
    <div>
      <h2>Badge Progress</h2>
      <p style={{ color: '#666' }}>
        {BADGE_DEFINITIONS.length} badges defined, {rows.length} earned across {usersById.size} users.
      </p>

      <h3 style={{ marginTop: '1.5rem' }}>Catalogue</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Code</th>
            <th style={{ padding: '6px 8px' }}>Name</th>
            <th style={{ padding: '6px 8px' }}>Description</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Earned by</th>
          </tr>
        </thead>
        <tbody>
          {BADGE_DEFINITIONS.map((b) => {
            const count = earnedByCode.get(b.code) ?? 0;
            return (
              <tr key={b.code} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{b.code}</td>
                <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{b.name}</td>
                <td style={{ padding: '6px 8px', color: '#444' }}>{b.description}</td>
                <td style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  color: count > 0 ? '#3D8A2E' : '#999',
                  fontWeight: count > 0 ? 'bold' : 'normal',
                }}>
                  {count} {count === 1 ? 'user' : 'users'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Recent badge awards</h3>
      {rows.length === 0 ? (
        <p style={{ color: '#666' }}>Nobody has earned a badge yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>User</th>
              <th style={{ padding: '6px 8px' }}>Badge</th>
              <th style={{ padding: '6px 8px' }}>Earned</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => {
              const def = BADGE_DEFINITIONS.find((b) => b.code === r.badge_code);
              return (
                <tr key={r.user_id + r.badge_code + i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>
                    {usersById.get(r.user_id) ?? '(unknown)'}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{def?.name ?? r.badge_code}</td>
                  <td style={{ padding: '6px 8px', color: '#666' }}>
                    {new Date(r.earned_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────

type Tab = 'pool' | 'review' | 'users' | 'badges' | 'state';

const TAB_LABELS: Record<Tab, string> = {
  pool: 'Username Pool',
  review: 'Review Names',
  users: 'Users',
  badges: 'Badge Progress',
  state: 'Game State',
};

function App() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('pool');
  const [inspecting, setInspecting] = useState<{ userId: string; username: string } | null>(null);

  if (!supabase) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>A.R.C. Admin Panel</h1>
        <p style={{ color: '#c0392b' }}>
          Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY
          in .env.local to connect.
        </p>
      </div>
    );
  }

  if (!authed) {
    return (
      <AdminLogin onLogin={(pw) => {
        // Simple password check — in production, use proper auth
        if (pw === import.meta.env.VITE_ADMIN_PASSWORD) {
          setAuthed(true);
        } else {
          alert('Wrong password');
        }
      }} />
    );
  }

  const handleInspect = (userId: string, username: string) => {
    setInspecting({ userId, username });
    setTab('state');
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto' }}>
      <h1>🐾 A.R.C. Admin</h1>
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['pool', 'review', 'users', 'badges', 'state'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t !== 'state') setInspecting(null);
            }}
            style={{
              ...btnStyle,
              background: tab === t ? '#4a9c5d' : '#ccc',
              color: tab === t ? '#fff' : '#333',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {tab === 'pool' && <PoolStatus />}
      {tab === 'review' && <UsernameReview />}
      {tab === 'users' && <UserManagement onInspect={handleInspect} />}
      {tab === 'badges' && <BadgeProgress />}
      {tab === 'state' && (
        inspecting ? (
          <GameStateInspector
            userId={inspecting.userId}
            username={inspecting.username}
            onBack={() => { setInspecting(null); setTab('users'); }}
          />
        ) : (
          <div>
            <h2>Game State Inspector</h2>
            <p style={{ color: '#666' }}>
              Open the <strong>Users</strong> tab and click <em>Inspect</em> on a user to view their
              saved game state — animals, economy, badges, placed decorations, raw JSON.
            </p>
          </div>
        )
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  background: '#4a9c5d',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
