import OpenAI from 'openai';
import { config } from './config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export interface AnswerJudgment {
  isSubstantive: boolean;
  reason: string;
}

const SYSTEM_PROMPT = `あなたはアンケート回答の妥当性チェッカーです。
ユーザーの回答が「実質的（substantive）」かどうかを判定してください。

実質的な回答とは:
- 質問に関連している
- ユーザーが実際に考えたことが伝わる
- 「asdf」「わからない」「特になし」「no」だけ等の空虚な回答ではない
- 文字数は短くてもよいが、内容のある具体性が必要

JSONのみで返答してください: {"isSubstantive": boolean, "reason": "<短い日本語の理由を1文>"}
判定は寛容に。質問に関連していて何か具体的な内容があれば実質的とみなす。`;

export async function judgeAnswer(
  prompt: string,
  answer: string
): Promise<AnswerJudgment> {
  if (!config.openaiApiKey) {
    return { isSubstantive: true, reason: '(OPENAI_API_KEY未設定のためスキップ)' };
  }
  try {
    const res = await getClient().chat.completions.create({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${prompt}\nAnswer: ${answer}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const text = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);
    return {
      isSubstantive: Boolean(parsed.isSubstantive),
      reason: String(parsed.reason ?? ''),
    };
  } catch (e) {
    return { isSubstantive: true, reason: '(LLM判定失敗のため通過)' };
  }
}
