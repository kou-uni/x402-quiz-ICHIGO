import type { Address } from 'viem';

function readBigIntEnv(name: string, fallback: bigint): bigint {
  const v = process.env[name];
  if (!v) return fallback;
  return BigInt(v);
}

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
  depositAmount: readBigIntEnv('DEPOSIT_AMOUNT', 100n),
  rewardAmount: readBigIntEnv('REWARD_AMOUNT', 500n),
  surveyId: process.env.SURVEY_ID ?? 'v1',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
};

export function depositAmountWei(): bigint {
  return config.depositAmount * 10n ** BigInt(config.ichigoDecimals);
}

export function rewardAmountWei(): bigint {
  return config.rewardAmount * 10n ** BigInt(config.ichigoDecimals);
}
