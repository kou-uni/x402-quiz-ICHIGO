import { cookies } from 'next/headers';
import crypto from 'node:crypto';

/**
 * 管理ダッシュボード用のシンプルなパスワード認証。
 *
 * - ADMIN_PASSWORD env var をパスワードとして使う
 * - 成功時に HMAC-signed cookie (admin_session) を発行
 * - cookie 値は HMAC(ADMIN_PASSWORD, "logged-in")
 * - cookie は HttpOnly + Secure（本番） + SameSite=Lax
 *
 * セキュリティ的にこれは「内部運用ツール」想定の最小実装。
 * 1 ユーザー 1 パスワード前提。本格運用には別途強化が必要。
 */

export const ADMIN_COOKIE_NAME = 'admin_session';
const COOKIE_TTL_SECONDS = 60 * 60 * 24; // 1 day

function getPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('ADMIN_PASSWORD env var is not set');
  return pw;
}

export function makeAuthValue(): string {
  return crypto
    .createHmac('sha256', getPassword())
    .update('logged-in')
    .digest('hex');
}

export function verifyAuthValue(value: string | undefined): boolean {
  if (!value) return false;
  let expected: string;
  try {
    expected = makeAuthValue();
  } catch {
    return false;
  }
  // 長さが違うと timingSafeEqual が throw するので先に確認
  if (value.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(value, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function isAuthed(): Promise<boolean> {
  const c = await cookies();
  return verifyAuthValue(c.get(ADMIN_COOKIE_NAME)?.value);
}

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_TTL_SECONDS,
};
