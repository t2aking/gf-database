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

この手順はmacOSとLinux向けです。事前に[Vite+ の公式セットアップ](https://viteplus.dev/guide/)で `vp` を入れ、macOSでは[Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)を起動、Linuxでは[Docker Engine](https://docs.docker.com/engine/install/)とComposeプラグインを起動してください。Vite+がこのプロジェクトで必要なNode.js 24.11.0以上とpnpm 11.19.0以上を管理します。LinuxではDockerの利用権限も必要です。

Vite+を導入した直後に`vp`が見つからない場合は、新しいシェルを開くか、インストーラーが案内する`~/.config/vite-plus/env`をシェル設定から読み込んでください。

```sh
vp --version
docker --version
docker compose version
docker info
node --version
pnpm --version
```

リポジトリのルートで次の順に実行します。`.env.example`はローカル開発専用の架空の認証情報です。既存の`.env`がある場合は上書きせず、接続先を確認してください。

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
vp install
docker compose up -d
docker compose ps
vp run db:migrate
vp run db:seed:sample
sh scripts/doctor.sh
vp run mcp:smoke
```

`doctor`は `vp` / Docker / Node.js / pnpm / `.env` / PostgreSQL接続・認証 / migration状態を確認します。DBを更新しません。失敗時は表示された不足項目を直し、同じコマンドを再実行してください。`vp`自体が見つからない場合も `sh scripts/doctor.sh` で確認できます。`mcp:smoke` は実際のstdioサーバーを起動し、初期化、`tools/list`、`get_inventory_summary`の呼び出しまで確認します。いずれも `OK` で終了すれば初回セットアップ完了です。

架空seedは初回確認用です。再実行する前に既存データを確認してください。実データはseedやGitに入れず、ローカルの画面から登録します。

### よくある失敗

| 症状                    | 対処                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vp: command not found` | 新しいシェルを開くか、Vite+のセットアップに従って環境設定を読み込む。`sh scripts/doctor.sh`で再確認する。                                                                                                    |
| `docker info`が失敗する | macOSではDocker Desktopを起動する。LinuxではDocker Engineを起動し、現在のユーザーのDocker利用権限を確認する。                                                                                                |
| `5432`のポート競合      | `docker compose up -d`のエラーと `docker compose ps` を確認する。既存のPostgreSQLを止めるか、`.env`に`GF_DB_PORT=5433`を追記して`DATABASE_URL`のポートも`5433`へ変更し、`docker compose up -d`を再実行する。 |
| DB未起動・接続拒否      | `docker compose up -d`、`docker compose ps`でpostgresの起動とhealthy状態を確認し、`sh scripts/doctor.sh`を再実行する。                                                                                       |
| 認証エラー              | `.env`の`DATABASE_URL`と`docker-compose.yml`のDB名・ユーザー・パスワードを照合する。既存のDocker volumeは環境変数を書き換えても初期パスワードが変わらないため、既存DBの認証情報を確認する。                  |
| migration不足           | `vp run db:migrate`を実行してからdoctorを再実行する。履歴不一致なら別のDBへの接続を疑い、既存データを消さずに確認する。                                                                                      |

作業を終えるときは `docker compose stop`、再開するときは `docker compose up -d` を実行します。データを別端末へ移す場合は[バックアップと復元](#バックアップと復元)を参照してください。`docker compose down -v` は保存済みDBを削除するため、通常の終了には使いません。

### 公開前のデータ確認

- `.env`、DB dump、実データCSV、スクリーンショット、バックアップをGitに追加しない。
- 実データCSVはリポジトリ外か、無視対象の `data/imports/` に保管する。
- バックアップはリポジトリ外に保管する。
- commit前に以下を実行し、stagedファイルも確認する。

```sh
vp run check:data
git diff --cached --name-only
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

## CSVで一括登録・更新

画面の「CSVで一括登録・更新」から、架空のキャラクター・武器・召喚石を含むテンプレートをダウンロードできます。実データに書き換えたCSVはリポジトリ外、または無視対象の `data/imports/` に保管してください。CSVは拡張子の大小文字を問わずGit除外・公開禁止検査の対象です。サーバーはCSVをファイルやDBへ保存せず、リクエスト処理中にだけ解析します。

1. UTF-8 CSVを選択します（BOMありも可、1MiB・1,000データ行以内）。
2. 「検証・プレビュー」で全行の新規・更新・エラー件数と変更予定を確認します。この時点ではDBに変更は入りません。
3. 不正行があれば行番号・項目名・理由を見てCSVを修正し、選び直します。
4. エラーがなければ確認チェックを入れ、「確認した全行を保存」で登録します。途中失敗では全行の変更を取り消します。

「インポートをキャンセル」はCSVとプレビューを破棄し、DBには書き込みません。CSV変更後は確認をやり直します。保存時にも全行を再検証し、プレビュー時と新規・更新の判定が変わった場合は再プレビューが必要です。

ヘッダーは以下の11列を各1回指定します（順序は任意、追加列は不可）。値にカンマ・改行・引用符を含む場合はCSVの引用符を使い、内部の引用符を二重にします。空行は無視し、エラーの行番号はヘッダーを含む物理行番号です。

| 列               | 入力・空欄の扱い                                             |
| ---------------- | ------------------------------------------------------------ |
| `kind`           | 必須: `character` / `weapon` / `summon`                      |
| `name`           | 必須: 名称（120文字以内）。種類＋正規化名称で同一項目を判定  |
| `element`        | 属性の管理語彙。空欄は属性なしに更新                         |
| `rarity`         | 20文字以内。空欄はクリア                                     |
| `tags`           | 管理タグを `heal\|dispel` のように `\|` 区切り。空欄は空配列 |
| `owned`          | 必須: `true` / `false`。`false` は既存の所持情報を削除       |
| `quantity`       | 10進整数1〜999。空欄は1                                      |
| `uncapLevel`     | 10進整数0〜10。空欄は0                                       |
| `awakeningLevel` | 10進整数0〜20。空欄はクリア                                  |
| `notes`          | 所持メモ（1,000文字以内）。空欄はクリア                      |
| `details`        | 種類別詳細のJSON。新規では必須、既存で空欄なら保持           |

新規データの `details` は後述の入力仕様に従います。例えばCSVの武器詳細セルは `"{""weaponType"":""sword"",""skillEffects"":[""attack""],""maxUncapLevel"":5}"` です。CSV内の重複キーはエラーになります。名称変更は別キーとなるため、新規登録として扱われます。名前の訂正には詳細編集を使ってください。カタログの `metadata` と出典情報は一括更新でも保持します。攻略記事本文・画像や第三者データベースの一括取り込みには使用しないでください。

APIは `POST /api/import/preview` に `{ csv }` を渡し、返却された `token` を `POST /api/import/apply` の `{ csv, token, confirm: true }` に渡します。トークンはプレビュー内容とCSVに結び付き、サーバー再起動後は再プレビューが必要です。不正行は `400`、未確認・変更された登録予定は `409`、保存失敗は `500` を返します。

## カタログ・所持情報の編集

一覧の「詳細・編集」から、名称・種類・属性・レアリティ・タグ・種類別の詳細と、所持数・上限解放段階・覚醒レベル・メモを編集できます。カタログと所持情報はそれぞれの保存ボタンで保存します。不正な入力は項目の下にエラーが表示されます。「閉じる」は未保存の変更を破棄します。

「所持を解除」は所持情報だけを削除し、カタログと出典を残します。「カタログを削除…」では、削除される所持情報と出典情報の件数を確認し、確認チェックを入れてから削除します。削除は元に戻せません。削除確認をキャンセルすると、編集中の入力を保持して戻ります。

API:

- `GET /api/catalog/:entityId`: カタログ・所持情報・出典情報の取得
- `PUT /api/catalog/:entityId`: カタログの全項目更新（作成時と同じ種類別入力仕様、`source` は更新対象外）
- `PUT /api/inventory/:entityId`: 所持情報の更新（`owned: false` は所持解除）
- `DELETE /api/catalog/:entityId`: `{ "confirm": true }` によるカタログと関連情報の削除

入力エラーは `400` と `fieldErrors`（項目パスごとのメッセージ配列）、同じ種類・正規化名称の重複は `409`、存在しない項目は `404` を返します。出典情報とカタログの補足 `metadata` はカタログ更新時に保持されます。

## 出典と確認日の管理

「詳細・編集」の出典欄から、1項目に複数の出典を登録・編集・削除できます。出典種別は次のように使い分けます。

| 種別       | 意味                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `gameplay` | ゲーム内で直接確認した事実                                                 |
| `official` | 公式サイトや公式告知で確認した事実                                         |
| `guide`    | 攻略情報を参考に自分で確認した事実（本文・評価コメント・画像は保存しない） |
| `user`     | ユーザー自身の記録・補足                                                   |

URLは任意で、HTTP/HTTPSのみ、最大2,048文字です。確認日は必須、検証日は任意で再確認した日時を記録します。APIではUTCのISO 8601日時を入力し、画面ではローカル日時を入力・表示します。事実メモは500文字以内です。攻略記事本文や画像を保存せず、短い事実と由来だけを記録してください。

一覧には出典件数と最終確認日を表示し、出典未登録・要再確認・確認済みで絞り込めます。最終確認日は全出典の確認日・検証日の最新日時です。出典があり、最終確認から90日以上経過した項目を「要再確認」とします。「確認済み」は鮮度の目安で、内容の正確性を保証するものではありません。

出典だけの削除はカタログ・所持情報を保持します。カタログを削除すると、その全出典も削除されます。編集・削除確認のキャンセルでは保存しません。外部ページの取得や保存は行いません。

出典API:

- `GET /api/catalog/:entityId/sources`: 出典一覧取得
- `POST /api/catalog/:entityId/sources`: 出典追加
- `PUT /api/catalog/:entityId/sources/:sourceId`: 出典全項目更新
- `DELETE /api/catalog/:entityId/sources/:sourceId`: 出典削除

追加・更新の入力は `{ kind, url?, note?, observedAt, verifiedAt? }` です。任意項目は `null` でクリアできます。別のカタログに属する出典IDは `404` になります。カタログ一覧APIの `sourceStatus=missing|stale|current` で同じ鮮度条件を指定できます。MCPの `search_entities` も `sourceStatus` を受け付けます。

## MCP

MCPクライアントには、リポジトリを作業ディレクトリとして次のstdioコマンドを登録します。`vp run`は進捗表示を標準出力へ書く可能性があるため、MCPのプロトコルを壊さない専用スクリプトを使用します。

```sh
sh scripts/run-mcp.sh
```

一般的なMCPクライアントのstdio設定例（`/absolute/path/to/gf-database`を `pwd` で確認した絶対パスへ置換）:

```json
{
  "mcpServers": {
    "gf-database": {
      "command": "sh",
      "args": ["scripts/run-mcp.sh"],
      "cwd": "/absolute/path/to/gf-database",
      "env": {
        "DATABASE_URL": "postgres://gf:local-development-only@127.0.0.1:5432/gf_database"
      }
    }
  }
}
```

このURLは`.env.example`と同じローカル専用の架空値です。実際の認証情報をクライアント設定に書く場合は、その設定ファイルをGit管理外に置いてください。`cwd`を指定できないクライアントでは、`command`を絶対パスの`sh`、`args`をスクリプトの絶対パスにしたうえで、起動作業ディレクトリをリポジトリルートにしてください。MCPを再確認する場合は `vp run mcp:smoke` を実行します。

提供するツール:

- `list_battle_conditions`: 登録したバトル条件を一覧取得（`limit` 1〜50、既定30、`offset` 0〜10,000。続きがあれば`hasMore`を返す）
- `get_battle_condition`: `battleId`でバトル条件の詳細を取得
- `search_entities`: カタログ検索
- `get_entity_details`: カタログ詳細・所持情報・出典・確認日・検証日の取得。出典は`sourceLimit` 1〜50（既定30）、`sourceOffset` 0〜10,000（既定0）で分割取得し、必要に応じて`sourceCount`と`hasMoreSources`を返す
- `get_inventory_summary`: 所持数の集計
- `find_owned_candidates`: 属性・役割タグによる所持候補の順位付け
- `recommend_owned_formation`: 所持中のキャラクター・武器・召喚石を種類別に評価し、スコア内訳、一致・不足タグ、適格判定、警告を返す

`POST /api/recommendations` と `recommend_owned_formation` は `battleId` または都度指定の `element`、`requiredTags`、`preferredTags` を受け付けます。`limitPerKind` は種類ごとに1〜20件（既定10件）です。必須タグと属性は各所持品の適格判定に使い、加点タグは順位にだけ使います。順位は適格判定、スコア、名称、IDの順で決定します。情報不足や適格候補不足は `warnings` で返します。これはLLMへ渡す候補を絞るための簡易指標であり、ゲーム内ダメージや編成成立を保証するものではありません。

## Database

実データはDocker named volume `gf_postgres_data`に保存され、リポジトリには入りません。公開されるのは`src/database/schema.ts`と`drizzle/`内のマイグレーションだけです。

```sh
vp run db:generate
vp run db:migrate
```

### バックアップと復元

PostgreSQLコンテナを起動し、**リポジトリ外**の既存ディレクトリへカスタム形式のバックアップを作成します。保存先は必ず明示し、既存ファイルへの上書きは拒否します。`*.dump`と同名の`*.dump.json`を一緒に保管してください。JSONには作成日時、マイグレーションの最新ID（schema version）、形式、SHA-256チェックサム、元のDB名を記録します。認証情報は含みません。これらのファイルには所持情報や出典などの実データが含まれるため、Gitへ追加しないでください。

```sh
mkdir -p "$HOME/gf-db-backups"
vp run db:backup --database gf_database "$HOME/gf-db-backups/gf-2026-09-22.dump"
cat "$HOME/gf-db-backups/gf-2026-09-22.dump.json"
```

通常はこの作業ディレクトリの`docker compose`に属する`postgres`コンテナを使用します。別の作業ディレクトリから既存コンテナを指定する場合は、`docker ps`で名前を確認し、`GF_DB_CONTAINER=コンテナ名`をコマンドの前に付けてください。コマンドは選択したコンテナ名とDB名を表示します。選択を誤ると別DBのバックアップや復元になるため、表示を確認してください。

復元では、**同じコンテナ内に作成した空の別DB**を指定します。既存のデータがあるDBとコンテナの既定DBへの復元は拒否します。次の例は`gf_restored`を作り、バックアップのチェックサムと形式を検証してから復元します。表示された対象と影響を読み、`RESTORE gf_restored`を正確に入力した場合だけ書き込みます。

```sh
docker compose exec -T postgres sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec createdb -U "$POSTGRES_USER" gf_restored'
vp run db:restore --database gf_restored "$HOME/gf-db-backups/gf-2026-09-22.dump"
```

`pg_restore --single-transaction --exit-on-error`を使うため、復元処理中のエラーはロールバックします。失敗後は対象DBが空であることを確認し、不明な状態ならその復元専用DBを削除して作り直してから再試行してください。復元後は `.env` の `DATABASE_URL` のDB名を`gf_restored`に変更してAPIを起動し、カタログ・所持情報・出典を確認してください。復元済みDBに対して`db:migrate`を先に実行する必要はありません。

端末移行時は、旧端末で作成した`.dump`と`.dump.json`を外部ドライブなどで新端末の**リポジトリ外**へコピーします。新端末でSetupの`docker compose up -d`まで実施し、上記の空DB作成・復元・`.env`切り替えを行います。新端末でも同じPostgreSQLメジャーバージョンのコンテナイメージを使ってください。旧端末の`.env`やDBパスワードをバックアップファイル名・共有先・コマンド出力に含めないでください。

スモークテストでは、架空データだけを入れたDBをバックアップし、別の空DBへ復元して、件数・所持情報・出典を比較します。公開禁止データ検査は従来どおり`vp run check:data`で実行してください。

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

## バトル条件

画面の「バトル条件」で名称、敵属性、推奨属性、目的（フルオート・短期・長期・その他）、必須タグ、優先タグ、メモを登録できます。タグは管理語彙から選び、削除時には確認が表示されます。

APIは `GET/POST /api/battles` と `GET/PUT/DELETE /api/battles/:battleId` を提供します。削除には `{"confirm":true}` が必要です。推薦時は `POST /api/candidates` に `{"battleId":"<UUID>"}` を渡せます。必須タグをすべて持つ所持候補だけを残し、優先タグは順位に加点します。MCPでは `list_battle_conditions` で条件を確認し、`find_owned_candidates` の `battleId` に指定できます。

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
