'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract } from 'wagmi';
import {
  createPublicClient,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { optimism } from 'viem/chains';

const ICHIGO_ABI = parseAbi([
  'function transfer(address to, uint256 value) returns (bool)',
]);

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as Address;
const ICHIGO = process.env.NEXT_PUBLIC_ICHIGO_CONTRACT as Address;

// ブラウザから直接 Optimism mainnet RPC を読む（無料の public endpoint）
const publicClient = createPublicClient({
  chain: optimism,
  transport: http(process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL),
});

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

// ─── LiveLog ─────────────────────────────────────────────────
// コンソール風の進行ログ。コメント (// ...) と step (✓/⟳/✗) と callout (💎ポップ吹き出し) を混ぜる。
type Entry =
  | { kind: 'comment'; text: string }
  | { kind: 'callout'; text: string; emoji?: string }
  | { kind: 'step'; id: string; label: string; status: 'running' | 'done' | 'failed'; detail?: string };

function useLiveLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  return {
    entries,
    reset: () => setEntries([]),
    comment: (text: string) =>
      setEntries((p) => [...p, { kind: 'comment', text }]),
    callout: (text: string, emoji?: string) =>
      setEntries((p) => [...p, { kind: 'callout', text, emoji }]),
    start: (id: string, label: string) =>
      setEntries((p) => [...p, { kind: 'step', id, label, status: 'running' }]),
    done: (id: string, detail?: string) =>
      setEntries((p) =>
        p.map((e) =>
          e.kind === 'step' && e.id === id ? { ...e, status: 'done', detail } : e
        )
      ),
    fail: (id: string, detail?: string) =>
      setEntries((p) =>
        p.map((e) =>
          e.kind === 'step' && e.id === id ? { ...e, status: 'failed', detail } : e
        )
      ),
  };
}

