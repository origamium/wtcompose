/**
 * @fileoverview Create コマンド実装
 * Git worktreeの作成を担当
 */

import { execSync } from "node:child_process"
import { existsSync, lstatSync, readlinkSync, statSync, symlinkSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import fs from "fs-extra"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
// Core modules
import { branchExists, getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { createWorktree, getWorktreePath, listWorktrees } from "../../core/git/worktree.js"
import { copyAndAdjustEnvFile } from "../../core/environment/processor.js"
import type { WTurboConfig } from "../../types/index.js"
import { getErrorMessage } from "../../utils/error.js"

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
      } catch (error) {
        console.error(`Error: ${getErrorMessage(error)}`)
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

  // --no-create-branch が指定されたのに対象ブランチが存在しない場合はエラー
  if (options.createBranch === false && !branchAlreadyExists) {
    console.error(
      `Error: Branch '${branch}' does not exist. Remove --no-create-branch to create it.`
    )
    process.exit(EXIT_CODES.GENERAL_ERROR)
  }

  const useExistingBranch = branchAlreadyExists || options.createBranch === false
  if (useExistingBranch) {
    console.log(`ℹ️  Branch '${branch}' already exists, using existing branch`)
  } else {
    console.log(`✨ Creating new branch: ${branch}`)
  }

  // worktreeを作成（既存ブランチの場合は useExistingBranch オプションを使用）
  createWorktree(branch, worktreePath, { useExistingBranch })

  // 設定ファイルを読み込み、copy_files / link_files を処理
  const config = loadConfig(gitRoot)

  // link_files に含まれるパスはコピーをスキップしてシンボリックリンクを優先する
  const linkFileSet = new Set(config.link_files ?? [])

  const filesToCopy = (config.copy_files ?? []).filter((p) => !linkFileSet.has(p))
  if (filesToCopy.length > 0) {
    console.log("")
    console.log("📋 Copying files/directories...")
    await copyConfiguredFiles(gitRoot, worktreePath, filesToCopy)
  }

  if (config.link_files && config.link_files.length > 0) {
    console.log("")
    console.log("🔗 Creating symlinks...")
    await linkConfiguredFiles(gitRoot, worktreePath, config.link_files)
  }

  // env.adjustの適用（env.fileに記載されたファイルにenv.adjustを適用してworktreeにコピー）
  if (config.env.file.length > 0 && Object.keys(config.env.adjust).length > 0) {
    console.log("")
    console.log("🔧 Adjusting environment files...")
    await applyEnvAdjustments(gitRoot, worktreePath, config)
  }

  // start_commandの実行
  if (config.start_command) {
    console.log("")
    console.log(`🚀 Running start command: ${config.start_command}`)
    await executeStartCommand(config.start_command, worktreePath)
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
    } catch (error) {
      console.log(`  ❌ Failed to copy ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}

/**
 * 設定ファイルで指定されたファイル/ディレクトリをworktreeにシンボリックリンクで張る
 *
 * @param sourceRoot - リンク元のルートディレクトリ（gitルート）
 * @param targetRoot - リンク先のルートディレクトリ（worktreeパス）
 * @param linkFiles - シンボリックリンクを張るファイル/ディレクトリのパス一覧
 */
async function linkConfiguredFiles(
  sourceRoot: string,
  targetRoot: string,
  linkFiles: string[]
): Promise<void> {
  for (const relativePath of linkFiles) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      // 親ディレクトリを確保
      await fs.ensureDir(path.dirname(targetPath))

      // ターゲットが既に存在するか確認（シンボリックリンクも含む lstatSync を使用）
      let targetExists = false
      try {
        lstatSync(targetPath)
        targetExists = true
      } catch {
        targetExists = false
      }

      if (targetExists) {
        let targetStat: ReturnType<typeof lstatSync>
        try {
          targetStat = lstatSync(targetPath)
        } catch {
          console.log(`  ❌ Failed to stat target ${relativePath}: cannot read target`)
          continue
        }

        if (targetStat.isSymbolicLink()) {
          const currentLink = readlinkSync(targetPath)
          if (currentLink === sourcePath) {
            console.log(`  ✅ Symlink already correct: ${relativePath}`)
            continue
          }
          // 既存シンボリックリンクが別のターゲットを指している → 置換
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing symlink (was → ${currentLink}): ${relativePath}`)
        } else if (targetStat.isDirectory()) {
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing existing directory with symlink: ${relativePath}`)
        } else {
          await fs.remove(targetPath)
          console.log(`  🔄 Replacing existing file with symlink: ${relativePath}`)
        }
      }

      symlinkSync(sourcePath, targetPath)
      console.log(`  ✅ Symlinked: ${relativePath} → ${sourcePath}`)
    } catch (error) {
      console.log(`  ❌ Failed to symlink ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}

/**
 * start_commandを実行
 *
 * @param command - 実行するコマンド（スクリプトパス）
 * @param worktreePath - worktreeのパス（作業ディレクトリ）
 */
async function executeStartCommand(command: string, worktreePath: string): Promise<void> {
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
  } catch (error) {
    console.log(`  ⚠️  Start command failed: ${getErrorMessage(error)}`)
    console.log("  (Worktree was created, but start command had issues)")
  }
}

/**
 * env.fileに記載された環境変数ファイルをworktreeにコピーしenv.adjustを適用
 *
 * @param sourceRoot - コピー元ルートディレクトリ（gitルート）
 * @param targetRoot - コピー先ルートディレクトリ（worktreeパス）
 * @param config - WTurbo設定オブジェクト
 */
async function applyEnvAdjustments(
  sourceRoot: string,
  targetRoot: string,
  config: WTurboConfig
): Promise<void> {
  for (const relativePath of config.env.file) {
    const sourcePath = path.resolve(sourceRoot, relativePath)
    const targetPath = path.resolve(targetRoot, relativePath)

    if (!existsSync(sourcePath)) {
      console.log(`  ⚠️  Skip (not found): ${relativePath}`)
      continue
    }

    try {
      await fs.ensureDir(path.dirname(targetPath))
      const adjustedCount = copyAndAdjustEnvFile(sourcePath, targetPath, config.env.adjust)
      console.log(`  ✅ Applied ${adjustedCount} adjustment(s): ${relativePath}`)
    } catch (error) {
      console.log(`  ❌ Failed to adjust ${relativePath}: ${getErrorMessage(error)}`)
    }
  }
}
