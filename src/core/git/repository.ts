/**
 * @fileoverview Git リポジトリ操作
 * Gitリポジトリの基本的な状態確認と情報取得を担当
 */

import { execSync } from "node:child_process"
import { FILE_ENCODING, GIT_COMMANDS } from "../../constants/index.js"
import type { ExecOptions } from "../../types/index.js"

/**
 * Gitコマンドを実行するための基本ヘルパー
 *
 * @param command - 実行するGitコマンド
 * @param options - 実行オプション
 * @returns コマンドの出力結果
 * @throws {Error} コマンドの実行に失敗した場合
 *
 * @example
 * ```typescript
 * const output = execGitCommand('git status --porcelain')
 * console.log(output)
 * ```
 */
function execGitCommand(command: string, options?: ExecOptions): string {
  try {
    const execOptions = {
      encoding: FILE_ENCODING,
      stdio: "pipe" as const,
      ...(options?.cwd && { cwd: options.cwd }),
      ...(options?.env && { env: { ...process.env, ...options.env } }),
    }
    return execSync(command, execOptions).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Git command failed: ${command}\n${message}`)
  }
}

/**
 * 現在のディレクトリがGitリポジトリかどうかを判定
 *
 * @param cwd - チェックするディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns Gitリポジトリの場合true
 *
 * @example
 * ```typescript
 * if (isGitRepository()) {
 *   console.log('This is a Git repository')
 * } else {
 *   console.log('Not a Git repository')
 *   process.exit(EXIT_CODES.NOT_GIT_REPOSITORY)
 * }
 * ```
 */
export function isGitRepository(cwd?: string): boolean {
  try {
    execGitCommand(GIT_COMMANDS.IS_REPOSITORY, { cwd })
    return true
  } catch {
    return false
  }
}

/**
 * Gitリポジトリのルートディレクトリを取得
 *
 * @param cwd - 開始ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns リポジトリのルートディレクトリパス
 * @throws {Error} Gitリポジトリではない場合
 *
 * @example
 * ```typescript
 * try {
 *   const root = getGitRoot()
 *   console.log(`Repository root: ${root}`)
 * } catch (error) {
 *   console.error('Not in a Git repository')
 * }
 * ```
 */
export function getGitRoot(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitCommand(GIT_COMMANDS.GET_ROOT, { cwd })
}

/**
 * 現在のブランチ名を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 現在のブランチ名
 * @throws {Error} Gitリポジトリではない場合
 *
 * @example
 * ```typescript
 * const branch = getCurrentBranch()
 * console.log(`Current branch: ${branch}`)
 * ```
 */
export function getCurrentBranch(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitCommand(GIT_COMMANDS.CURRENT_BRANCH, { cwd })
}

/**
 * 指定したブランチが存在するかチェック
 *
 * @param branchName - チェックするブランチ名
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns ブランチが存在する場合true
 *
 * @example
 * ```typescript
 * if (branchExists('feature/new-ui')) {
 *   console.log('Branch exists')
 * } else {
 *   console.log('Branch does not exist')
 * }
 * ```
 */
export function branchExists(branchName: string, cwd?: string): boolean {
  if (!isGitRepository(cwd)) {
    return false
  }

  try {
    const command = GIT_COMMANDS.BRANCH_EXISTS.replace("{branchName}", branchName)
    execGitCommand(command, { cwd })
    return true
  } catch {
    return false
  }
}

/**
 * リポジトリの基本情報を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns リポジトリ情報オブジェクト
 * @throws {Error} Gitリポジトリではない場合
 *
 * @example
 * ```typescript
 * const info = getRepositoryInfo()
 * console.log(`Root: ${info.root}`)
 * console.log(`Current branch: ${info.currentBranch}`)
 * console.log(`Is clean: ${info.isClean}`)
 * ```
 */
export function getRepositoryInfo(cwd?: string) {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const root = getGitRoot(cwd)
  const currentBranch = getCurrentBranch(cwd)

  // リポジトリの状態をチェック
  let isClean: boolean
  try {
    const status = execGitCommand("git status --porcelain", { cwd })
    isClean = status.length === 0
  } catch {
    isClean = false
  }

  return {
    root,
    currentBranch,
    isClean,
    isGitRepository: true,
  }
}
