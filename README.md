# GF Database

ローカル専用のゲームカタログ・所持情報管理・MCPサーバーです。所持しているキャラクター、武器、召喚石をLLMから検索し、編成候補の検討に利用するための基盤を提供します。

> [!IMPORTANT]
> この公開リポジトリには実ゲームデータ、攻略記事、ゲーム画像を収録しません。第三者サイトの文章・画像・データベースを転載または一括取得せず、自分で確認した事実と出典情報だけをローカルPostgreSQLへ登録してください。

## Stack

- TypeScript / Vite+
- Hono API
- Vite + React + Tailwind CSS UI
- PostgreSQL / Drizzle ORM
- Model Context Protocol TypeScript SDK (stdio)
- Vite+ commit hooks and staged checks

## Setup

Vite+ (`vp`)、Dockerが必要です。Vite+がNode.jsとpnpmのバージョンを管理します。

Vite+を導入した直後に`vp`が見つからない場合は、新しいシェルを開くか、インストーラーが案内する`~/.config/vite-plus/env`をシェル設定から読み込んでください。

```sh
cp .env.example .env
vp install
docker compose up -d
vp run db:migrate
```

必要なら、架空の動作確認用データを追加できます。

```sh
vp run db:seed:sample
```

## Development

APIとWeb UIを別々のターミナルで起動します。

```sh
vp run dev:api
```

```sh
vp dev
```

ブラウザで `http://127.0.0.1:5173` を開きます。APIは外部公開を避けるため`127.0.0.1:8787`だけで待ち受けます。

## カタログ・所持情報の編集

一覧の「詳細・編集」から、名称・種類・属性・レアリティ・タグ・種類別の詳細と、所持数・上限解放段階・覚醒レベル・メモを編集できます。カタログと所持情報はそれぞれの保存ボタンで保存します。不正な入力は項目の下にエラーが表示されます。「閉じる」は未保存の変更を破棄します。

「所持を解除」は所持情報だけを削除し、カタログと出典を残します。「カタログを削除…」では、削除される所持情報と出典情報の件数を確認し、確認チェックを入れてから削除します。削除は元に戻せません。削除確認をキャンセルすると、編集中の入力を保持して戻ります。

API:

- `GET /api/catalog/:entityId`: カタログ・所持情報・出典情報の取得
- `PUT /api/catalog/:entityId`: カタログの全項目更新（作成時と同じ種類別入力仕様、`source` は更新対象外）
- `PUT /api/inventory/:entityId`: 所持情報の更新（`owned: false` は所持解除）
- `DELETE /api/catalog/:entityId`: `{ "confirm": true }` によるカタログと関連情報の削除

入力エラーは `400` と `fieldErrors`（項目パスごとのメッセージ配列）、同じ種類・正規化名称の重複は `409`、存在しない項目は `404` を返します。出典情報とカタログの補足 `metadata` はカタログ更新時に保持されます。

## MCP

MCPクライアントには、リポジトリを作業ディレクトリとして次のstdioコマンドを登録します。`vp run`は進捗表示を標準出力へ書く可能性があるため、MCPのプロトコルを壊さない専用スクリプトを使用します。

```sh
sh scripts/run-mcp.sh
```

提供するツール:

- `search_entities`: カタログ検索
- `get_inventory_summary`: 所持数の集計
- `find_owned_candidates`: 属性・役割タグによる所持候補の順位付け

編成候補のスコアはLLMへ渡す候補を絞るための簡易指標です。ゲーム内ダメージや編成成立を保証するものではありません。

## Database

実データはDocker named volume `gf_postgres_data`に保存され、リポジトリには入りません。公開されるのは`src/database/schema.ts`と`drizzle/`内のマイグレーションだけです。

```sh
vp run db:generate
vp run db:migrate
```

### データ入力仕様

`catalog_entities` の名称、種類、属性、レアリティ、タグは検索・絞り込み・一意性判定に使うため通常カラムへ保存します。種類ごとに形が異なり、ひとまとまりで読み書きする事実は `details` JSONB へ保存します。将来の任意の補足事実には `metadata` JSONB を使いますが、検索条件になった項目は通常カラムへの昇格を検討します。

新規入力の `details` は種類ごとに次の全項目が必須です。判断できない既存データの移行に限り、管理値 `unknown` を利用できます。

