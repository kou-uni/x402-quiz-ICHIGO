# クエスト基盤 — 設計計画書

> Web3AI概論 2026 / x402-quiz-ICHIGO リポジトリの長期設計指針
> Status: Draft v1 / Last updated: 2026-05-06 / Owner: spark

---

## 1. ビジョン

このアプリは「ICHIGO 報酬付きアンケートツール」として始まったが、最終形は
**Web3AI概論コミュニティのオンチェーン化されたクエスト基盤**である。

```
v1 (現状)    Survey MVP            人間が答える / x402 反転で報酬支払い
v2 (次)      Quest Platform        複数アンケート同時運用 / Hermes 連携枠
v3 (将来)    Skill Market          エージェントが働く / A2A 経済圏
```

Web3AI概論の文脈で言えば、**講座のクエスト経済を on-chain インフラに昇格**
させるプロジェクト。`admin-docs/homework-rewards.md` の "JOIN/ICHIGO 経済"
を、講座運営の手作業 → プラットフォームの自動化 → エージェントの自律運用、
へと段階的に進化させる。

---

## 2. コア設計原則

### 2.1 Quest を polymorphic primitive として設計する

`Survey` ではなく `Quest` をデータモデルの中核に置く。`kind` フィールドで型を分岐:

| kind | 内容 | 報酬を受ける主体 |
|---|---|---|
| `survey` | 人間が wallet で deposit してチャットで答える | 参加者 |
| `task` | エージェントが spec を読んで実行・提出する | エージェント wallet |
| `bounty` (将来) | 決定論的テストで合否判定する課題 | 提出者 |
| `social` (将来) | Discord/Twitter 等のオフチェーン行動の証明 | 行動者 |

v2 で `Survey` という名前で固めると、v3 で破壊的リネームが必要になる。
**今 v2 で `Quest` 抽象に揃える** のがプロジェクト最大の意思決定。

### 2.2 「契約は精密、思考は開放」

タスク定義で**インターフェース（契約）は超精密に、コンテンツ（中身）は開かれた**
ものにする。

- ✅ 出力 schema・必須フィールド・形式制約 = 厳密
- ❌ "正解の中身" = 指定しない（エージェントの仕事）
- 例: 「ラーメン店 3 件の sentiment と key_points を返せ。schema X 準拠」
  - スキーマ = 厳密
  - *どの 3 件か* / *何を key points と捉えるか* = エージェントが決める

これを破ると、タスクが「穴埋め問題」化してエージェント体験にならない。
Goodhart 的に validation を gaming する方向に進化するリスクもある。

### 2.3 失敗をタダにする（Preflight パターン）

**`POST /api/quest/{id}/preflight`** を必ず提供する。reward なし、フィードバック
だけ返すエンドポイント:

```
[draft] → preflight → "schema OK / LLM 6/10 / key_points が抽象的"
[draft] → preflight → "schema OK / LLM 7/10 / sentiment 根拠弱"
[draft] → preflight → "schema OK / LLM 9/10 / 提出推奨"
[final] → submit    → reward 受領
```

これがプラットフォームの性格を**「審判」から「家庭教師」へ**変える。

副次効果:
- 検証ルール自体が教材になる（試行で逆エンジニアリング）
- agent harness の dry-run/lint/type-check 文化を身につけさせる
- スパム submit の防波堤（rate limit を本番側だけ厳しくできる）

### 2.4 Tier による段階的 scaffolding

タスクを **Tier 1 / 2 / 3** に分ける:

| Tier | 性質 | 報酬 |
|---|---|---|
| 1 Beginner | スキーマ厳密・スコープ狭い・worked_example 付き | 小 |
| 2 Intermediate | 検索や要約が必要・hint あり | 中 |
| 3 Advanced | 多段推論や code が必要・自力で品質保証 | 大 |

これによって:
- 280 名の幅をプラットフォームが吸収できる（自己診断が機能）
- Hermes の自律生成も Tier 1 から始められる成長戦略
- 上級 quest の希少性で ICHIGO 経済が壊れない

`Preflight × Tier` の組み合わせで、**足場が徐々に剥がれていく学習体験**になる。

### 2.5 リファレンス・ハーネスを配布する

`agents-docs/ref-harness-engineering.md` の "Agent = Model + Harness" 思想に従い、
プラットフォームと一緒に**ボイラープレート repo** を配布する:

```
quest-runner-starter/
├─ src/
│  ├─ index.ts        # URL fetch → spec parse → LLM 呼ぶ → submit
│  ├─ harness.ts      # 共通処理（preflight ループ、wallet 接続）
│  └─ task.ts         # ← 受講生はここだけ書き換える
└─ README.md          # 「Tier 1 を 30 分でクリアする手順」
```

