import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { isAuthed } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/**
 * 指定 session を KV から削除（テスト用 / admin 限定）。
 * /admin の cookie auth 経由でのみ呼べる。
 *
 * 受け付ける body:
 * - { wallet: '0x...' }                v1 互換: session:0xWALLET を消す
 * - { questId: '...', wallet: '0x...' } v2: session:questId:0xWALLET を消す
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const wallet = form.get('wallet');
  const questId = form.get('questId');

  if (typeof wallet !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.redirect(new URL('/admin?reset=err', req.url));
  }

  const key =
    typeof questId === 'string' && questId.length > 0
      ? `session:${questId}:${wallet.toLowerCase()}`
      : `session:${wallet.toLowerCase()}`;

  await kv.del(key);
  return NextResponse.redirect(new URL('/admin?reset=ok', req.url));
}
