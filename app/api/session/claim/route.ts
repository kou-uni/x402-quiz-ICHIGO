import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress, type Address } from 'viem';
import { getSession, setSession } from '@/lib/kv';
import { sendIchigo } from '@/lib/chain';
import { rewardAmountWei } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = body.wallet;
  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }
  const norm = getAddress(wallet) as Address;

  const session = await getSession(norm);
  if (!session) {
    return NextResponse.json({ error: 'no session' }, { status: 404 });
  }
  if (session.status === 'rewarded') {
    return NextResponse.json(
      { error: 'already rewarded', rewardTx: session.rewardTx },
      { status: 409 }
    );
  }
  if (session.status === 'rewarding') {
    return NextResponse.json(
      { error: 'reward already in flight — contact admin if stuck' },
      { status: 409 }
    );
  }
  if (session.status !== 'completed') {
    return NextResponse.json(
      { error: `survey not completed (state: ${session.status})` },
      { status: 409 }
    );
  }

  // Lock the session before submitting tx, to prevent double-pay on retry.
  session.status = 'rewarding';
  await setSession(session);

  let txHash;
  try {
    txHash = await sendIchigo(norm, rewardAmountWei());
  } catch (e) {
    // rollback to completed so the user can retry
    session.status = 'completed';
    await setSession(session);
    return NextResponse.json(
      { error: `failed to send ICHIGO: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  session.status = 'rewarded';
  session.rewardTx = txHash;
  session.rewardedAt = new Date().toISOString();
  await setSession(session);

  return NextResponse.json({ rewardTx: txHash });
}
