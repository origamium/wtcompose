# WTurbo Sample Project

このディレクトリはWTurboの機能をテストするためのサンプルプロジェクトです。

## 構成

- **PostgreSQL** - データベース（postgres:16-alpine）
- **Next.js** - フロントエンドアプリケーション（Node 20）
- **Debian** - 開発用コンテナ（bookworm-slim）

## ディレクトリ構造

```
sample/
├── docker-compose.yml    # Docker Compose設定
├── wturbo.yaml           # WTurbo設定
├── start-dev.sh          # worktree作成後に実行されるスクリプト
├── stop-dev.sh           # worktree削除時に実行されるスクリプト
├── .env                  # 環境変数（gitignore対象）
├── .env.example          # 環境変数のサンプル
├── .gitignore            # Git ignore設定
├── .claude/              # Claude Code設定（gitignore対象）
├── .serena/              # Serena設定（gitignore対象）
├── init-db/              # PostgreSQL初期化スクリプト
├── scripts/              # ユーティリティスクリプト
└── next-app/             # Next.jsアプリケーション
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    └── app/
        ├── layout.tsx
        └── page.tsx
```

## 使い方

### 1. 環境の起動

```bash
cd sample
docker compose up -d
```

### 2. WTurboでworktreeを作成

```bash
# プロジェクトルートに移動
cd ..

# ビルド
npm run build

# sampleディレクトリでworktreeを作成
cd sample
../dist/index.js create feature/test
```

### 3. copy_files機能の確認

worktree作成時に、以下のファイル/ディレクトリが自動的にコピーされます：

- `.env` - 環境変数ファイル
- `.claude/` - Claude Code設定
- `.serena/` - Serena設定

これらはgitignoreされていますが、worktreeにコピーされるため、
各worktreeで同じ環境設定を使用できます。

### 4. start_command / end_command

worktree作成時と削除時にスクリプトを自動実行します：

- `start_command: ./start-dev.sh` - worktree作成後に実行
  - Node.js依存関係のインストール
  - Docker Composeサービスの起動

- `end_command: ./stop-dev.sh` - worktree削除前に実行
  - Docker Composeサービスの停止

## ポート設定

| サービス | デフォルトポート | 環境変数 |
|----------|------------------|----------|
| Next.js  | 3000             | APP_PORT |
| PostgreSQL | 5432           | DB_PORT  |

## 環境変数

`.env.example`を`.env`にコピーして、必要に応じて値を変更してください：

```bash
cp .env.example .env
```

主な環境変数：

- `DB_USER` - PostgreSQLユーザー名
- `DB_PASSWORD` - PostgreSQLパスワード
- `DB_NAME` - データベース名
- `APP_PORT` - Next.jsのポート
- `JWT_SECRET` - JWT署名用シークレット
