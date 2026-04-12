import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

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

function UserManagement() {
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

// ── App ────────────────────────────────────────────────────

function App() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'pool' | 'review' | 'users'>('pool');

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

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <h1>🐾 A.R.C. Admin</h1>
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '8px' }}>
        {(['pool', 'review', 'users'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...btnStyle,
              background: tab === t ? '#4a9c5d' : '#ccc',
              color: tab === t ? '#fff' : '#333',
            }}
          >
            {t === 'pool' ? 'Username Pool' : t === 'review' ? 'Review Names' : 'Users'}
          </button>
        ))}
      </nav>

      {tab === 'pool' && <PoolStatus />}
      {tab === 'review' && <UsernameReview />}
      {tab === 'users' && <UserManagement />}
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
