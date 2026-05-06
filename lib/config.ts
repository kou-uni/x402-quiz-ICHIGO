import type { Address } from 'viem';

function readBigIntEnv(name: string, fallback: bigint): bigint {
  const v = process.env[name];
  if (!v) return fallback;
  return BigInt(v);
}

/**
 * 環境変数経由のグローバル設定。
 * Quest 単体に書かれた depositAmount / rewardAmount があればそちらが優先され、
 * これらは fallback として機能する（後方互換）。
 */
export const config = {
  chainId: 10,
  ichigoContract: (process.env.ICHIGO_CONTRACT ??
    '0x836700463Dce76D9Cc3CDf6F6EDF946312c01869') as Address,
  ichigoDecimals: parseInt(process.env.ICHIGO_DECIMALS ?? '18', 10),
  treasuryAddress: (process.env.TREASURY_ADDRESS ??
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS ??
    '0x0000000000000000000000000000000000000000') as Address,
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY,
  rpcUrl: process.env.OPTIMISM_RPC_URL ?? 'https://mainnet.optimism.io',
  /** Quest が経済値を持たない場合のフォールバック。 */
  defaultDepositAmount: readBigIntEnv('DEPOSIT_AMOUNT', 100n),
  defaultRewardAmount: readBigIntEnv('REWARD_AMOUNT', 500n),
  /** URL 等で quest 指定が無いときのデフォルト。 */
  defaultQuestId: process.env.DEFAULT_QUEST_ID ?? process.env.SURVEY_ID ?? 'q-survey-001',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
};

/** 18 桁単位への変換。Quest が値を持っていれば優先。 */
export function depositAmountWei(quest?: { depositAmount?: bigint }): bigint {
  const human = quest?.depositAmount ?? config.defaultDepositAmount;
  return human * 10n ** BigInt(config.ichigoDecimals);
}

export function rewardAmountWei(quest?: { rewardAmount?: bigint }): bigint {
  const human = quest?.rewardAmount ?? config.defaultRewardAmount;
  return human * 10n ** BigInt(config.ichigoDecimals);
}
