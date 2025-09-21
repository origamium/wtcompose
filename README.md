# WTurbo

git worktreeを拡張し、worktreeを利用した際にdocker composeの設定を引き継ぎ、素早く別環境を構築できるようにするツールです。

デフォルトではすでに使われているコンテナ、ボリューム、ネットワークをコピーし、ビルドやローカルDBの再構築といった手順を省略し、高速な環境構築を実現します。

## usage

### worktree

* `> wturbo -b hotfix`

このコマンドは `git worktree add -b hotfix ../hotfix` を実行します。
さらに `docker-compose,yaml` の設定を引き継ぎ、新しいcontainer, volume, networkを作成しようとします。
このさい、ベースブランチの既存のcontainer, volume, networkをコピーしようとします。

* `> wturbo -b hotfix --build`

このコマンドは `git worktree add -b hotfix ../hotfix` を実行します。
さらに、 `docker-compose,yaml` の設定を引き継ぎ、新しいcontainer, volume, networkを作成しようとします。
`docker compose up -d --build`を実行します。

* `> wturbo -b hotfix --remove`

このコマンドは `git worktree remove ../hotfix` を実行します。
さらに、worktree removeの実行前に `docker compose down` を実行します。

### env
#### wturboの設定

wturboの設定は、プロジェクトルートに `wturbo.yaml` を作成し、以下のように設定します。

```wturbo.yaml
base_branch: main
docker_compose_file: ./docker-compose.yaml
env:
  file:
    - ./frontend/.env
    - ./backend/.env
  adjust:
    VITE_APP_PORT: null
    BACKEND_PORT: null
    FRONT_URL: 5173
    BACKEND_URL: 8000
```

`increment_env`に設定した値は、`.env`ファイルの値からインクリメントした値を調整します。
* null を指定した場合は、wturboが自動的に値を決定します。
* 数値を指定した場合は、その数値を調整します。 `http://127.0.0.1/3000` といったURLの指定のさい、指定した値を自動で調整します。
* 文字列を指定した場合は、その文字列を調整します。 `myapp-1` といった名前の指定のさい、指定した値を自動で調整します。
* 指定しなかった場合は、`.env`ファイルの値をそのまま利用します。
