# x402 Quiz ICHIGO（schema-v2-quest ブランチ）

Optimism 上の ICHIGO トークンを使った "x402 風" Quest エージェント。
ユーザーが ICHIGO を treasury に deposit すると Quest が始まり、
完了すると報酬 ICHIGO が返却されます。1 ウォレット × 1 Quest = 1 回限り。

Web3AI概論 2026（千葉工業大学）課題運用想定。

## v2 ブランチでの変更点

このブランチ (`schema-v2-quest`) は v1 (main) からの**破壊的なスキーマ変更**を含みます:

- `Survey` を `Quest` に抽象化（`kind: 'survey' | 'task'` で多型化）
- KV キーが `session:{wallet}` → `session:{questId}:{wallet}` に変更
- API リクエストが `questId` を受け取る（省略時は `DEFAULT_QUEST_ID`）
- フロントエンドが URL クエリ `?q=<questId>` で Quest を切り替え可能
- 経済値 (`depositAmount` / `rewardAmount`) を Quest YAML に内蔵、env はフォールバック
- ファイル: `surveys/v1.yaml` → `quests/q-survey-001.yaml`、`lib/survey.ts` → `lib/quest.ts`
- 検証ルール `validation: ValidationRule[]` を Quest 内に記述（v2 では `llm-judge` のみ実装）
- **Admin API skeleton** (`/api/admin/quests`) — Hermes 統合の接続点。Bearer auth (`ADMIN_TOKEN`) で保護

詳細設計: [`docs/quest-platform-plan.md`](./docs/quest-platform-plan.md)
意思決定書: Obsidian `decisions/2026-05-06-quest-platform-pivot.md`

**v1 のセッションデータとは互換性がありません。** v2 をデプロイする前に
KV をフラッシュするか、新しい KV を割り当ててください。

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

- Treasury address: `0xEFFdE47EaD5CEE9d19f20Bdf5210664e9F08c4Ba`

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

## ファイル構成（v2）

```
.
├─ app/
│  ├─ layout.tsx                  RootLayout
│  ├─ providers.tsx               wagmi + RainbowKit
│  ├─ page.tsx                    main UI（?q=<questId> でQuest切替）
│  ├─ globals.css
│  └─ api/session/
│     ├─ route.ts                 POST /api/session       (state lookup; takes questId)
│     ├─ pay/route.ts             POST /api/session/pay   (deposit verify; takes questId)
│     ├─ answer/route.ts          POST /api/session/answer (chat turn; takes questId)
│     └─ claim/route.ts           POST /api/session/claim  (reward; takes questId)
├─ lib/
│  ├─ config.ts                   env-driven runtime config (Quest 経済値はフォールバック)
│  ├─ chain.ts                    viem clients, ICHIGO ABI, sendIchigo()
│  ├─ kv.ts                       Vercel KV wrapper (key: session:{questId}:{wallet})
│  ├─ quest.ts                    Quest 多型ローダー (kind: survey | task)
│  └─ openai.ts                   substantive-answer judge
├─ quests/
│  └─ q-survey-001.yaml           デフォルト Quest（survey 形式、5 問）
├─ scripts/
│  └─ treasury-status.mjs         Treasury 健康チェック（npm run check）
├─ docs/
│  ├─ quest-platform-plan.md      長期設計計画書
│  └─ tier1-quest-drafts.yaml     Tier 1 タスク 10 例の草案
├─ .env.example
├─ next.config.mjs
├─ tsconfig.json
└─ package.json
```

## Admin API（Hermes 用接続点）

すべて `Authorization: Bearer ${ADMIN_TOKEN}` を要求。`ADMIN_TOKEN` 未設定時は `503` を返します。

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/admin/quests` | KV に登録された Quest 一覧 |
| `POST` | `/api/admin/quests` | Quest を新規作成 / 上書き（body: Quest JSON）|
| `GET` | `/api/admin/quests/{id}` | 1 つの Quest を取得 |
| `PATCH` | `/api/admin/quests/{id}` | 部分更新（status/closedAt 等）|
| `DELETE` | `/api/admin/quests/{id}` | KV から削除（YAML には影響しない）|
| `GET` | `/api/admin/quests/{id}/results` | 集計結果（v2 はメタのみ・v2.x で参加者リスト追加）|

**Quest JSON 例**:
```json
{
  "id": "q-survey-002-mvp-feedback",
  "kind": "survey",
  "title": "MVP フィードバック",
  "depositAmount": "100",
  "rewardAmount": "300",
  "payer": "participant",
  "survey": {
    "questions": [
      { "id": "q1", "prompt": "使ってみてどうでしたか？", "minLength": 30 }
    ]
  },
  "validation": [{ "type": "llm-judge", "leniency": "medium" }]
}
```

**curl 例**:
```bash
curl -X POST https://your-app.vercel.app/api/admin/quests \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d @quest.json
```

**読み取り順**: 公開 API は KV 優先 → YAML フォールバック。Hermes が KV に投入した
Quest と、リポにバンドルされた YAML の両方を等しく扱える。

## State machine

```
none → in_progress → completed → rewarding → rewarded
```

KV キー（v2）:
- `session:{questId}:{0xwallet}` → Session JSON
- `tx:{0xtxhash}` → wallet binding（リプレイ防止、global）

## 既知の TODO（v1 の範囲外）

- レート制限（IP / wallet 単位）
- `rewarding` 状態でスタックした場合の admin recovery エンドポイント
- アンケート YAML を投入する管理 UI
- 集計エクスポート（CSV / Supabase 連携）
- `Whitelistable` レジストリへの一括登録スクリプト
- block confirmation 待機（現在は単一 `getTransactionReceipt`、Optimism finality は十分速いが）
