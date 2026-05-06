import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getQuestRaw, setQuestRaw, deleteQuest } from '@/lib/kv';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/quests/{id} */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  const { id } = await ctx.params;
  const q = await getQuestRaw(id);
  if (!q) {
    return NextResponse.json({ error: 'not found in KV' }, { status: 404 });
  }
  return NextResponse.json({ quest: q });
}

/** PATCH /api/admin/quests/{id} — 部分更新（status / closedAt 中心） */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  const { id } = await ctx.params;
  const existing = await getQuestRaw(id);
  if (!existing) {
    return NextResponse.json({ error: 'not found in KV' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const patch = body as Partial<typeof existing>;

  // 許可するフィールドのみ反映
  const ALLOWED = [
    'status',
    'tier',
    'title',
    'depositAmount',
    'rewardAmount',
    'payer',
    'survey',
    'task',
    'validation',
    'participantLimit',
    'deadline',
    'closedAt',
  ] as const;
  for (const k of ALLOWED) {
    if (k in patch) {
      // @ts-expect-error generic narrow
      existing[k] = patch[k];
    }
  }
  // status を closed にしたら closedAt も自動付与
  if (patch.status === 'closed' && !existing.closedAt) {
    existing.closedAt = new Date().toISOString();
  }

  await setQuestRaw(existing);
  return NextResponse.json({ ok: true, quest: existing });
}

/** DELETE /api/admin/quests/{id} — KV からのみ削除（YAML には影響しない） */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  const { id } = await ctx.params;
  await deleteQuest(id);
  return NextResponse.json({ ok: true });
}