| 種類        | `details` のMVP必須項目                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `character` | `roles`（役割、1〜3件）、`weaponProficiencies`（得意武器、1〜2件）、`races`（種族、1〜2件）                            |
| `weapon`    | `weaponType`（武器種）、`skillEffects`（スキル効果分類、1〜10件）、`maxUncapLevel`（最大上限解放段階、0〜10）          |
| `summon`    | `auraEffects`（加護分類、1〜10件）、`callEffects`（召喚効果分類、1〜10件）、`maxUncapLevel`（最大上限解放段階、0〜10） |

管理語彙は以下のとおりです。値は英小文字の kebab-case で入力します。

- キャラクター役割: `attacker`, `defender`, `healer`, `support`, `special`, `unknown`
- 種族: `human`, `draph`, `erune`, `harvin`, `primal`, `other`, `unknown`
- 武器種・得意武器: `sword`, `dagger`, `spear`, `axe`, `staff`, `gun`, `melee`, `bow`, `harp`, `katana`, `unknown`
- 武器スキル効果: `attack`, `hp`, `multiattack`, `critical`, `stamina`, `enmity`, `supplemental-damage`, `damage-cap`, `healing`, `charge`, `defense`, `special`, `unknown`
- 召喚石の加護: `element-attack`, `character-attack`, `weapon-skill`, `hp`, `defense`, `multi-element`, `drop-rate`, `special`, `unknown`
- 召喚効果: `damage`, `buff`, `debuff`, `heal`, `dispel`, `damage-cut`, `charge`, `cooldown`, `special`, `unknown`

推薦用タグは効果の有無を表す横断的な語彙です。強度・成功率・条件は表しません。

| タグ            | 一意な定義                                   |
| --------------- | -------------------------------------------- |
| `attack`        | 主用途が直接ダメージまたは攻撃性能の向上     |
| `buff`          | 味方へ有利な状態変化を付与                   |
| `charge-boost`  | 奥義ゲージまたは奥義発動頻度を増加           |
| `damage-cut`    | 味方が受けるダメージを割合または固定量で軽減 |
| `debuff`        | 敵へ弱体状態を付与                           |
| `delay`         | 敵の特殊技発動までの進行を遅延               |
| `dispel`        | 敵の強化状態を解除                           |
| `heal`          | 味方のHPを回復                               |
| `normal-attack` | 通常攻撃の性能または回数を主に強化           |
| `revive`        | 戦闘不能の味方を復帰                         |
| `substitute`    | 他の味方が受ける攻撃を引き受ける             |
| `veil`          | 味方への弱体効果付与を無効化                 |

タグは NFKC、前後空白除去、小文字化、空白・アンダースコアのハイフン化を行い、重複を除去します。`回復`→`heal`、`ディスペル`→`dispel`、`弱体無効`→`veil` も正規化します。正規化後に管理語彙へ存在しないタグや、種類と一致しない `details` はAPIで拒否されます。

入力例:

```json
{
  "kind": "character",
  "name": "サンプル支援役",
  "element": "wind",
  "rarity": "SSR",
  "tags": ["heal", "dispel"],
  "details": {
    "roles": ["healer", "support"],
    "weaponProficiencies": ["staff"],
    "races": ["human"]
  }
}
```

`data/private`、DB dump、スクリーンショット、`.env`などはGit管理を禁止しています。バックアップもリポジトリ外へ保存してください。

## Quality checks

```sh
vp check
vp test
vp build
vp run check:data
```

PostgreSQLを使うAPI統合テストは `TEST_DATABASE_URL` を指定すると実行されます。テストごとに専用スキーマを作成してマイグレーションを適用し、終了時にそのスキーマだけを削除します。既存のカタログにはアクセスしません。CIでもこのテストを実行します。

```sh
TEST_DATABASE_URL=postgres://gf:local-development-only@127.0.0.1:5432/gf_database vp test
```

Vite+のGit hookを有効にします。

```sh
vp hooks enable
vp hooks status
```

pre-commitでは公開禁止データの検査とstagedファイルのチェックを行います。同じ検査をCIでも行うため、`--no-verify`でローカルhookを回避してもマージ前に検出されます。

## Data policy

- 保存する: 名称、属性、数値、役割タグ、確認日、出典URLなどの事実情報
- 保存しない: 攻略記事本文、評価コメント、画像、ロゴ、認証情報、Cookie、非公開APIレスポンス
- 外部サイトを自動巡回しない
- LLMへは質問に必要な候補だけを渡す
- コードのライセンスとローカルデータの扱いを分離する

## License

現時点ではライセンス未設定です。実ゲームデータには本リポジトリのコードライセンスを適用しません。
