/**
 * @fileoverview Create コマンド実装
 * Git worktreeの作成を担当
 */

import { existsSync, lstatSync, readlinkSync, statSync, symlinkSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import fs from "fs-extra"
import { EXIT_CODES } from "../../constants/index.js"
import { loadConfig } from "../../core/config/loader.js"
import { getUsedPorts } from "../../core/docker/client.js"
import {
  adjustPortsInCompose,
  readComposeFile,
  writeComposeFile,
} from "../../core/docker/compose.js"
import { copyAndAdjustEnvFile } from "../../core/environment/processor.js"
import { branchExists, getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { createWorktree, getWorktreePath, listWorktrees } from "../../core/git/worktree.js"
import type { WTurboConfig } from "../../types/index.js"
import { CLIError, getErrorMessage } from "../../utils/error.js"
import { executeLifecycleCommand } from "../../utils/exec.js"

/**
 * createコマンドを作成
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
        if (error instanceof CLIError) {
          console.error(`Error: ${error.message}`)
          process.exit(error.exitCode)
        }
        console.error(`Error: ${getErrorMessage(error)}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })
}

/**
 * createコマンドのメイン実行ロジック
 */
async function executeCreateCommand(
  branch: string,
  options: { path?: string; createBranch?: boolean }
): Promise<void> {
  // Git リポジトリチェック
  if (!isGitRepository()) {
    throw new CLIError("Not in a git repository", EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  const gitRoot = getGitRoot()

  // 既存のworktreeチェック
  const existingPath = getWorktreePath(branch)
  if (existingPath) {
    throw new CLIError(
      `Worktree for branch '${branch}' already exists at: ${existingPath}`,
      EXIT_CODES.GENERAL_ERROR
    )
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
    throw new CLIError(
      `Branch '${branch}' does not exist. Remove --no-create-branch to create it.`,
      EXIT_CODES.GENERAL_ERROR
    )
  }

  const useExistingBranch = branchAlreadyExists || options.createBranch === false
  if (useExistingBranch) {
    console.log(`ℹ️  Branch '${branch}' already exists, using existing branch`)
  } else {
    console.log(`✨ Creating new branch: ${branch}`)
  }

  // 設定ファイルを先に読み込み（base_branch を worktree 作成前に取得するため）
  const config = loadConfig(gitRoot)

  // worktreeを作成（新規ブランチの場合は base_branch を使用）
  createWorktree(branch, worktreePath, {
    useExistingBranch,
    baseBranch: useExistingBranch ? undefined : config.base_branch,
  })

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

  // env.file の処理
  // adjust あり → 調整コピー、なし → 通常コピー（どちらも env.file が空でない場合のみ）
  if (config.env.file.length > 0) {
    console.log("")
    if (Object.keys(config.env.adjust).length > 0) {
      console.log("🔧 Adjusting environment files...")
      await applyEnvAdjustments(gitRoot, worktreePath, config)
    } else {
      console.log("📋 Copying environment files...")
      await copyConfiguredFiles(gitRoot, worktreePath, config.env.file)
    }
  }

  // Docker Compose のセットアップ（compose ファイルのコピー + ポート調整）
  await setupDockerCompose(gitRoot, worktreePath, config)

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
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        console.log(`  ✅ Copied directory: ${relativePath}`)
      } else {
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
      await fs.ensureDir(path.dirname(targetPath))

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
 */
async function executeStartCommand(command: string, worktreePath: string): Promise<void> {
  try {
    const commandPath = path.resolve(worktreePath, command)
    const actualCommand = existsSync(commandPath) ? commandPath : command

    executeLifecycleCommand(actualCommand, worktreePath)
    console.log("  ✅ Start command completed successfully")
  } catch (error) {
    console.log(`  ⚠️  Start command failed: ${getErrorMessage(error)}`)
    console.log("  (Worktree was created, but start command had issues)")
  }
}

/**
 * Docker Compose ファイルをworktreeにコピーし、ポートを調整する
 * Docker が利用できない場合は無調整でコピーする
 */
async function setupDockerCompose(
  gitRoot: string,
  worktreePath: string,
  config: WTurboConfig
): Promise<void> {
  if (!config.docker_compose_file) return

  const sourceComposePath = path.resolve(gitRoot, config.docker_compose_file)
  if (!existsSync(sourceComposePath)) return

  const targetComposePath = path.resolve(worktreePath, config.docker_compose_file)

  // ターゲットに既にファイルが存在する場合はスキップ（start_command 等でコピー済みの場合）
  if (existsSync(targetComposePath)) return

  try {
    console.log("")
    console.log("🐳 Configuring Docker Compose...")

    const composeConfig = readComposeFile(sourceComposePath)

    // 実行中のコンテナのポートを取得してポート衝突を避ける
    // Docker が利用できない場合は空配列になる（エラーは無視）
    let usedPorts: number[] = []
    try {
      usedPorts = getUsedPorts()
    } catch {
      // Docker が利用できない場合はポート調整なし
    }

    const adjustedConfig = adjustPortsInCompose(composeConfig, usedPorts)
    await fs.ensureDir(path.dirname(targetComposePath))
    writeComposeFile(targetComposePath, adjustedConfig)
    console.log(`  ✅ Docker Compose file configured: ${config.docker_compose_file}`)

    // start_command がない場合は使い方を提案
    if (!config.start_command) {
      console.log("  ℹ️  Tip: Run 'docker compose up -d' in the worktree to start services")
    }
  } catch (error) {
    console.log(`  ⚠️  Docker Compose setup skipped: ${getErrorMessage(error)}`)
  }
}

/**
 * env.fileに記載された環境変数ファイルをworktreeにコピーしenv.adjustを適用
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
