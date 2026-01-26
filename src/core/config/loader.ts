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

/**
 * 設定ファイルの検索結果
 */
interface ConfigFileResult {
  /** 見つかった設定ファイルのパス */
  path: string | null
  /** 設定ファイルが存在するか */
  exists: boolean
}

/**
 * 設定ファイルを検索してパスを返す
 *
 * @param startDir - 検索開始ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 設定ファイルの検索結果
 *
 * @example
 * ```typescript
 * const result = findConfigFile('/project/root')
 * if (result.exists) {
 *   console.log(`Found config at: ${result.path}`)
 * }
 * ```
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
 *
 * @param startDir - 検索開始ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 設定ファイルのパス
 *
 * @example
 * ```typescript
 * const configPath = getConfigFilePath()
 * console.log(`Config file path: ${configPath}`)
 * ```
 */
export function getConfigFilePath(startDir: string = process.cwd()): string {
  const result = findConfigFile(startDir)
  return result.path || path.resolve(startDir, CONFIG_FILE_NAMES[0])
}

/**
 * 設定ファイルが存在するかチェック
 *
 * @param startDir - 検索開始ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 設定ファイルが存在するか
 *
 * @example
 * ```typescript
 * if (hasConfigFile()) {
 *   console.log('Configuration file found')
 * } else {
 *   console.log('No configuration file found')
 * }
 * ```
 */
export function hasConfigFile(startDir: string = process.cwd()): boolean {
  return findConfigFile(startDir).exists
}

/**
 * 部分設定をデフォルト設定とマージ
 *
 * @param partial - 部分設定オブジェクト
 * @returns 完全な設定オブジェクト
 *
 * @example
 * ```typescript
 * const config = mergeWithDefaults({
 *   base_branch: 'develop'
 * })
 * // 結果: base_branchは'develop'、他はデフォルト値
 * ```
 */
export function mergeWithDefaults(partial: Partial<WTurboConfig>): WTurboConfig {
  return {
    base_branch: partial.base_branch || DEFAULT_CONFIG.base_branch,
    docker_compose_file: partial.docker_compose_file || DEFAULT_CONFIG.docker_compose_file,
    copy_files: partial.copy_files || [...DEFAULT_CONFIG.copy_files],
    start_command: partial.start_command ?? DEFAULT_CONFIG.start_command,
    end_command: partial.end_command ?? DEFAULT_CONFIG.end_command,
    env: {
      file: partial.env?.file || [...DEFAULT_CONFIG.env.file],
      adjust: partial.env?.adjust || { ...DEFAULT_CONFIG.env.adjust },
    },
  }
}

/**
 * デフォルト設定ファイルを作成
 *
 * @param configPath - 作成先のパス（デフォルト: カレントディレクトリのwturbo.yaml）
 * @returns 作成された設定オブジェクト
 *
 * @example
 * ```typescript
 * const config = createDefaultConfig('./my-project/wturbo.yaml')
 * console.log('Default config created')
 * ```
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
 *
 * @param configDir - 設定ファイル検索ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 設定オブジェクト
 *
 * @throws {Error} 設定ファイルの読み込みまたはパースに失敗した場合
 *
 * @example
 * ```typescript
 * try {
 *   const config = loadConfig()
 *   console.log(`Base branch: ${config.base_branch}`)
 * } catch (error) {
 *   console.error('Failed to load config:', error.message)
 * }
 * ```
 */
export function loadConfig(configDir: string = process.cwd()): WTurboConfig {
  const configResult = findConfigFile(configDir)

  if (!configResult.exists) {
    console.log("⚠️  No wturbo.yaml found, using default configuration")
    return mergeWithDefaults({})
  }

  try {
    const configPath = configResult.path as string
    console.log(`📋 Loading configuration from: ${path.basename(configPath)}`)
    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = parse(content) as Partial<WTurboConfig>

    // 環境ファイルの存在チェック（警告のみ）
    if (parsed.env?.file) {
      const configFileDir = path.dirname(configPath)
      parsed.env.file.forEach((envFile) => {
        const envPath = path.resolve(configFileDir, envFile)
        if (!existsSync(envPath)) {
          console.log(`⚠️  Environment file not found: ${envFile}`)
        }
      })
    }

    return mergeWithDefaults(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load configuration from ${configResult.path}: ${message}`)
  }
}
