/**
 * @fileoverview Remove コマンド実装
 * Git worktreeの削除を担当
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
// Core modules
import { getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { getWorktreePath, listWorktrees, removeWorktree } from "../../core/git/worktree.js"

/**
 * removeコマンドを作成
 *
 * @returns Commander.js のCommandオブジェクト
 *
 * @example
 * ```typescript
 * const program = new Command()
 * program.addCommand(removeCommand())
 * ```
 */
export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a git worktree for the specified branch")
    .argument("<branch>", "Branch name of the worktree to remove")
    .option("-f, --force", "Force removal even if worktree has uncommitted changes")
    .action(async (branch: string, options: { force?: boolean }) => {
      try {
        await executeRemoveCommand(branch, options)
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })
}

/**
 * removeコマンドのメイン実行ロジック
 *
 * @param branch - ブランチ名
 * @param options - コマンドオプション
 * @throws {Error} 実行に失敗した場合
 */
async function executeRemoveCommand(branch: string, options: { force?: boolean }): Promise<void> {
  // Git リポジトリチェック
  if (!isGitRepository()) {
    console.error("Error: Not in a git repository")
    process.exit(EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const gitRoot = getGitRoot()

  // worktreeのパスを取得
  const worktreePath = getWorktreePath(branch)
  if (!worktreePath) {
    console.error(`Error: No worktree found for branch '${branch}'`)
    console.log("")
    console.log("Available worktrees:")
    const worktrees = listWorktrees()
    for (const wt of worktrees) {
      console.log(`  ${wt.branch}: ${wt.path}`)
    }
    process.exit(EXIT_CODES.GENERAL_ERROR)
  }

  // メインリポジトリの削除を防止
  if (worktreePath === gitRoot) {
    console.error("Error: Cannot remove the main repository worktree")
    process.exit(EXIT_CODES.GENERAL_ERROR)
  }

  console.log(`🗑️  Removing worktree for branch: ${branch}`)
  console.log(`📂 Worktree path: ${worktreePath}`)

  if (options.force) {
    console.log("⚠️  Force removal enabled")
  }

  // end_commandの実行（worktree削除前）
  const config = loadConfig(gitRoot)
  if (config.end_command) {
    console.log("")
    console.log(`🛑 Running end command: ${config.end_command}`)
    await executeEndCommand(config.end_command, worktreePath)
  }

  // worktreeを削除
  removeWorktree(worktreePath, { force: options.force })

  // 成功メッセージ
  console.log("")
  console.log("🎉 Worktree removed successfully!")

  // 残りのworktree一覧を表示
  console.log("")
  console.log("📋 Remaining worktrees:")
  const worktrees = listWorktrees()
  if (worktrees.length === 0) {
    console.log("  No worktrees found")
  } else {
    for (const wt of worktrees) {
      const isMain = wt.path === gitRoot
      console.log(`  ${wt.branch}${isMain ? " (main)" : ""}: ${wt.path}`)
    }
  }
}

/**
 * end_commandを実行
 *
 * @param command - 実行するコマンド（スクリプトパス）
 * @param worktreePath - worktreeのパス（作業ディレクトリ）
 */
async function executeEndCommand(command: string, worktreePath: string): Promise<void> {
  try {
    // コマンドがスクリプトファイルの場合、worktree内のパスを使用
    const commandPath = path.resolve(worktreePath, command)
    const actualCommand = existsSync(commandPath) ? commandPath : command

    execSync(actualCommand, {
      cwd: worktreePath,
      stdio: "inherit",
      shell: "/bin/sh",
    })
    console.log("  ✅ End command completed successfully")
  } catch (error: any) {
    console.log(`  ⚠️  End command failed: ${error.message}`)
    console.log("  (Continuing with worktree removal)")
  }
}