Tier 1 タスクなら Claude Code に投げるだけで完走できる薄さに。
**spec を精緻化するよりスキル底上げ効果が大きい**。

講義カリキュラムでは「Agent Harness」の章を立てる候補。

### 2.6 検証パイプラインを composable に

`validation` を配列で記述、Quest ごとに組み合わせる:

```ts
type ValidationRule =
  | { type: 'schema'; schema: JSONSchema }
  | { type: 'llm-judge'; prompt: string; passingScore: number }
  | { type: 'regex'; pattern: string }
  | { type: 'http-callback'; url: string }   // 外部検証サービス
  | { type: 'multi-agent-vote'; n: number }  // 複数エージェント合議（将来）
```

Quest 別:
- survey → `[llm-judge]` 1 個
- task tier 1 → `[schema, llm-judge(leniency=high)]`
- task tier 3 → `[schema, llm-judge(leniency=low), test-runner]`

---

## 3. データモデル

### 3.1 Quest

```ts
interface Quest {
  id: string;
  kind: 'survey' | 'task';
  status: 'draft' | 'active' | 'closed';
  tier?: 1 | 2 | 3;
  title: string;
  short_instruction: string;       // 全 Tier 共通の必読部分
  detailed_spec?: string;          // Tier 2-3 用、Tier 1 は読まなくてよい
  worked_example?: { input: any; output: any };
  output_schema?: JSONSchema;      // task 系は必須

  // 経済
  depositAmount: bigint;           // human-readable（× 10^decimals）
  rewardAmount: bigint;
  payer: 'participant' | 'quest_creator'; // survey=participant, task=creator
  asset: Address;                  // ICHIGO のアドレス（将来は他資産も）

  // 検証
  validation: ValidationRule[];

  // ライフサイクル
  participantLimit?: number;
  deadline?: string;               // ISO 8601
  createdBy: 'manual' | 'hermes';
  createdAt: string;
  closedAt?: string;
}
```

### 3.2 Session（参加状態）

```ts
interface Session {
  questId: string;                 // ← v1 から追加
  wallet: Address;
  status: 'paid' | 'in_progress' | 'completed' | 'rewarding' | 'rewarded' | 'failed';

  // survey 系
  questionIndex?: number;
  answers?: AnswerRecord[];

  // task 系
  submissions?: Submission[];      // preflight 履歴 + 本番 submit

  depositTx?: Hex;
  rewardTx?: Hex;
  startedAt?: string;
  completedAt?: string;
  rewardedAt?: string;
}

interface Submission {
  index: number;
  isPreflight: boolean;
  submittedAt: string;
  output: unknown;
  validationResult: {
    passed: boolean;
    schemaOk: boolean;
    llmScore?: number;
    feedback: string;              // 人間 / エージェント可読
  };
}
```

### 3.3 KV キー設計

```
quest:{id}                          → Quest
session:{questId}:{wallet}          → Session
tx:{txHash}                         → wallet binding（リプレイ防止、global）
quest:{id}:participants             → Set<wallet>
quest:{id}:answers                  → 集計用 list
```

---

## 4. API サーフェス

### 4.1 公開エンドポイント

```
POST /api/quest/{id}/session       現在の参加状態取得
POST /api/quest/{id}/pay           deposit tx 検証（survey 系）
POST /api/quest/{id}/answer        chat 1 ターン（survey 系）
POST /api/quest/{id}/preflight     検証だけ走らせる（reward なし）
POST /api/quest/{id}/submit        本番提出（task 系 / survey 完了時）
POST /api/quest/{id}/claim         reward 送金
```

### 4.2 Admin / Hermes エンドポイント

`Authorization: Bearer ${ADMIN_TOKEN}` で保護:

```
GET    /api/admin/quests           list
POST   /api/admin/quests           create
GET    /api/admin/quests/{id}
PATCH  /api/admin/quests/{id}      status 変更（active/closed）
GET    /api/admin/quests/{id}/results   集計
```

Hermes は `ADMIN_TOKEN` を持って自律的に quest を生成・閉鎖できる。

### 4.3 公開フィード（任意・v3）

```
GET /api/quests.json               全 active quest を JSON で配信
GET /api/quest/{id}.json           1 個の Quest spec
```

Hermes 等のエージェントが「今やれる仕事一覧」をクロールできる。MCP server
化も視野に。

---

## 5. フロントエンド

### 5.1 ルーティング

```
/                       env のデフォルト Quest（後方互換）
/q/{questId}            個別 Quest ページ
/q                      Quest 一覧（オプション、v3）
```

### 5.2 Quest 種別ごとの UI

- `kind: survey` → wallet connect → deposit → chat UI（現状の延長）
- `kind: task` → エージェント向けなので最小 UI（spec 表示・preflight ログ表示）

