/**
 * @fileoverview アプリケーション定数
 * WTurbo CLI で使用される定数値を統合管理
 */

// =============================================================================
// Application Constants
// =============================================================================

/** アプリケーション名 */
export const APP_NAME = "wturbo"

/** アプリケーションバージョン */
export const APP_VERSION = "1.0.0"

/** アプリケーション説明 */
export const APP_DESCRIPTION = "Git worktree management with Docker Compose environment isolation"

// =============================================================================
// Configuration Constants
// =============================================================================

/** 設定ファイル名の候補リスト（優先順位順） */
export const CONFIG_FILE_NAMES = [
  "wturbo.yaml",
  "wturbo.yml",
  ".wturbo.yaml",
  ".wturbo.yml",
  ".wturbo/config.yaml",
  ".wturbo/config.yml",
] as const

/** デフォルト設定値 */
export const DEFAULT_CONFIG = {
  base_branch: "main",
  docker_compose_file: "./docker-compose.yml",
  copy_files: [] as string[],
  start_command: undefined as string | undefined,
  end_command: undefined as string | undefined,
  env: {
    file: ["./.env"],
    adjust: {},
  },
} as const

// =============================================================================
// Docker Constants
// =============================================================================

/** Docker Composeファイル名の候補リスト */
export const COMPOSE_FILE_NAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const

/** 環境変数ファイル名の候補リスト */
export const ENV_FILE_NAMES = [".env", ".env.local", ".env.development", ".env.production"] as const

/** Dockerコマンドのフォーマット */
export const DOCKER_COMMANDS = {
  CONTAINERS: 'docker ps --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"',
  CONTAINER_VOLUMES:
    'docker inspect --format="{{range .Mounts}}{{.Source}}:{{.Destination}},{{end}}" {containerId}',
  CONTAINER_NETWORKS:
    'docker inspect --format="{{range $key, $value := .NetworkSettings.Networks}}{{$key}},{{end}}" {containerId}',
  VOLUMES: 'docker volume ls --format "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}"',
  VERSION: "docker --version",
  COMPOSE_VERSION: "docker-compose --version",
} as const

/** ポート範囲設定 */
export const PORT_RANGE = {
  MIN: 3000,
  MAX: 9999,
  SEARCH_LIMIT: 100,
} as const

// =============================================================================
// Git Constants
// =============================================================================

/** Gitコマンドのフォーマット */
export const GIT_COMMANDS = {
  IS_REPOSITORY: "git rev-parse --is-inside-work-tree",
  GET_ROOT: "git rev-parse --show-toplevel",
  CURRENT_BRANCH: "git branch --show-current",
  BRANCH_EXISTS: "git show-ref --verify --quiet refs/heads/{branchName}",
  LIST_WORKTREES: "git worktree list --porcelain",
  CREATE_WORKTREE: "git worktree add {path} -b {branch}",
  CREATE_WORKTREE_EXISTING: "git worktree add {path} {branch}",
  REMOVE_WORKTREE: "git worktree remove {path}",
  REMOVE_WORKTREE_FORCE: "git worktree remove --force {path}",
} as const

// =============================================================================
// File System Constants
// =============================================================================

/** ファイルエンコーディング */
export const FILE_ENCODING = "utf-8" as const

/** 一時ディレクトリ名 */
export const TEMP_DIR_PREFIX = "wturbo-" as const

/** バックアップファイル拡張子 */
export const BACKUP_EXTENSION = ".backup" as const

// =============================================================================
// CLI Constants
// =============================================================================

/** 終了コード */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  NOT_GIT_REPOSITORY: 3,
  CONFIG_ERROR: 4,
  DOCKER_ERROR: 5,
} as const

/** ログレベル */
export const LOG_LEVELS = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
} as const

// =============================================================================
// Environment Variable Constants
// =============================================================================

/** 環境変数名の正規表現パターン */
export const ENV_VAR_PATTERNS = {
  VALID_NAME: /^[A-Z][A-Z0-9_]*$/,
  INVALID_CHARS: /[^A-Z0-9_]/g,
  STARTS_WITH_NUMBER: /^([0-9])/,
  MULTIPLE_UNDERSCORES: /_+/g,
  LEADING_TRAILING_UNDERSCORES: /^_+|_+$/g,
} as const

/** WTurboプロジェクト識別用の環境変数プレフィックス */
export const WTCOMPOSE_PREFIX = "WTCOMPOSE_" as const
