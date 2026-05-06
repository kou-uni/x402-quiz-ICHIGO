'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract } from 'wagmi';
import { parseAbi, parseUnits, type Address, type Hex } from 'viem';

const ICHIGO_ABI = parseAbi([
  'function transfer(address to, uint256 value) returns (bool)',
]);

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as Address;
const ICHIGO = process.env.NEXT_PUBLIC_ICHIGO_CONTRACT as Address;

type Phase =
  | 'loading'
  | 'idle'
  | 'depositing'
  | 'verifying'
  | 'asking'
  | 'submitting'
  | 'completed'
  | 'rewarding'
  | 'rewarded'
  | 'already_done'
  | 'error';

function PageInner() {
  const searchParams = useSearchParams();
  const questId = useMemo(
    () => searchParams.get('q') ?? undefined,
    [searchParams]
  );

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [answer, setAnswer] = useState('');
  const [rewardTx, setRewardTx] = useState<Hex | null>(null);

  // Quest meta（サーバーから取得した値で表示）
  const [questTitle, setQuestTitle] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('100');
  const [rewardAmount, setRewardAmount] = useState('500');

  useEffect(() => {
    if (!isConnected || !address) {
      setPhase('loading');
      return;
    }
    void refreshSession(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, questId]);

  function withQuestId(payload: Record<string, unknown>) {
    return questId ? { ...payload, questId } : payload;
  }

  async function refreshSession(wallet: Address) {
    setPhase('loading');
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet })),
      });
      const s = await r.json();
      if (!r.ok) {
        setError(s.error ?? '状態取得に失敗');
        setPhase('error');
        return;
      }
      setTotalQuestions(s.totalQuestions ?? 5);
      if (s.questTitle) setQuestTitle(s.questTitle);
      if (s.depositAmount) setDepositAmount(s.depositAmount);
      if (s.rewardAmount) setRewardAmount(s.rewardAmount);

      if (s.status === 'rewarded') {
        setRewardTx(s.rewardTx);
        setPhase('already_done');
      } else if (s.status === 'completed' || s.status === 'rewarding') {
        setPhase('completed');
      } else if (s.status === 'in_progress') {
        setQuestion(s.nextQuestion);
        setQuestionIndex(s.questionIndex ?? 0);
        setPhase('asking');
      } else {
        setPhase('idle');
      }
    } catch (e) {
      setError(toMsg(e));
      setPhase('error');
    }
  }

  async function handleDeposit() {
    if (!address) return;
    setPhase('depositing');
    setError(null);
    try {
      const value = parseUnits(depositAmount, 18);
      const txHash = await writeContractAsync({
        address: ICHIGO,
        abi: ICHIGO_ABI,
        functionName: 'transfer',
        args: [TREASURY, value],
      });
      setPhase('verifying');
      const r = await fetch('/api/session/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet: address, txHash })),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? '検証に失敗しました');
        setPhase('error');
        return;
      }
      setQuestion(data.nextQuestion);
      setQuestionIndex(data.questionIndex ?? 0);
      setTotalQuestions(data.totalQuestions ?? 5);
      setPhase('asking');
    } catch (e) {
      setError(toMsg(e));
      setPhase('error');
    }
  }

  async function handleAnswer() {
    if (!address) return;
    setPhase('submitting');
    setHint(null);
    setError(null);
    try {
      const r = await fetch('/api/session/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet: address, answer })),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? 'エラー');
        setPhase('error');
        return;
      }
      if (data.notSubstantive) {
        setHint(data.reason ?? 'もう少し具体的に書いてください');
        setPhase('asking');
        return;
      }
      if (data.completed) {
        setAnswer('');
        setPhase('completed');
        return;
      }
      setQuestion(data.nextQuestion);
      setQuestionIndex(data.questionIndex ?? questionIndex + 1);
      setAnswer('');
      setPhase('asking');
    } catch (e) {
      setError(toMsg(e));
      setPhase('error');
    }
  }

  async function handleClaim() {
    if (!address) return;
    setPhase('rewarding');
    setError(null);
    try {
      const r = await fetch('/api/session/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet: address })),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? 'エラー');
        setPhase('error');
        return;
      }
      setRewardTx(data.rewardTx);
      setPhase('rewarded');
    } catch (e) {
      setError(toMsg(e));
      setPhase('error');
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '40px auto',
        padding: '0 24px 80px',
      }}
    >
      <h1 style={{ marginBottom: 4 }}>{questTitle ?? 'x402 Quest ICHIGO'}</h1>
      <p className="muted">
        {depositAmount} ICHIGO を deposit して {totalQuestions} 問答えると {rewardAmount} ICHIGO を受け取れます（1 ウォレット 1 回）。
      </p>

      <div style={{ marginTop: 16 }}>
        <ConnectButton />
      </div>

      {!isConnected && (
        <p className="muted" style={{ marginTop: 24 }}>
          まずはウォレットを Optimism で接続してください。
        </p>
      )}

      {isConnected && phase === 'loading' && (
        <p className="muted" style={{ marginTop: 24 }}>状態を読み込み中…</p>
      )}

      {isConnected && phase === 'idle' && (
        <div className="card">
          <p>
            参加するには <strong>{depositAmount} ICHIGO</strong> を treasury（{shorten(TREASURY)}）に送金してください。
            完了すると <strong>{rewardAmount} ICHIGO</strong> が返却されます。
          </p>
          <button onClick={handleDeposit}>{depositAmount} ICHIGO を deposit してスタート</button>
        </div>
      )}

      {isConnected && phase === 'depositing' && (
        <div className="card">
          <p>ウォレットで送金を承認してください…</p>
        </div>
      )}

      {isConnected && phase === 'verifying' && (
        <div className="card">
          <p>サーバーで tx を検証中…（数秒）</p>
        </div>
      )}

      {isConnected && phase === 'asking' && question && (
        <div className="card">
          <p className="muted">
            質問 {questionIndex + 1} / {totalQuestions}
          </p>
          <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5 }}>{question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="ここに回答を入力"
          />
          {hint && <p style={{ color: '#c47b00', marginTop: 8 }}>{hint}</p>}
          <div style={{ marginTop: 12 }}>
            <button onClick={handleAnswer} disabled={answer.trim().length === 0}>
              送信
            </button>
          </div>
        </div>
      )}

      {phase === 'submitting' && (
        <div className="card"><p>判定中…</p></div>
      )}

      {phase === 'completed' && (
        <div className="card">
          <p>すべての質問への回答ありがとうございました。</p>
          <button onClick={handleClaim}>{rewardAmount} ICHIGO を受け取る</button>
        </div>
      )}

      {phase === 'rewarding' && (
        <div className="card">
          <p>treasury から送金中…（数秒）</p>
        </div>
      )}

      {phase === 'rewarded' && rewardTx && (
        <div className="card">
          <p>✅ {rewardAmount} ICHIGO を送金しました。</p>
          <p className="tx">
            tx:{' '}
            <a
              href={`https://optimistic.etherscan.io/tx/${rewardTx}`}
              target="_blank"
              rel="noreferrer"
            >
              {rewardTx}
            </a>
          </p>
        </div>
      )}

      {phase === 'already_done' && (
        <div className="card">
          <p>このウォレットでは既に参加済みです。</p>
          {rewardTx && (
            <p className="tx">
              reward tx:{' '}
              <a
                href={`https://optimistic.etherscan.io/tx/${rewardTx}`}
                target="_blank"
                rel="noreferrer"
              >
                {rewardTx}
              </a>
            </p>
          )}
        </div>
      )}

      {phase === 'error' && error && (
        <div className="card">
          <p className="error">エラー: {error}</p>
          <button
            className="secondary"
            onClick={() => address && refreshSession(address)}
          >
            状態を再読み込み
          </button>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>読み込み中…</p>}>
      <PageInner />
    </Suspense>
  );
}

function shorten(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function toMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
