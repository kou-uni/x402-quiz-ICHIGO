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

export interface Session {
  wallet: Address;
  surveyId: string;
  status: SessionStatus;
  depositTx?: Hex;
  rewardTx?: Hex;
  questionIndex: number;
  answers: AnswerRecord[];
  startedAt?: string;
  completedAt?: string;
  rewardedAt?: string;
}

const sessionKey = (wallet: string) => `session:${wallet.toLowerCase()}`;
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

export async function getSession(wallet: Address): Promise<Session | null> {
  return await store.get<Session>(sessionKey(wallet));
}

export async function setSession(s: Session): Promise<void> {
  await store.set(sessionKey(s.wallet), s);
}

export async function txAlreadyClaimed(txHash: Hex): Promise<string | null> {
  return await store.get<string>(txKey(txHash));
}

export async function recordTxClaim(txHash: Hex, wallet: Address): Promise<void> {
  await store.set(txKey(txHash), wallet.toLowerCase());
}
