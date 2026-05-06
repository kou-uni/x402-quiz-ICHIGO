import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { getSession } from '@/lib/kv';
import { loadQuest, isSurveyQuest } from '@/lib/quest';
import { config } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = body.wallet;
  const questId = (body.questId as string) || config.defaultQuestId;
  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }
  const norm = getAddress(wallet);

  let quest;
  try {
    quest = loadQuest(questId);
  } catch (e) {
    return NextResponse.json(
      { error: `quest not found: ${questId}` },
      { status: 404 }
    );
  }
  if (!isSurveyQuest(quest)) {
    return NextResponse.json(
      { error: `quest ${questId} is kind=${quest.kind}, not yet supported in v2` },
      { status: 501 }
    );
  }

  const session = await getSession(questId, norm);
  const totalQuestions = quest.survey.questions.length;
  const deposit = (quest.depositAmount ?? config.defaultDepositAmount).toString();
  const reward = (quest.rewardAmount ?? config.defaultRewardAmount).toString();

  if (!session) {
    return NextResponse.json({
      status: 'none',
      questId: quest.id,
      questKind: quest.kind,
      questTitle: quest.title,
      questIntro: quest.survey.intro,
      totalQuestions,
      depositAmount: deposit,
      rewardAmount: reward,
      treasury: config.treasuryAddress,
      ichigo: config.ichigoContract,
    });
  }

  if (session.status === 'rewarded') {
    return NextResponse.json({
      status: 'rewarded',
      questId: quest.id,
      rewardTx: session.rewardTx,
      totalQuestions,
    });
  }

  if (session.status === 'completed' || session.status === 'rewarding') {
    return NextResponse.json({
      status: session.status,
      questId: quest.id,
      totalQuestions,
    });
  }

  const idx = session.questionIndex;
  const q = quest.survey.questions[idx];
  return NextResponse.json({
    status: session.status,
    questId: quest.id,
    nextQuestion: q?.prompt,
    questionIndex: idx,
    totalQuestions,
  });
}
