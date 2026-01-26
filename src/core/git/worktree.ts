/**
 * @fileoverview Git Worktree 操作
 * Git worktreeの作成、削除、一覧表示等の操作を担当
 */

import { execSync } from "node:child_process"
import * as path from "node:path"
import { FILE_ENCODING, GIT_COMMANDS } from "../../constants/index.js"
import type { ExecOptions, WorktreeInfo } from "../../types/index.js"
import { getGitRoot, isGitRepository } from "./repository.js"

/**
 * Gitコマンドを実行するための基本ヘルパー
 *
 * @param command - 実行するGitコマンド
 * @param options - 実行オプション
 * @returns コマンドの出力結果
 * @throws {Error} コマンドの実行に失敗した場合
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
  } catch (error: any) {
    throw new Error(`Git command failed: ${command}\n${error.message}`)
  }
}

/**
 * Git worktreeの一覧を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeの情報配列
 * @throws {Error} Gitリポジトリではない場合
 *
 * @example
 * ```typescript
 * const worktrees = listWorktrees()
 * worktrees.forEach(wt => {
 *   console.log(`${wt.branch}: ${wt.path}`)
 * })
 * ```
 */
export function listWorktrees(cwd?: string): WorktreeInfo[] {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  try {
    const output = execGitCommand(GIT_COMMANDS.LIST_WORKTREES, { cwd })
    return parseWorktreeList(output)
  } catch (error) {
    // worktreeが存在しない場合は空配列を返す
    return []
  }
}

/**
 * git worktree listの出力をパースしてオブジェクト配列に変換
 *
 * @param output - git worktree list --porcelainの出力
 * @returns パースされたworktree情報配列
 *
 * @example
 * ```typescript
 * const output = "worktree /path/to/repo\nHEAD abc123\nbranch refs/heads/main"
 * const worktrees = parseWorktreeList(output)
 * // 結果: [{ path: '/path/to/repo', head: 'abc123', branch: 'main' }]
 * ```
 */
function parseWorktreeList(output: string): WorktreeInfo[] {
  if (!output.trim()) {
    return []
  }

  const worktrees: WorktreeInfo[] = []
  const lines = output.split("\n")
  let currentWorktree: Partial<WorktreeInfo> = {}

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      // 前のworktreeを保存
      if (currentWorktree.path) {
        worktrees.push(currentWorktree as WorktreeInfo)
      }

      // 新しいworktreeを開始
      currentWorktree = {
        path: line.substring(9).trim(),
        branch: "",
        head: "",
      }
    } else if (line.startsWith("HEAD ")) {
      currentWorktree.head = line.substring(5).trim()
    } else if (line.startsWith("branch ")) {
      const branchRef = line.substring(7).trim()
      currentWorktree.branch = branchRef.replace("refs/heads/", "")
    } else if (line.startsWith("detached")) {
      currentWorktree.branch = "(detached)"
    }
  }

  // 最後のworktreeを保存
  if (currentWorktree.path) {
    worktrees.push(currentWorktree as WorktreeInfo)
  }

  return worktrees
}

/**
 * 新しいworktreeを作成
 *
 * @param branchName - 作成するブランチ名
 * @param worktreePath - worktreeを作成するパス
 * @param options - オプション（cwd: 作業ディレクトリ, useExistingBranch: 既存ブランチを使用）
 * @throws {Error} 作成に失敗した場合
 *
 * @example
 * ```typescript
 * try {
 *   createWorktree('feature/new-ui', '/path/to/worktree')
 *   console.log('Worktree created successfully')
 * } catch (error) {
 *   console.error('Failed to create worktree:', error.message)
 * }
 * ```
 */
