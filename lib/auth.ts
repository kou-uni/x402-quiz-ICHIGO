import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin / Hermes 用 Bearer 認証。
 *
 * 環境変数 `ADMIN_TOKEN` と一致する Bearer token を要求する。
 * Hermes 統合時はこの 1 トークンを Hermes 側に渡すだけで済む。
 *
 * 使い方:
 *   const auth = requireAdmin(req);
 *   if (auth) return auth; // 認証失敗ならレスポンスがそのまま返る
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN not configured on server' },
      { status: 503 }
    );
  }
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m || m[1] !== token) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="admin"' } }
    );
  }
  return null;
}
