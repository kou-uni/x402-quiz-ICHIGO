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

const useKv = !!process.env.KV_REST_API_URL;
const memory = new Map<string, unknown>();

const store = useKv
  ? {
      get: <T>(k: string) => kv.get<T>(k),
      set: (k: string, v: unknown) => kv.set(k, v),
    }
  : {
      get: async <T>(k: string) => (memory.get(k) as T | undefined) ?? null,
      set: async (k: string, v: unknown) => {
        memory.set(k, v);
      },
    };

export async function getSession(
  questId: string,
  wallet: Address
): Promise<Session | null> {
  return await store.get<Session>(sessionKey(questId, wallet));
}

export async function setSession(s: Session): Promise<void> {
  await store.set(sessionKey(s.questId, s.wallet), s);
}

export async function txAlreadyClaimed(txHash: Hex): Promise<string | null> {
  return await store.get<string>(txKey(txHash));
}

export async function recordTxClaim(
  txHash: Hex,
  wallet: Address
): Promise<void> {
  await store.set(txKey(txHash), wallet.toLowerCase());
}
