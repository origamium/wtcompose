/**
 * @fileoverview 設定ファイルローダー
 * WTurbo設定ファイルの検索、読み込み、デフォルト値とのマージを担当
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"
import { parse } from "yaml"
import { CONFIG_FILE_NAMES, DEFAULT_CONFIG } from "../../constants/index.js"
import type { WTurboConfig } from "../../types/index.js"
import { validateConfig } from "./validator.js"

/**
 * 設定ファイルの検索結果
 */
interface ConfigFileResult {
  path: string | null
  exists: boolean
}

/**
 * 設定ファイルを検索してパスを返す
 */
export function findConfigFile(startDir: string = process.cwd()): ConfigFileResult {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.resolve(startDir, fileName)
    if (existsSync(configPath)) {
      return { path: configPath, exists: true }
    }
  }
  return { path: null, exists: false }
}

/**
 * 設定ファイルのパスを取得（存在しない場合はデフォルトパスを返す）
 */
export function getConfigFilePath(startDir: string = process.cwd()): string {
  const result = findConfigFile(startDir)
  return result.path || path.resolve(startDir, CONFIG_FILE_NAMES[0])
}

/**
 * 設定ファイルが存在するかチェック
 */
export function hasConfigFile(startDir: string = process.cwd()): boolean {
  return findConfigFile(startDir).exists
}

/**
 * 部分設定をデフォルト設定とマージ
 * `||` ではなく `??` を使用して falsy 値（空配列・空文字等）を正しく扱う
 */
export function mergeWithDefaults(partial: Partial<WTurboConfig>): WTurboConfig {
  return {
    base_branch: partial.base_branch ?? DEFAULT_CONFIG.base_branch,
    docker_compose_file: partial.docker_compose_file ?? DEFAULT_CONFIG.docker_compose_file,
    copy_files: partial.copy_files ?? [...DEFAULT_CONFIG.copy_files],
    link_files: partial.link_files ?? [...DEFAULT_CONFIG.link_files],
    start_command: partial.start_command ?? DEFAULT_CONFIG.start_command,
    end_command: partial.end_command ?? DEFAULT_CONFIG.end_command,
    env: {
      file: partial.env?.file ?? [...DEFAULT_CONFIG.env.file],
      adjust: partial.env?.adjust ?? { ...DEFAULT_CONFIG.env.adjust },
    },
  }
}

/**
 * デフォルト設定ファイルを作成
 */
export function createDefaultConfig(configPath?: string): WTurboConfig {
  const targetPath = configPath || getConfigFilePath()
  const defaultConfig = mergeWithDefaults({})

  const yamlContent = `# WTurbo Configuration File
# Git worktree management with Docker Compose environment isolation

# Base branch for creating new worktrees
base_branch: "${defaultConfig.base_branch}"

# Docker Compose file path (relative to config file)
docker_compose_file: "${defaultConfig.docker_compose_file}"

# Files and directories to copy when creating a worktree
# These files will be copied even if they are gitignored
# Useful for .env files, local configuration, etc.
copy_files:
  # - .env
  # - .claude
  # - .serena

# Files and directories to symlink (not copy) when creating a worktree
# Symlinks share the single source file/dir across all worktrees (ideal for large dirs)
# If a path appears in both copy_files and link_files, link_files takes priority
link_files:
  # - node_modules
  # - .cache

# Command to run after worktree creation (e.g., install dependencies)
# start_command: ./start-dev.sh

# Command to run before worktree removal (e.g., cleanup)
# end_command: ./stop-dev.sh

# Environment configuration
env:
  # Environment files to copy and adjust
  file:
    - "${defaultConfig.env.file[0]}"

  # Environment variable adjustments
  # Values can be:
  #   - string: direct replacement
  #   - number: increment by this amount (for ports)
  #   - null: remove the variable
  adjust:
    # Example port adjustments:
    # APP_PORT: 1000        # Add 1000 to original port
    # DB_PORT: 1000         # Add 1000 to original port
    # API_URL: "string"     # Replace with this string
    # DEBUG_MODE: null      # Remove this variable
`

  fs.writeFileSync(targetPath, yamlContent, "utf-8")
  return defaultConfig
}

/**
 * 設定ファイルを読み込み、パースしてオブジェクトを返す
 * mergeWithDefaults後に validateConfig を実行し、警告は stderr へ出力、エラーは例外をスロー
 *
 * @param configDir - 設定ファイル検索ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 設定オブジェクト
 * @throws {Error} 設定ファイルの読み込み・パース・バリデーションに失敗した場合
 */
export function loadConfig(configDir: string = process.cwd()): WTurboConfig {
  const configResult = findConfigFile(configDir)

  if (!configResult.exists) {
    process.stderr.write("⚠️  No wturbo.yaml found, using default configuration\n")
    return mergeWithDefaults({})
  }

  try {
    const configPath = configResult.path as string
    console.log(`📋 Loading configuration from: ${path.basename(configPath)}`)
    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = parse(content) as Partial<WTurboConfig>

    const config = mergeWithDefaults(parsed)

    // バリデーション実行（警告は stderr、エラーは例外）
    try {
      validateConfig(config, configPath)
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : String(validationError)
      throw new Error(`Configuration validation failed: ${message}`)
    }

    return config
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load configuration from ${configResult.path}: ${message}`)
  }
}