---

## 6. 講座カリキュラムとの接続

| 講座要素 | このプラットフォームで提供されるもの |
|---|---|
| SWBAT G1（動くプロダクト） | Tier 1 quest を完走することが体験的証拠になる |
| SWBAT G3（責任ある開発） | preflight + 検証フィードバックで自分の出力を検証する習慣 |
| 反転学習 | 動画で Agent Harness を学び、講義時間に Tier 別に挑戦 |
| ペンギンミックス | グループで quest を共同実施 → ICHIGO 山分け（将来） |
| Top Gun | Tier 3 quest の達成数で選出基準（候補） |

第 4 回（5/14）OpenClaw 紹介回で **「Agent Harness」** を講義テーマに据え、
本プラットフォームを実演するのが自然な流れ。

---

## 7. 実装フェーズ

### v1 ✅（現状・ICHIGO Survey MVP）

- 単一サーベイ、env 経由の deposit/reward
- wallet → deposit → 5 問 → reward の一直線
- リポ: `kou-uni/x402-quiz-ICHIGO`

### v2（次フェーズ・Quest 抽象化）

**目的**: 多 Quest 化と Hermes 連携の土台を作る

- [ ] `Survey` → `Quest` リネーム（`kind` フィールド導入）
- [ ] KV キーを `(questId, wallet)` 化
- [ ] API ルートを `/api/quest/{id}/...` に再編
- [ ] 経済パラメータを Quest 内に内蔵（env はフォールバック）
- [ ] Quest を KV にも保存可能に（YAML はフォールバック）
- [ ] Admin API + ADMIN_TOKEN 認証の枠組み
- [ ] フロントの URL パラメータ対応（`/q/{id}`）
- [ ] **`validation: ValidationRule[]` フィールド導入**（survey は `[llm-judge]` 固定）
- [ ] **`payer` フィールド導入**

### v3（Skill Market 化）

**目的**: エージェント向け task quest を実装、Hermes 自律運用に対応

- [ ] `kind: 'task'` ハンドラ
- [ ] `POST /api/quest/{id}/preflight` 実装
- [ ] `POST /api/quest/{id}/submit` 実装（task 系）
- [ ] Tier 概念導入（reward 連動）
- [ ] worked_example, short/detailed_spec の二層スペック
- [ ] リファレンス・ハーネス repo を別途配布（`quest-runner-starter`）
- [ ] Hermes が `/api/admin/quests` を叩く統合
- [ ] MCP tool spec 形式での配信検討

### v4 以降（候補）

- 多エージェント合議（multi-agent-vote 検証）
- 期限切れ自動返金（escrow timeout）
- USDC / その他資産対応
- ペンギンミックスとの連動（チーム参加）
- Discord 統合（quest 通知 / 結果共有）

---

## 8. オープンな検討事項

- **Hermes の `ADMIN_TOKEN` 管理**: 1 個の master token か、scoped token か
- **Tier 1 quest の最低設計**: 受講生が 30 分で完走できる粒度の例を 5-10 個用意
- **検証ルールの leniency 表現**: 数値 (0-1) か enum (low/med/high) か
- **wallet が ICHIGO を持っていない受講生の onboarding**: faucet quest を Tier 0 として置くか
- **Top Gun への組み込みタイミング**: v3 完成後 or v2 から段階的か
- **ペンギンミックスとの整合**: 個人 quest vs チーム quest の経済設計
- **MCP / A2A 標準への寄せ方**: 早く寄せる vs 独自で先行

---

## 9. 関連ドキュメント

- `agents-docs/ai-agents/00-overview.md` — エージェント体制（Hermes 含む）
- `agents-docs/ai-agents/ref-harness-engineering.md` — Agent = Model + Harness
- `admin-docs/homework-rewards.md` — JOIN/ICHIGO 経済
- `admin-docs/swbat-v4.md` — 学習目標
- Obsidian: `decisions/2026-05-06-quest-platform-pivot.md` — pivot 決定書

---

## 10. 用語集

| 用語 | 意味 |
|---|---|
| **Quest** | このプラットフォームの基本単位。survey / task / bounty / social の総称 |
| **Survey** | 人間が wallet と chat で答える形式の Quest |
| **Task** | エージェントが spec を読んで実行・提出する形式の Quest |
| **Preflight** | reward を伴わない事前検証 submit |
| **Tier** | Quest の難易度区分（1: Beginner / 2: Intermediate / 3: Advanced） |
| **Harness** | エージェントが Quest を実行するための共通ボイラープレート |
| **Hermes** | Mac Studio + Gemma 4 + OpenClaw で動く運営側エージェント基盤 |
| **ICHIGO** | Web3AI概論で配布される ERC20 トークン（Optimism、Whitelistable） |
