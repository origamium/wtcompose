/**
 * @fileoverview Git リポジトリ操作
 * Gitリポジトリの基本的な状態確認と情報取得を担当
 */

import type { ExecOptions } from "../../types/index.js"
import { execGitSafe } from "../../utils/exec.js"

/**
 * 現在のディレクトリがGitリポジトリかどうかを判定
 *
 * @param cwd - チェックするディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns Gitリポジトリの場合true
 */
export function isGitRepository(cwd?: string): boolean {
  try {
    execGitSafe(["rev-parse", "--is-inside-work-tree"], { cwd })
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
 */
export function getGitRoot(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitSafe(["rev-parse", "--show-toplevel"], { cwd })
}

/**
 * 現在のブランチ名を取得
 *
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns 現在のブランチ名
 * @throws {Error} Gitリポジトリではない場合
 */
export function getCurrentBranch(cwd?: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error("Not in a Git repository")
  }
  return execGitSafe(["branch", "--show-current"], { cwd })
}

/**
 * 指定したブランチが存在するかチェック
 *
 * @param branchName - チェックするブランチ名
 * @param cwd - 対象ディレクトリ（デフォルト: 現在のディレクトリ）
 * @returns ブランチが存在する場合true
 */
export function branchExists(branchName: string, cwd?: string): boolean {
  if (!isGitRepository(cwd)) {
    return false
  }

  try {
    execGitSafe(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], { cwd })
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
    const status = execGitSafe(["status", "--porcelain"], { cwd })
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

// ExecOptions is kept for backward compatibility with any callers
export type { ExecOptions }
