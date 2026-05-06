import { redirect } from 'next/navigation';
import { kv } from '@vercel/kv';
import { isAuthed } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AnswerRecord {
  questionId: string;
  prompt: string;
  answer: string;
}

interface Session {
  wallet: string;
  /** v1 (main) では surveyId、v2 では questId が入る */
  surveyId?: string;
  questId?: string;
  status: string;
  questionIndex: number;
  answers: AnswerRecord[];
  startedAt?: string;
  completedAt?: string;
  rewardedAt?: string;
  depositTx?: string;
  rewardTx?: string;
}

async function fetchAllSessions(): Promise<Session[]> {
  if (!process.env.KV_REST_API_URL) return [];
  const sessions: Session[] = [];
  let cursor: string | number = '0';
  let safety = 0;
  do {
    const result: [string | number, string[]] = await kv.scan(cursor, {
      match: 'session:*',
      count: 100,
    });
    cursor = result[0];
    const keys = result[1];
    for (const key of keys) {
      const s = await kv.get<Session>(key);
      if (s) sessions.push(s);
    }
    if (++safety > 100) break; // 万一の暴走止め
  } while (String(cursor) !== '0');
  // 新しい順
  return sessions.sort((a, b) =>
    (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
  );
}

export default async function AdminDashboard() {
  if (!(await isAuthed())) redirect('/admin/login');

  const sessions = await fetchAllSessions();
  const counts = {
    total: sessions.length,
    in_progress: sessions.filter((s) => s.status === 'in_progress').length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    rewarded: sessions.filter((s) => s.status === 'rewarded').length,
    rewarding: sessions.filter((s) => s.status === 'rewarding').length,
  };

  return (
    <main style={{ maxWidth: 1100, margin: '24px auto', padding: '0 24px 80px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
        <form action="/api/admin/logout" method="POST">
          <button className="secondary" type="submit">Logout</button>
        </form>
      </header>

      <div className="card" style={{ marginTop: 0 }}>
        <strong>Sessions: {counts.total}</strong>{' '}
        <span className="muted">
          (rewarded {counts.rewarded} / completed {counts.completed} / in progress{' '}
          {counts.in_progress} / rewarding {counts.rewarding})
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          まだ session がありません。
        </p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                <Th>Wallet</Th>
                <Th>Quest</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th>Answers</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <SessionRow key={s.wallet + (s.questId ?? s.surveyId ?? '')} session={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: 12 }}>
        Vercel KV から直接読み込み。1 cookie = 24 時間。再読み込みは pull-to-refresh / リロード。
      </p>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: 13 }}>
      {children}
    </th>
  );
}

function Td({ children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f3f3f3',
        fontSize: 13,
        verticalAlign: 'top',
        ...(rest.style ?? {}),
      }}
    >
      {children}
    </td>
  );
}

function SessionRow({ session }: { session: Session }) {
  const quest = session.questId ?? session.surveyId ?? '(unknown)';
  const wallet = session.wallet;
  const short = wallet.slice(0, 6) + '…' + wallet.slice(-4);
  const status = session.status;
  const started = session.startedAt
    ? new Date(session.startedAt).toLocaleString('ja-JP')
    : '-';

  return (
    <tr>
      <Td style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
        <span title={wallet}>{short}</span>
      </Td>
      <Td>{quest}</Td>
      <Td>
        <span className={`badge badge-${status}`}>{status}</span>
      </Td>
      <Td>{started}</Td>
      <Td style={{ minWidth: 320 }}>
        <details>
          <summary style={{ cursor: 'pointer' }}>
            {session.answers?.length ?? 0} answer
            {(session.answers?.length ?? 0) !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 8 }}>
            {(session.answers ?? []).map((a, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: '1px dashed #eee',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Q{i + 1}. {a.prompt}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{a.answer}</div>
              </div>
            ))}
            {session.depositTx && (
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                deposit:{' '}
                <a
                  href={`https://optimistic.etherscan.io/tx/${session.depositTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {session.depositTx.slice(0, 10)}…
                </a>
              </div>
            )}
            {session.rewardTx && (
              <div className="muted" style={{ fontSize: 11 }}>
                reward:{' '}
                <a
                  href={`https://optimistic.etherscan.io/tx/${session.rewardTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {session.rewardTx.slice(0, 10)}…
                </a>
              </div>
            )}
          </div>
        </details>
      </Td>
    </tr>
  );
}
