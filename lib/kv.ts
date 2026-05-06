import { kv } from '@vercel/kv';
import type { Address, Hex } from 'viem';

export type SessionStatus =
  | 'none'
  | 'in_progress'
  | 'completed'
  | 'rewarding'
  | 'rewarded';

export interface AnswerRecord {
  questionId: string;
  prompt: string;
  answer: string;
}

/**
 * Session は (questId, wallet) のペアで一意。
 * 同じ wallet が異なる quest に同時参加できる。
 */
export interface Session {
  questId: string;
  wallet: Address;
  status: SessionStatus;
  depositTx?: Hex;
  rewardTx?: Hex;
  questionIndex: number;
  answers: AnswerRecord[];
  startedAt?: string;
  completedAt?: string;
  rewardedAt?: string;
}

const sessionKey = (questId: string, wallet: string) =>
  `session:${questId}:${wallet.toLowerCase()}`;

/** tx hash 単位のリプレイ防止は global（quest を跨いで同じ tx を再利用させない）。 */
const txKey = (txHash: string) => `tx:${txHash.toLowerCase()}`;

/** Quest CRUD（KV 上）用のキー。 */
const questKey = (id: string) => `quest:${id}`;
const QUEST_INDEX_KEY = 'quest:__index__';

const useKv = !!process.env.KV_REST_API_URL;
const memory = new Map<string, unknown>();

const store = useKv
  ? {
      get: <T>(k: string) => kv.get<T>(k),
      set: (k: string, v: unknown) => kv.set(k, v),
      del: (k: string) => kv.del(k),
    }
  : {
      get: async <T>(k: string) => (memory.get(k) as T | undefined) ?? null,
      set: async (k: string, v: unknown) => {
        memory.set(k, v);
      },
      del: async (k: string) => {
        memory.delete(k);
      },
    };

// ─── Sessions ─────────────────────────────────────────────────────────

export async function getSession(
  questId: string,
  wallet: Address
): Promise<Session | null> {
  return await store.get<Session>(sessionKey(questId, wallet));
}

export async function setSession(s: Session): Promise<void> {
  await store.set(sessionKey(s.questId, s.wallet), s);
}

// ─── tx replay ────────────────────────────────────────────────────────

export async function txAlreadyClaimed(txHash: Hex): Promise<string | null> {
  return await store.get<string>(txKey(txHash));
}

export async function recordTxClaim(
  txHash: Hex,
  wallet: Address
): Promise<void> {
  await store.set(txKey(txHash), wallet.toLowerCase());
}

// ─── Quest CRUD (KV) ──────────────────────────────────────────────────
// `loadQuest()` (lib/quest.ts) は YAML を読む同期関数。Admin が KV に置いた
// Quest はこちら経由で読み書きする。Admin route 等では「KV 優先 → YAML フォールバック」で
// 取得する想定。

/** Quest を KV 上で表現する形（JSON シリアライズ可能、bigint は string）。 */
export interface RawQuest {
  id: string;
  kind: 'survey' | 'task';
  status?: 'draft' | 'active' | 'closed';
  tier?: 1 | 2 | 3;
  title: string;
  /** 人間表記（例: "100"）。bigint シリアライズ困難なので string で持つ。 */
  depositAmount?: string;
  rewardAmount?: string;
  payer?: 'participant' | 'quest_creator';
  asset?: string;
  survey?: unknown;
  task?: unknown;
  validation?: unknown[];
  participantLimit?: number;
  deadline?: string;
  createdBy?: 'manual' | 'hermes';
  createdAt?: string;
  closedAt?: string;
}

export async function getQuestRaw(id: string): Promise<RawQuest | null> {
  return await store.get<RawQuest>(questKey(id));
}

export async function setQuestRaw(q: RawQuest): Promise<void> {
  await store.set(questKey(q.id), q);
  // index に入れる
  const index = (await store.get<string[]>(QUEST_INDEX_KEY)) ?? [];
  if (!index.includes(q.id)) {
    index.push(q.id);
    await store.set(QUEST_INDEX_KEY, index);
  }
}

export async function listQuestIds(): Promise<string[]> {
  return (await store.get<string[]>(QUEST_INDEX_KEY)) ?? [];
}

export async function deleteQuest(id: string): Promise<void> {
  await store.del(questKey(id));
  const index = (await store.get<string[]>(QUEST_INDEX_KEY)) ?? [];
  const next = index.filter((x) => x !== id);
  await store.set(QUEST_INDEX_KEY, next);
}
