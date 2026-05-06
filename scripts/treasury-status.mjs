#!/usr/bin/env node
//
// Treasury 状態の一発確認スクリプト
//
//   $ node scripts/treasury-status.mjs
//   $ npm run check
//
// .env.local を読み込み、Optimism 上の treasury wallet について:
//   - ETH balance（ガス用）
//   - ICHIGO balance（reward 払い出し原資）
//   - ICHIGO Whitelistable の登録状況（よくある関数名で試行）
//   - tx count (nonce)
// を確認します。

import 'dotenv/config';
import {
  createPublicClient,
  http,
  parseAbi,
  getAddress,
  formatEther,
  formatUnits,
  isAddress,
} from 'viem';
import { optimism } from 'viem/chains';

const TREASURY = process.env.TREASURY_ADDRESS ?? process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
const ICHIGO =
  process.env.ICHIGO_CONTRACT ??
  process.env.NEXT_PUBLIC_ICHIGO_CONTRACT ??
  '0x836700463Dce76D9Cc3CDf6F6EDF946312c01869';
const RPC = process.env.OPTIMISM_RPC_URL ?? 'https://mainnet.optimism.io';
const DECIMALS = parseInt(process.env.ICHIGO_DECIMALS ?? '18', 10);

if (!TREASURY || !isAddress(TREASURY)) {
  console.error('TREASURY_ADDRESS not set or invalid in .env.local');
  process.exit(1);
}
if (!isAddress(ICHIGO)) {
  console.error('ICHIGO_CONTRACT not a valid address');
  process.exit(1);
}

const ERC20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

const WHITELIST_PROBES = parseAbi([
  'function isWhitelisted(address) view returns (bool)',
  'function whitelisted(address) view returns (bool)',
  'function isAccountWhitelisted(address) view returns (bool)',
  'function whitelist(address) view returns (bool)',
]);

const client = createPublicClient({ chain: optimism, transport: http(RPC) });

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

async function main() {
  const treasury = getAddress(TREASURY);
  const ichigo = getAddress(ICHIGO);

  console.log(`${c.bold}Treasury status — Optimism${c.reset}`);
  console.log(`${c.dim}RPC: ${RPC}${c.reset}`);
  console.log('');
  console.log(`Treasury:  ${c.cyan}${treasury}${c.reset}`);
  console.log(`ICHIGO:    ${c.cyan}${ichigo}${c.reset}`);
  console.log(
    `Etherscan: ${c.dim}https://optimistic.etherscan.io/address/${treasury}${c.reset}`
  );
  console.log('');

  // ── ETH ───────────────────────────────────────────
  const eth = await client.getBalance({ address: treasury });
  const ethStr = formatEther(eth);
  let ethTag = `${c.green}OK${c.reset}`;
  if (eth === 0n) {
    ethTag = `${c.red}empty — gas に使う ETH が無い${c.reset}`;
  } else if (eth < 100_000_000_000_000n) {
    // < 0.0001 ETH
    ethTag = `${c.yellow}low — 0.0001 ETH 未満${c.reset}`;
  }
  console.log(`ETH balance:    ${c.bold}${ethStr}${c.reset} ETH   ${ethTag}`);

  // ── ICHIGO balance ────────────────────────────────
  let ichigoBal = 0n;
  let ichigoSymbol = 'ICHIGO';
  try {
    ichigoBal = await client.readContract({
      address: ichigo,
      abi: ERC20,
      functionName: 'balanceOf',
      args: [treasury],
    });
    try {
      ichigoSymbol = await client.readContract({
        address: ichigo,
        abi: ERC20,
        functionName: 'symbol',
      });
    } catch {}
    const balStr = formatUnits(ichigoBal, DECIMALS);
    let balTag = `${c.green}OK${c.reset}`;
    if (ichigoBal === 0n) {
      balTag = `${c.red}empty — reward 用の ICHIGO が無い${c.reset}`;
    } else if (ichigoBal < 500n * 10n ** BigInt(DECIMALS)) {
      balTag = `${c.yellow}low — 500 ${ichigoSymbol} 未満（最低 1 回 reward に必要な量）${c.reset}`;
    }
    console.log(`${ichigoSymbol} balance: ${c.bold}${balStr}${c.reset} ${ichigoSymbol}   ${balTag}`);
  } catch (e) {
    console.log(
      `ICHIGO balance: ${c.red}read failed${c.reset} — ${e instanceof Error ? e.message : e}`
    );
  }

  // ── Whitelist 推定 ─────────────────────────────────
  let detected = false;
  for (const fn of ['isWhitelisted', 'whitelisted', 'isAccountWhitelisted', 'whitelist']) {
    try {
      const ok = await client.readContract({
        address: ichigo,
        abi: WHITELIST_PROBES,
        functionName: fn,
        args: [treasury],
      });
      detected = true;
      const tag = ok
        ? `${c.green}✅ whitelisted${c.reset}`
        : `${c.red}❌ NOT whitelisted${c.reset}`;
      console.log(`Whitelist:      ${tag}   ${c.dim}(via ${fn}() on ICHIGO contract)${c.reset}`);
      break;
    } catch {
      // try next
    }
  }
  if (!detected) {
    console.log(
      `Whitelist:      ${c.yellow}unable to detect via known function names${c.reset}`
    );
    console.log(
      `${c.dim}                → check manually: https://optimistic.etherscan.io/address/${ichigo}#readContract${c.reset}`
    );
  }

  // ── Nonce ─────────────────────────────────────────
  const nonce = await client.getTransactionCount({ address: treasury });
  console.log(`Tx count:       ${nonce}   ${c.dim}(0 = まだ何も送っていない)${c.reset}`);

  // ── 総合 ──────────────────────────────────────────
  console.log('');
  const ready =
    eth > 100_000_000_000_000n &&
    ichigoBal >= 500n * 10n ** BigInt(DECIMALS) &&
    detected;
  if (ready) {
    console.log(`${c.green}${c.bold}✅ READY — reward を払い出せる状態です${c.reset}`);
  } else {
    console.log(`${c.yellow}${c.bold}⏳ NOT READY — 上記の low/empty 項目を解消してください${c.reset}`);
  }
}

main().catch((e) => {
  console.error('script failed:', e);
  process.exit(1);
});