export function createWorktree(
  branchName: string,
  worktreePath: string,
  options?: { cwd?: string; useExistingBranch?: boolean }
): void {
  const cwd = options?.cwd
  const useExistingBranch = options?.useExistingBranch ?? false

  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const commandTemplate = useExistingBranch
    ? GIT_COMMANDS.CREATE_WORKTREE_EXISTING
    : GIT_COMMANDS.CREATE_WORKTREE

  const command = commandTemplate.replace("{path}", worktreePath).replace("{branch}", branchName)

  try {
    execGitCommand(command, { cwd })
    console.log(`✅ Created worktree: ${branchName} at ${worktreePath}`)
  } catch (error: any) {
    throw new Error(`Failed to create worktree: ${error.message}`)
  }
}

/**
 * worktreeを削除
 *
 * @param worktreePath - 削除するworktreeのパス
 * @param options - オプション（cwd: 作業ディレクトリ, force: 強制削除）
 * @throws {Error} 削除に失敗した場合
 *
 * @example
 * ```typescript
 * try {
 *   removeWorktree('/path/to/worktree')
 *   console.log('Worktree removed successfully')
 * } catch (error) {
 *   console.error('Failed to remove worktree:', error.message)
 * }
 * ```
 */
export function removeWorktree(
  worktreePath: string,
  options?: { cwd?: string; force?: boolean }
): void {
  const cwd = options?.cwd
  const force = options?.force ?? false

  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const commandTemplate = force
    ? GIT_COMMANDS.REMOVE_WORKTREE_FORCE
    : GIT_COMMANDS.REMOVE_WORKTREE
  const command = commandTemplate.replace("{path}", worktreePath)

  try {
    execGitCommand(command, { cwd })
    console.log(`✅ Removed worktree at: ${worktreePath}`)
  } catch (error: any) {
    throw new Error(`Failed to remove worktree: ${error.message}`)
  }
}

/**
 * 指定されたブランチのworktreeパスを取得
 *
 * @param branchName - 検索するブランチ名
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeのパス（見つからない場合はnull）
 *
 * @example
 * ```typescript
 * const path = getWorktreePath('feature/new-ui')
 * if (path) {
 *   console.log(`Worktree path: ${path}`)
 * } else {
 *   console.log('Worktree not found')
 * }
 * ```
 */
export function getWorktreePath(branchName: string, cwd?: string): string | null {
  const worktrees = listWorktrees(cwd)
  const worktree = worktrees.find((wt) => wt.branch === branchName)
  return worktree ? worktree.path : null
}

/**
 * 指定されたディレクトリがworktreeかどうかを判定
 *
 * @param dirPath - チェックするディレクトリパス
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns worktreeの場合true
 *
 * @example
 * ```typescript
 * if (isWorktree('/path/to/directory')) {
 *   console.log('This is a worktree')
 * } else {
 *   console.log('This is not a worktree')
 * }
 * ```
 */
export function isWorktree(dirPath: string, cwd?: string): boolean {
  try {
    const worktrees = listWorktrees(cwd)
    const absolutePath = path.resolve(dirPath)
    return worktrees.some((wt) => path.resolve(wt.path) === absolutePath)
  } catch {
    return false
  }
}

/**
 * メインリポジトリとworktreeの関係情報を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 関係情報オブジェクト
 *
 * @example
 * ```typescript
 * const info = getWorktreeRelationship()
 * console.log(`Main repo: ${info.mainPath}`)
 * console.log(`Current is worktree: ${info.isCurrentWorktree}`)
 * console.log(`Total worktrees: ${info.totalWorktrees}`)
 * ```
 */
export function getWorktreeRelationship(cwd?: string) {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }

  const root = getGitRoot(cwd)
  const worktrees = listWorktrees(cwd)
  const currentPath = path.resolve(cwd || process.cwd())

  // メインリポジトリのパスを特定（通常は最初のworktree）
  const mainRepo = worktrees.find((wt) => wt.path === root) || worktrees[0]
  const isCurrentWorktree = worktrees.some(
    (wt) => path.resolve(wt.path) === currentPath && wt.path !== root
  )

  return {
    mainPath: mainRepo?.path || root,
    currentPath,
    isCurrentWorktree,
    totalWorktrees: worktrees.length,
    worktrees,
  }
}