function LiveLog({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="live-log" role="log" aria-live="polite">
      <div className="log-prompt">x402 ▸ live console</div>
      {entries.map((e, i) =>
        e.kind === 'comment' ? (
          <div key={`c${i}`} className="log-comment">
            {e.text.split('\n').map((line, j) => (
              <div key={j}>// {line}</div>
            ))}
          </div>
        ) : e.kind === 'callout' ? (
          <div key={`x${i}`} className="log-callout" role="note">
            <span className="log-callout-emoji" aria-hidden>
              {e.emoji ?? '💎'}
            </span>
            <span className="log-callout-text">{e.text}</span>
          </div>
        ) : (
          <div key={e.id} className={`log-step log-step-${e.status}`}>
            <span className="log-icon" aria-hidden>
              {e.status === 'running' ? '⟳' : e.status === 'done' ? '✓' : '✗'}
            </span>
            <span className="log-label">{e.label}</span>
            {e.detail && <div className="log-detail">└ {e.detail}</div>}
          </div>
        )
      )}
    </div>
  );
}

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

  const [questTitle, setQuestTitle] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('100');
  const [rewardAmount, setRewardAmount] = useState('500');

  const log = useLiveLog();

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
    log.reset();
    setPhase('depositing');
    setError(null);

    log.comment(
      'x402: server が「402 Payment Required」を返したら、\n' +
      'client (あなたの wallet) が支払いに署名 → 再送、というフロー。\n' +
      'ICHIGO は permit / EIP-3009 非対応なので、署名対象は実 tx そのもの。'
    );

    log.start('sign', 'Wallet で transfer に署名');
    let txHash: Hex;
    try {
      const value = parseUnits(depositAmount, 18);
      txHash = await writeContractAsync({
        address: ICHIGO,
        abi: ICHIGO_ABI,
        functionName: 'transfer',
        args: [TREASURY, value],
      });
      log.done('sign', `broadcasted: ${shorten(txHash)}`);
      log.callout('ここが x402 の "署名" 部分！— client が支払いに sign する瞬間', '💎');
    } catch (e) {
      log.fail('sign', toMsg(e));
      setError(toMsg(e));
      setPhase('error');
      return;
    }

    log.comment(
      'ここからは server を介さず、\n' +
      'あなたのブラウザが直接 Optimism RPC を polling して finality を確認する。'
    );
    log.start('mine', 'Block への取り込みを待機');
    let receipt;
    try {
      const t0 = Date.now();
      receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      log.done(
        'mine',
        `block ${receipt.blockNumber.toString()} で mined (${dt}s, gas ${receipt.gasUsed.toString()})`
      );
    } catch (e) {
      log.fail('mine', toMsg(e));
      setError(toMsg(e));
      setPhase('error');
      return;
    }

    log.comment(
      'server が tx receipt の logs から Transfer event を decode して、\n' +
      'from / to / amount が要件と一致するか検証する（"402 → sign → retry" の retry）。'
    );
    log.start('verify', 'Server-side で Transfer event を検証');
    setPhase('verifying');
    try {
      const r = await fetch('/api/session/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet: address, txHash })),
      });
      const data = await r.json();
      if (!r.ok) {
        log.fail('verify', data.error ?? '検証失敗');
        setError(data.error ?? '検証失敗');
        setPhase('error');
        return;
      }
      log.done(
        'verify',
        `${depositAmount} ICHIGO matched (${shorten(address)} → ${shorten(TREASURY)})`
      );
      log.callout('ここが x402 の "検証 + retry"！— server が支払い証明を検証して資源を解放', '💎');
      log.comment('検証通過 → session を in_progress に。Quest 開始。');

      setQuestion(data.nextQuestion);
      setQuestionIndex(data.questionIndex ?? 0);
      setTotalQuestions(data.totalQuestions ?? 5);
      setPhase('asking');
    } catch (e) {
      log.fail('verify', toMsg(e));
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

    log.comment(
      '─── Reward フェーズ ───\n' +
      '本アプリは x402 を反転: server (treasury wallet) が client へ送る。\n' +
      'treasury 鍵は Vercel functions だけが保持。あなたの wallet 操作は不要。'
    );

    log.start('sign-server', 'Treasury が reward tx を署名 + broadcast');
    let rewardTxHash: Hex;
    try {
      const r = await fetch('/api/session/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withQuestId({ wallet: address })),
      });
      const data = await r.json();
      if (!r.ok) {
        log.fail('sign-server', data.error ?? 'reward 失敗');
        setError(data.error ?? 'reward 失敗');
        setPhase('error');
        return;
      }
      rewardTxHash = data.rewardTx;
      log.done('sign-server', `tx: ${shorten(rewardTxHash)}`);
      log.callout('ここは x402 を反転させた独自実装！— 通常は client → server に払うが、このアプリは server → client', '🔄');
    } catch (e) {
      log.fail('sign-server', toMsg(e));
      setError(toMsg(e));
      setPhase('error');
      return;
    }

    log.comment(
      'reward tx の finality も、ブラウザから直接 RPC で待つ。\n' +
      'tx hash を渡すだけで、誰でもチェーン状態を読める = Web3 の透明性。'
    );
    log.start('mine-reward', 'Block への取り込みを待機');
    try {
      const t0 = Date.now();
      const r = await publicClient.waitForTransactionReceipt({
        hash: rewardTxHash,
      });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      log.done(
        'mine-reward',
        `block ${r.blockNumber.toString()} で mined (${dt}s)`
      );
    } catch (e) {
      log.fail('mine-reward', toMsg(e));
      // 致命的ではない: tx は最終的に確定する
    }

    log.comment(
      `あなたの wallet 残高に ${rewardAmount} ICHIGO が反映される（MetaMask で確認可）。`
    );
    log.start('arrive', `${rewardAmount} ICHIGO 受領完了`);
    log.done('arrive', 'Quest 完走 🎉');

    setRewardTx(rewardTxHash);
    setPhase('rewarded');
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

      <LiveLog entries={log.entries} />

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
