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

`data/private`、DB dump、スクリーンショット、`.env`などはGit管理を禁止しています。バックアップもリポジトリ外へ保存してください。

## Quality checks

```sh
vp check
vp test
vp build
vp run check:data
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
