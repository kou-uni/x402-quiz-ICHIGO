import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { config } from './config';

export const ICHIGO_ABI = parseAbi([
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export const publicClient = createPublicClient({
  chain: optimism,
  transport: http(config.rpcUrl),
});

function normalizePrivateKey(raw: string): Hex {
  const stripped = raw.trim().replace(/^['"]|['"]$/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    throw new Error('TREASURY_PRIVATE_KEY must be 64 hex chars');
  }
  return `0x${stripped}` as Hex;
}

export function treasuryWalletClient() {
  if (!config.treasuryPrivateKey) {
    throw new Error('TREASURY_PRIVATE_KEY env var is not set');
  }
  const account = privateKeyToAccount(normalizePrivateKey(config.treasuryPrivateKey));
  return createWalletClient({
    account,
    chain: optimism,
    transport: http(config.rpcUrl),
  });
}

export async function sendIchigo(to: Address, amount: bigint): Promise<Hex> {
  const wc = treasuryWalletClient();
  return await wc.writeContract({
    address: config.ichigoContract,
    abi: ICHIGO_ABI,
    functionName: 'transfer',
    args: [to, amount],
  });
}
