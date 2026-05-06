import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Address } from 'viem';
import { getQuestRaw, type RawQuest } from './kv';

/** Quest の種類。v2 では 'survey' のみ実装、v3 で 'task' を追加。 */
export type QuestKind = 'survey' | 'task';

/** 報酬を受け取る主体。 */
export type Payer = 'participant' | 'quest_creator';

/** Survey 形式のサブスペック。 */
export interface SurveyQuestion {
  id: string;
  prompt: string;
  minLength?: number;
}

export interface SurveySpec {
  intro?: string;
  outro?: string;
  questions: SurveyQuestion[];
}

/** （v3 で） Task 形式のサブスペック — 型のみ先行定義。 */
export interface TaskSpec {
  short_instruction: string;
  detailed_spec?: string;
  worked_example?: { input: unknown; output: unknown };
  output_schema?: unknown; // JSONSchema
}

/** 検証ルール — composable。v2 では `llm-judge` のみ実装。 */
export type ValidationRule =
  | { type: 'schema' }
  | { type: 'llm-judge'; prompt?: string; leniency?: 'low' | 'medium' | 'high' }
  | { type: 'regex'; field?: string; pattern: string }
  | { type: 'http-callback'; url: string };

export interface Quest {
  id: string;
  kind: QuestKind;
  tier?: 1 | 2 | 3;
  status?: 'draft' | 'active' | 'closed';
  title: string;

  /** 経済パラメータ（人間表記、 internally × 10^decimals される）。 */
  depositAmount?: bigint;
  rewardAmount?: bigint;
  /** 報酬を受ける主体。survey は participant、task は quest_creator。 */
  payer?: Payer;
  /** 資産コントラクト。省略時は env の ICHIGO_CONTRACT。 */
  asset?: Address;

  /** kind 別のサブスペック。 */
  survey?: SurveySpec;
  task?: TaskSpec;

  /** 検証ルール（quest 別に composable）。 */
  validation?: ValidationRule[];

  /** ライフサイクル。 */
  participantLimit?: number;
  deadline?: string; // ISO 8601
  createdBy?: 'manual' | 'hermes';
  createdAt?: string;
  closedAt?: string;
}

const cache = new Map<string, Quest>();

function normalizeQuest(parsed: any, id: string): Quest {
  if (parsed.id !== id) {
    throw new Error(`Quest id mismatch: expected ${id}, got ${parsed.id}`);
  }
  if (parsed.depositAmount !== undefined && typeof parsed.depositAmount !== 'bigint') {
    parsed.depositAmount = BigInt(parsed.depositAmount as string | number);
  }
  if (parsed.rewardAmount !== undefined && typeof parsed.rewardAmount !== 'bigint') {
    parsed.rewardAmount = BigInt(parsed.rewardAmount as string | number);
  }
  return parsed as Quest;
}

/** YAML ファイルから Quest を読み込む（同期）。 */
export function loadQuest(id: string): Quest {
  const c = cache.get(id);
  if (c) return c;
  const file = path.join(process.cwd(), 'quests', `${id}.yaml`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = YAML.parse(raw);
  const q = normalizeQuest(parsed, id);
  cache.set(id, q);
  return q;
}

/**
 * KV → YAML の順で Quest を取得（非同期）。
 * Hermes が KV に投入した quest と、リポにバンドルされた YAML quest の両方を
 * 等しく扱える。Admin / 公開 API ルートで使う想定。
 */
export async function loadQuestAsync(id: string): Promise<Quest> {
  const fromKv = await getQuestRaw(id);
  if (fromKv) {
    return normalizeQuest({ ...fromKv }, id);
  }
  return loadQuest(id);
}

/** Quest が survey 形式である型ガード。 */
export function isSurveyQuest(q: Quest): q is Quest & { survey: SurveySpec } {
  return q.kind === 'survey' && !!q.survey;
}

/** Quest を JSON シリアライズ可能な形にする（bigint → string）。 */
export function questToRaw(q: Quest): RawQuest {
  return {
    id: q.id,
    kind: q.kind,
    status: q.status,
    tier: q.tier,
    title: q.title,
    depositAmount: q.depositAmount?.toString(),
    rewardAmount: q.rewardAmount?.toString(),
    payer: q.payer,
    asset: q.asset,
    survey: q.survey,
    task: q.task,
    validation: q.validation,
    participantLimit: q.participantLimit,
    deadline: q.deadline,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    closedAt: q.closedAt,
  };
}
