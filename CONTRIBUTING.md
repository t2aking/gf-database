# コントリビューションガイド

Issue や Pull Request を歓迎します。機能や修正の提案は、公開して問題のない情報だけで説明してください。脆弱性は公開 Issue に書かず、[セキュリティポリシー](SECURITY.md) の非公開経路から報告してください。

## ローカルセットアップ

macOS または Linux で、[Vite+](https://viteplus.dev/guide/) と Docker（Compose を含む）を用意してください。Vite+ が必要な Node.js と pnpm を管理します。詳細やトラブルシューティングは [README の Setup](README.md#setup) を参照してください。

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
vp install
docker compose up -d
vp run db:migrate
vp run db:seed:sample
sh scripts/doctor.sh
vp run mcp:smoke
```

`.env.example` の値はローカル開発専用です。既存の `.env` とデータベースを上書きしないでください。架空 seed の再実行前には既存データを確認してください。

## 変更の検証

Pull Request の前に、変更に関係する動作を確認し、次を実行してください。

```sh
vp check
vp test
vp build
vp run check:data
```

PostgreSQL を使う統合テストには `TEST_DATABASE_URL` を指定します。テスト専用のローカル DB を使ってください。CI では PostgreSQL を起動し、この統合テストも実行します。詳しくは [README の Quality checks](README.md#quality-checks) を参照してください。

```sh
TEST_DATABASE_URL=postgres://gf:local-development-only@127.0.0.1:5432/gf_database vp test
```

コミット前に `git diff --cached --name-only` と差分の内容を確認してください。`check:data` は禁止対象のファイル名を検出しますが、文書やコードに紛れた秘密情報・転載内容までは保証しません。

## 公開する内容

- 実ゲームデータ、所持情報、CSV、DB dump、バックアップ、スクリーンショットをコミットや Issue・Pull Request に含めないでください。再現例には架空データを使ってください。
- `.env`、パスワード、トークン、Cookie、非公開 API レスポンスなどの認証・秘密情報を含めないでください。
- ゲーム画像・ロゴ、攻略記事本文、第三者サイトの文章やデータベースなど、利用許可のない第三者コンテンツを転載しないでください。
- 出典 URL や自分で確認した事実情報の扱いは [README の Data policy](README.md#data-policy) に従ってください。

Pull Request には変更理由、確認方法、関連 Issue を記載してください。
