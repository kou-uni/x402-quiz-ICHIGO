# x402 Quiz ICHIGO

Optimism 上の ICHIGO トークンを使った "x402 風" アンケートエージェント。
ユーザーが **100 ICHIGO** を treasury に deposit すると 5 問のアンケートが始まり、
完了すると **500 ICHIGO** が返却されます。1 ウォレット 1 回限り。

Web3AI概論 2026（千葉工業大学）課題運用想定。

## アーキテクチャ

```
[browser]                     [vercel functions]              [optimism]
ConnectButton (RainbowKit)
  │
  │ wallet sign + send
  │   ICHIGO.transfer(treasury, 100*1e18)         ───────────► ICHIGO
  │
  │ POST /api/session/pay { wallet, txHash }
  │                              ├ getTransactionReceipt ────► RPC
  │                              ├ verify Transfer event
  │                              └ KV: status=in_progress
  │
  │ POST /api/session/answer { wallet, answer } × 5
  │                              ├ length check
  │                              ├ OpenAI判定 (substantive?)
  │                              └ KV: questionIndex++
  │
  │ POST /api/session/claim { wallet }
  │                              ├ status=rewarding (lock)
  │                              ├ treasury wallet:
  │                              │   ICHIGO.transfer(user, 500*1e18) ─► ICHIGO
  │                              └ KV: status=rewarded, rewardTx
```

ICHIGO コントラクト (`0x836700463Dce76D9Cc3CDf6F6EDF946312c01869`) は
EIP-2612 permit / EIP-3009 transferWithAuthorization のいずれも実装していないため、
**deposit はユーザーが直接 `transfer()` を実行 → tx hash をサーバーに提示**
する方式です。x402 の "402 → sign → retry" の構造はそのままに、
sign 対象を EIP-712 ではなく実 tx に置き換えています。

## ⚠️ ICHIGO のホワイトリスト

`ICHIGO.sol` は `Whitelistable` を継承しており、ホワイトリスト登録ウォレット間でしか転送できません。
**起動前に treasury アドレスをホワイトリストに登録してください。**

- Treasury address: `0xd5F68D7a045eE86AECc6b5aE866c3113913a2918`

## セットアップ

### 1. 依存をインストール

```bash
npm install
```

### 2. `.env.local` を作成

`.env.example` をコピーして `.env.local` にし、以下を埋める:

| 変数 | 内容 |
|---|---|
| `TREASURY_PRIVATE_KEY` | treasury ウォレットの秘密鍵（`0x` 付き hex 64 桁） |
| `OPENAI_API_KEY` | OpenAI API キー |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (Upstash) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud で取得 |

`DEPOSIT_AMOUNT` / `REWARD_AMOUNT` は人間表記（例: `100`, `500`）。
内部で `* 10^18` されます。

### 3. ローカル起動

```bash
npm run dev
```

`http://localhost:3000` を開く。
KV が未設定でもメモリ Map にフォールバックして動作（dev 限定）。

### 4. Vercel デプロイ

GitHub repo `kou-uni/x402-quiz-ICHIGO` に push すると Vercel が自動デプロイ。
Vercel ダッシュボードで:

1. **Storage** タブから KV (Upstash) を作成 → 自動で env vars が注入される
2. **Settings → Environment Variables** で他の env を設定
3. 再デプロイ

## ファイル構成

```
.
├─ app/
│  ├─ layout.tsx                  RootLayout
│  ├─ providers.tsx               wagmi + RainbowKit
│  ├─ page.tsx                    main UI（接続→deposit→chat→reward）
│  ├─ globals.css
│  └─ api/session/
│     ├─ route.ts                 POST /api/session       (state lookup)
│     ├─ pay/route.ts             POST /api/session/pay   (deposit verify)
│     ├─ answer/route.ts          POST /api/session/answer (chat turn)
│     └─ claim/route.ts           POST /api/session/claim  (reward)
├─ lib/
│  ├─ config.ts                   env-driven runtime config
│  ├─ chain.ts                    viem clients, ICHIGO ABI, sendIchigo()
│  ├─ kv.ts                       Vercel KV wrapper (memory fallback)
│  ├─ survey.ts                   YAML loader
│  └─ openai.ts                   substantive-answer judge
├─ surveys/
│  └─ v1.yaml                     5 dummy questions
├─ .env.example
├─ next.config.mjs
├─ tsconfig.json
└─ package.json
```

## State machine

```
none → in_progress → completed → rewarding → rewarded
```

KV キー:
- `session:{0xwallet}` → Session JSON
- `tx:{0xtxhash}` → wallet binding（リプレイ防止）

## 既知の TODO（v1 の範囲外）

- レート制限（IP / wallet 単位）
- `rewarding` 状態でスタックした場合の admin recovery エンドポイント
- アンケート YAML を投入する管理 UI
- 集計エクスポート（CSV / Supabase 連携）
- `Whitelistable` レジストリへの一括登録スクリプト
- block confirmation 待機（現在は単一 `getTransactionReceipt`、Optimism finality は十分速いが）
