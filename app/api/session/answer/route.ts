import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress, type Address } from 'viem';
import { getSession, setSession } from '@/lib/kv';
import { loadQuest, isSurveyQuest } from '@/lib/quest';
import { config } from '@/lib/config';
import { judgeAnswer } from '@/lib/openai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = body.wallet;
  const answer = String(body.answer ?? '').trim();
  const questId = (body.questId as string) || config.defaultQuestId;

  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: 'empty answer' }, { status: 400 });
  }

  const norm = getAddress(wallet) as Address;
  const session = await getSession(questId, norm);
  if (!session) {
    return NextResponse.json({ error: 'no session' }, { status: 404 });
  }
  if (session.status !== 'in_progress') {
    return NextResponse.json(
      { error: `session in state ${session.status}` },
      { status: 409 }
    );
  }

  let quest;
  try {
    quest = loadQuest(session.questId);
  } catch {
    return NextResponse.json({ error: 'quest not found' }, { status: 500 });
  }
  if (!isSurveyQuest(quest)) {
    return NextResponse.json({ error: 'quest is not a survey' }, { status: 500 });
  }

  const q = quest.survey.questions[session.questionIndex];
  if (!q) {
    return NextResponse.json({ error: 'no question at index' }, { status: 500 });
  }

  if (q.minLength && answer.length < q.minLength) {
    return NextResponse.json({
      notSubstantive: true,
      reason: `もう少し詳しく書いてください（${q.minLength} 文字以上）`,
    });
  }

  const judgment = await judgeAnswer(q.prompt, answer);
  if (!judgment.isSubstantive) {
    return NextResponse.json({
      notSubstantive: true,
      reason: judgment.reason || 'もう少し具体的に書いてください',
    });
  }

  session.answers.push({ questionId: q.id, prompt: q.prompt, answer });
  session.questionIndex += 1;

  if (session.questionIndex >= quest.survey.questions.length) {
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    await setSession(session);
    return NextResponse.json({ completed: true });
  }

  await setSession(session);
  const next = quest.survey.questions[session.questionIndex];
  return NextResponse.json({
    nextQuestion: next.prompt,
    questionIndex: session.questionIndex,
    totalQuestions: quest.survey.questions.length,
  });
}
