import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listQuestIds, getQuestRaw, setQuestRaw, type RawQuest } from '@/lib/kv';

export const runtime = 'nodejs';

/** GET /api/admin/quests — KV に投入された quest 一覧 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  const ids = await listQuestIds();
  const quests: RawQuest[] = [];
  for (const id of ids) {
    const q = await getQuestRaw(id);
    if (q) quests.push(q);
  }
  return NextResponse.json({ quests });
}

/** POST /api/admin/quests — Quest を新規作成 / 上書き */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const validation = validateQuestPayload(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const quest = validation.quest;
  // タイムスタンプ自動付与
  if (!quest.createdAt) quest.createdAt = new Date().toISOString();
  if (!quest.status) quest.status = 'draft';
  if (!quest.createdBy) quest.createdBy = 'manual';

  await setQuestRaw(quest);
  return NextResponse.json({ ok: true, quest });
}

interface ValidationOk {
  ok: true;
  quest: RawQuest;
}
interface ValidationFail {
  ok: false;
  error: string;
}
type ValidationResult = ValidationOk | ValidationFail;

function validateQuestPayload(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body must be an object' };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || !/^[a-z0-9-]+$/.test(r.id)) {
    return { ok: false, error: 'id is required, lowercase a-z 0-9 - only' };
  }
  if (r.kind !== 'survey' && r.kind !== 'task') {
    return { ok: false, error: 'kind must be "survey" or "task"' };
  }
  if (typeof r.title !== 'string' || r.title.length === 0) {
    return { ok: false, error: 'title is required' };
  }
  if (r.kind === 'survey') {
    const s = r.survey as { questions?: unknown } | undefined;
    if (!s || !Array.isArray(s.questions) || s.questions.length === 0) {
      return { ok: false, error: 'survey.questions is required for kind=survey' };
    }
  }
  // 経済値: number / string / undefined どれも許容、最終的に string で保存
  const dep =
    r.depositAmount !== undefined ? String(r.depositAmount) : undefined;
  const rew =
    r.rewardAmount !== undefined ? String(r.rewardAmount) : undefined;
  if (dep !== undefined && !/^\d+$/.test(dep)) {
    return { ok: false, error: 'depositAmount must be a non-negative integer' };
  }
  if (rew !== undefined && !/^\d+$/.test(rew)) {
    return { ok: false, error: 'rewardAmount must be a non-negative integer' };
  }

  const quest: RawQuest = {
    id: r.id,
    kind: r.kind,
    status: r.status as RawQuest['status'],
    tier: r.tier as RawQuest['tier'],
    title: r.title,
    depositAmount: dep,
    rewardAmount: rew,
    payer: r.payer as RawQuest['payer'],
    asset: r.asset as RawQuest['asset'],
    survey: r.survey,
    task: r.task,
    validation: r.validation as RawQuest['validation'],
    participantLimit: r.participantLimit as RawQuest['participantLimit'],
    deadline: r.deadline as RawQuest['deadline'],
    createdBy: r.createdBy as RawQuest['createdBy'],
    createdAt: r.createdAt as RawQuest['createdAt'],
    closedAt: r.closedAt as RawQuest['closedAt'],
  };
  return { ok: true, quest };
}
