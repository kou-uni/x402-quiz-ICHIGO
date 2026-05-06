import { NextRequest, NextResponse } from 'next/server';
import {
  isAddress,
  getAddress,
  decodeEventLog,
  type Hex,
  type Address,
} from 'viem';
import { publicClient, ICHIGO_ABI } from '@/lib/chain';
import {
  getSession,
  setSession,
  txAlreadyClaimed,
  recordTxClaim,
  type Session,
} from '@/lib/kv';
import { config, depositAmountWei } from '@/lib/config';
import { loadQuest, isSurveyQuest } from '@/lib/quest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = body.wallet;
  const txHash = body.txHash;
  const questId = (body.questId as string) || config.defaultQuestId;

  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: 'invalid txHash' }, { status: 400 });
  }

  const norm = getAddress(wallet) as Address;
  const txHex = txHash as Hex;

  let quest;
  try {
    quest = loadQuest(questId);
  } catch {
    return NextResponse.json({ error: `quest not found: ${questId}` }, { status: 404 });
  }
  if (!isSurveyQuest(quest)) {
    return NextResponse.json(
      { error: `quest ${questId} is kind=${quest.kind}, not yet supported in v2` },
      { status: 501 }
    );
  }

  const existing = await getSession(questId, norm);
  if (existing?.status === 'rewarded') {
    return NextResponse.json(
      { error: 'this wallet has already participated in this quest' },
      { status: 409 }
    );
  }
  if (existing && existing.status !== 'none') {
    return NextResponse.json(
      { error: `session already in state ${existing.status}` },
      { status: 409 }
    );
  }

  const claimedBy = await txAlreadyClaimed(txHex);
  if (claimedBy && claimedBy !== norm.toLowerCase()) {
    return NextResponse.json(
      { error: 'tx already used by another wallet' },
      { status: 409 }
    );
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHex });
  } catch {
    return NextResponse.json(
      { error: 'tx not found yet — please retry in a few seconds' },
      { status: 404 }
    );
  }
  if (receipt.status !== 'success') {
    return NextResponse.json({ error: 'tx not successful' }, { status: 400 });
  }

  const expected = depositAmountWei(quest);
  const treasury = getAddress(config.treasuryAddress);
  const ichigo = getAddress(config.ichigoContract);
  let matched = false;

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== ichigo) continue;
    try {
      const decoded = decodeEventLog({
        abi: ICHIGO_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as unknown as {
        from: Address;
        to: Address;
        value: bigint;
      };
      if (
        getAddress(args.from) === norm &&
        getAddress(args.to) === treasury &&
        args.value === expected
      ) {
        matched = true;
        break;
      }
    } catch {
      // ignore non-Transfer logs
    }
  }

  if (!matched) {
    const human = (quest.depositAmount ?? config.defaultDepositAmount).toString();
    return NextResponse.json(
      {
        error: `tx does not contain a matching Transfer of ${human} ICHIGO from ${norm} to ${treasury}`,
      },
      { status: 400 }
    );
  }

  await recordTxClaim(txHex, norm);

  const session: Session = {
    questId: quest.id,
    wallet: norm,
    status: 'in_progress',
    depositTx: txHex,
    questionIndex: 0,
    answers: [],
    startedAt: new Date().toISOString(),
  };
  await setSession(session);

  const q = quest.survey.questions[0];
  return NextResponse.json({
    status: 'in_progress',
    questId: quest.id,
    nextQuestion: q.prompt,
    questionIndex: 0,
    totalQuestions: quest.survey.questions.length,
  });
}
