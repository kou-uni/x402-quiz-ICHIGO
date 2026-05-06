import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  if (await isAuthed()) redirect('/admin');

  return (
    <main
      style={{
        maxWidth: 380,
        margin: '120px auto',
        padding: 24,
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 10,
      }}
    >
      <h1 style={{ marginTop: 0 }}>Admin login</h1>
      <p className="muted">パスワードを入力してください。</p>
      <form action="/api/admin/login" method="POST">
        <input
          type="password"
          name="password"
          required
          autoFocus
          style={{
            width: '100%',
            padding: 10,
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 6,
            marginBottom: 12,
          }}
        />
        <button type="submit" style={{ width: '100%' }}>
          Login
        </button>
      </form>
      {sp.error && (
        <p className="error" style={{ marginTop: 12 }}>
          パスワードが違います。
        </p>
      )}
    </main>
  );
}
