/**
 * @fileoverview Create コマンド実装
 * Git worktreeの作成を担当
 */

import { execSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import fs from "fs-extra"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
// Core modules
import { branchExists, getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { createWorktree, getWorktreePath, listWorktrees } from "../../core/git/worktree.js"
import type { WTurboConfig } from "../../types/index.js"

/**
 * createコマンドを作成
 *
 * @returns Commander.js のCommandオブジェクト
 *
 * @example
 * ```typescript
 * const program = new Command()
 * program.addCommand(createCommand())
 * ```
 */
export function createCommand(): Command {
  return new Command("create")
    .description("Create a new git worktree for the specified branch")
    .argument("<branch>", "Branch name to create worktree for")
    .option("-p, --path <path>", "Custom path for the worktree")
    .option("--no-create-branch", "Use existing branch instead of creating new one")
    .action(async (branch: string, options: { path?: string; createBranch?: boolean }) => {
      try {
        await executeCreateCommand(branch, options)
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })
}

/**
 * createコマンドのメイン実行ロジック
 *
 * @param branch - ブランチ名
 * @param options - コマンドオプション
 * @throws {Error} 実行に失敗した場合
 */
async function executeCreateCommand(
  branch: string,
  options: { path?: string; createBranch?: boolean }
): Promise<void> {
  // Git リポジトリチェック
  if (!isGitRepository()) {
    console.error("Error: Not in a git repository")
    process.exit(EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const gitRoot = getGitRoot()

  // 既存のworktreeチェック
  const existingPath = getWorktreePath(branch)
  if (existingPath) {
    console.error(`Error: Worktree for branch '${branch}' already exists at: ${existingPath}`)
    process.exit(EXIT_CODES.GENERAL_ERROR)
  }

  // ブランチ名のサニタイズ（パス用）
  const sanitizedBranch = branch.replace(/\//g, "-")

  // worktreeパスの決定
  const worktreePath = options.path
    ? path.resolve(options.path)
    : path.join(path.dirname(gitRoot), `worktree-${sanitizedBranch}`)

  console.log(`🌿 Creating worktree for branch: ${branch}`)
  console.log(`📂 Worktree path: ${worktreePath}`)

  // ブランチが既に存在するかチェック
  const branchAlreadyExists = branchExists(branch)
  if (branchAlreadyExists) {
    console.log(`ℹ️  Branch '${branch}' already exists, using existing branch`)
  } else {
    console.log(`✨ Creating new branch: ${branch}`)
  }

  // worktreeを作成
  createWorktree(branch, worktreePath)

  // 設定ファイルを読み込み、copy_filesに指定されたファイル/ディレクトリをコピー
  const config = loadConfig(gitRoot)
  if (config.copy_files && config.copy_files.length > 0) {
    console.log("")
    console.log("📋 Copying files/directories...")
    await copyConfiguredFiles(gitRoot, worktreePath, config.copy_files)
  }

  // start_commandの実行
  if (config.start_command) {
    console.log("")
    console.log(`🚀 Running start command: ${config.start_command}`)
    await executeStartCommand(config.start_command, worktreePath, gitRoot)
  }

  // 成功メッセージ
  console.log("")
  console.log("🎉 Worktree created successfully!")
  console.log("")
  console.log("Next steps:")
  console.log(`  cd ${worktreePath}`)
  console.log("  # Start working on your branch")

  // 現在のworktree一覧を表示
  console.log("")
  console.log("📋 Current worktrees:")
  const worktrees = listWorktrees()
  for (const wt of worktrees) {
    const isNew = wt.branch === branch
    console.log(`  ${isNew ? "→" : " "} ${wt.branch}: ${wt.path}`)
  }
}

/**
 * 設定ファイルで指定されたファイル/ディレクトリをworktreeにコピー
 *
 * @param sourceRoot - コピー元のルートディレクトリ（gitルート）
 * @param targetRoot - コピー先のルートディレクトリ（worktreeパス）
 * @param copyFiles - コピーするファイル/ディレクトリのパス一覧
 */
async function copyConfiguredFiles(
  sourceRoot: string,
  targetRoot: string,
  copyFiles: string[]
): Promise<void> {
  for (const relativePath of copyFiles) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      const stat = statSync(sourcePath)

      if (stat.isDirectory()) {
        // ディレクトリの場合は再帰的にコピー
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        console.log(`  ✅ Copied directory: ${relativePath}`)
      } else {
        // ファイルの場合は単純コピー
        // 親ディレクトリが存在しない場合は作成
        await fs.ensureDir(path.dirname(targetPath))
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        console.log(`  ✅ Copied file: ${relativePath}`)
      }
    } catch (error: any) {
      console.log(`  ❌ Failed to copy ${relativePath}: ${error.message}`)
    }
  }
}

/**
 * start_commandを実行
 *
 * @param command - 実行するコマンド（スクリプトパス）
 * @param worktreePath - worktreeのパス（作業ディレクトリ）
 * @param gitRoot - gitルートディレクトリ（コマンドの相対パス解決用）
 */
async function executeStartCommand(
  command: string,
  worktreePath: string,
  gitRoot: string
): Promise<void> {
  try {
    // コマンドがスクリプトファイルの場合、worktree内のパスを使用
    const commandPath = path.resolve(worktreePath, command)
    const actualCommand = existsSync(commandPath) ? commandPath : command

    execSync(actualCommand, {
      cwd: worktreePath,
      stdio: "inherit",
      shell: "/bin/sh",
    })
    console.log("  ✅ Start command completed successfully")
  } catch (error: any) {
    console.log(`  ⚠️  Start command failed: ${error.message}`)
    console.log("  (Worktree was created, but start command had issues)")
  }
}
