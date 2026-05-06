import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { getSession } from '@/lib/kv';
import { loadSurvey } from '@/lib/survey';
import { config } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = body.wallet;
  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }
  const norm = getAddress(wallet);
  const session = await getSession(norm);
  const survey = loadSurvey(config.surveyId);

  if (!session) {
    return NextResponse.json({
      status: 'none',
      surveyId: survey.id,
      surveyTitle: survey.title,
      surveyIntro: survey.intro,
      totalQuestions: survey.questions.length,
      depositAmount: config.depositAmount.toString(),
      rewardAmount: config.rewardAmount.toString(),
      treasury: config.treasuryAddress,
      ichigo: config.ichigoContract,
    });
  }

  if (session.status === 'rewarded') {
    return NextResponse.json({
      status: 'rewarded',
      rewardTx: session.rewardTx,
      totalQuestions: survey.questions.length,
    });
  }

  if (session.status === 'completed' || session.status === 'rewarding') {
    return NextResponse.json({
      status: session.status,
      totalQuestions: survey.questions.length,
    });
  }

  const idx = session.questionIndex;
  const q = survey.questions[idx];
  return NextResponse.json({
    status: session.status,
    nextQuestion: q?.prompt,
    questionIndex: idx,
    totalQuestions: survey.questions.length,
  });
}
