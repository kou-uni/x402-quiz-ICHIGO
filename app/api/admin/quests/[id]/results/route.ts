import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { loadQuestAsync } from '@/lib/quest';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/quests/{id}/results
 *
 * v2 段階のスケルトン: Quest メタ情報のみ返す。
 * 実際のセッション集計（参加者数、回答テキスト集約）は v2.x で追加予定。
 *
 * Vercel KV の SCAN による session iterate は Upstash の制約があるので、
 * v2.x では「session 確定時に quest:{id}:participants list へ append する」
 * 方式に変える想定。
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  const { id } = await ctx.params;
  let quest;
  try {
    quest = await loadQuestAsync(id);
  } catch {
    return NextResponse.json({ error: 'quest not found' }, { status: 404 });
  }

  return NextResponse.json({
    questId: quest.id,
    title: quest.title,
    status: quest.status ?? 'active',
    note: 'aggregation not yet implemented (v2.x). returns metadata only.',
    participants: [],
    rewarded: [],
    answers: [],
  });
}
