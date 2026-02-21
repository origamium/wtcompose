# wturbo

**複数ブランチの開発環境を一瞬で切り替える**

Git worktreeを使って、ブランチごとに独立した作業ディレクトリを作成・管理するCLIツールです。

## こんな時に便利

- メインブランチで作業中に、緊急のバグ修正が入った
- 複数の機能ブランチを並行して開発したい
- PRレビュー用に別ブランチをすぐに確認したい
- `.env`などgitignoreされたファイルも新しい作業環境にコピーしたい

## クイックスタート

### 1. インストール

```bash
npm install -g wturbo
```

### 2. 設定ファイルを作成

プロジェクトのルートに `wturbo.yaml` を作成:

```yaml
base_branch: main

# gitignoreされているファイルも新しいworktreeにコピー
copy_files:
  - .env
  - .env.local
```

### 3. 使う

```bash
# 新しいブランチ用のworktreeを作成
wturbo create feature/awesome-feature

# 作業ディレクトリに移動
cd ../worktree-feature-awesome-feature

# 作業完了後、worktreeを削除
wturbo remove feature/awesome-feature
```

## コマンド

### `wturbo create <branch>`

新しいworktreeを作成します。

```bash
wturbo create feature/new-feature
wturbo create bugfix/urgent-fix
```

**処理内容:**
1. `git worktree add` でブランチ用の作業ディレクトリを作成
2. `copy_files` で指定したファイルをコピー
3. `start_command` を実行（設定時のみ）

**オプション:**
- `-p, --path <path>` - worktreeの作成場所を指定（デフォルト: 親ディレクトリに `worktree-<branch名>` で作成）
- `--no-create-branch` - 既存のブランチを使用（新規作成しない）

### `wturbo remove <branch>`

worktreeを削除します。

```bash
wturbo remove feature/new-feature
```

**処理内容:**
1. `end_command` を実行（設定時のみ）
2. `git worktree remove` でworktreeを削除

**オプション:**
- `-f, --force` - 未コミットの変更があっても強制削除

### `wturbo status`

現在のworktree一覧を表示します。

```bash
wturbo status
```

出力例:
```
🌿 Git Worktrees (3 total)
  → main: /Users/me/project
    feature/auth: /Users/me/worktree-feature-auth
    bugfix/login: /Users/me/worktree-bugfix-login
```

## 設定ファイル

`wturbo.yaml`, `wturbo.yml`, `.wturbo.yaml`, `.wturbo.yml` のいずれかをプロジェクトルートに配置します。

### 基本設定

```yaml
base_branch: main
```

### ファイルコピー

gitignoreされているファイルや設定ファイルを新しいworktreeにコピー:

```yaml
copy_files:
  - .env
  - .env.local
  - .claude          # ディレクトリも可
  - config/local.json
```

### スクリプト実行

worktree作成時・削除時にスクリプトを実行:

```yaml
# 作成後に実行（依存関係のインストールなど）
start_command: ./scripts/setup.sh

# 削除前に実行（クリーンアップなど）
end_command: ./scripts/cleanup.sh
```

### フル設定例

```yaml
base_branch: main
docker_compose_file: ./docker-compose.yml

copy_files:
  - .env
  - .env.local
  - .secrets
  - config/

start_command: npm install && npm run db:migrate
end_command: docker compose down

env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1000    # ポート番号に+1000
    DB_PORT: 1000
```

## 設定項目一覧

| 項目 | 型 | 説明 |
|------|------|------|
| `base_branch` | string | ベースブランチ名（デフォルト: `main`） |
| `docker_compose_file` | string | Docker Composeファイルのパス |
| `copy_files` | string[] | コピーするファイル/ディレクトリ |
| `start_command` | string | worktree作成後に実行するコマンド |
| `end_command` | string | worktree削除前に実行するコマンド |
| `env.file` | string[] | 環境変数ファイルのリスト |
| `env.adjust` | object | 環境変数の調整（数値: 加算, 文字列: 置換, null: 削除） |

## 必要環境

- Node.js 18+
- Git

## License

MIT
