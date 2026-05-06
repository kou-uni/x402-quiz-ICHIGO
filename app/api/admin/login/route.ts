import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, COOKIE_OPTS, makeAuthValue } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD not configured on server' },
      { status: 503 }
    );
  }

  const form = await req.formData();
  const password = form.get('password');

  if (typeof password !== 'string' || password !== adminPw) {
    return NextResponse.redirect(new URL('/admin/login?error=1', req.url));
  }

  const res = NextResponse.redirect(new URL('/admin', req.url));
  res.cookies.set(ADMIN_COOKIE_NAME, makeAuthValue(), COOKIE_OPTS);
  return res;
}
