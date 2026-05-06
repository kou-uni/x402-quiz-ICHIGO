import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Address } from 'viem';

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

/** YAML ファイルから Quest を読み込む。将来的に KV をフォールバックさせる予定。 */
export function loadQuest(id: string): Quest {
  const c = cache.get(id);
  if (c) return c;
  const file = path.join(process.cwd(), 'quests', `${id}.yaml`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = YAML.parse(raw) as Quest;
  if (parsed.id !== id) {
    throw new Error(`Quest id mismatch: file ${id}.yaml has id field ${parsed.id}`);
  }
  if (parsed.depositAmount !== undefined) {
    parsed.depositAmount = BigInt(parsed.depositAmount as unknown as number);
  }
  if (parsed.rewardAmount !== undefined) {
    parsed.rewardAmount = BigInt(parsed.rewardAmount as unknown as number);
  }
  cache.set(id, parsed);
  return parsed;
}

/** Quest が survey 形式である型ガード。 */
export function isSurveyQuest(q: Quest): q is Quest & { survey: SurveySpec } {
  return q.kind === 'survey' && !!q.survey;
}
