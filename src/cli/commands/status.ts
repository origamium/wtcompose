/**
 * @fileoverview Status コマンド実装
 * Git worktreeとDockerの状態表示を担当
 */

// Utils
import { existsSync } from "node:fs"
import * as path from "node:path"
import { Command } from "commander"
import { ENV_FILE_NAMES, EXIT_CODES } from "../../constants/index.js"
import {
  getDockerInfo,
  getDockerVolumes,
  getRunningContainers,
  isWTComposeContainer,
} from "../../core/docker/client.js"
import { findComposeFile, readComposeFile } from "../../core/docker/compose.js"
// Core modules
import { getCurrentBranch, getGitRoot, isGitRepository } from "../../core/git/repository.js"
import { listWorktrees } from "../../core/git/worktree.js"
import type { CommandOptions } from "../../types/index.js"
import { getErrorMessage } from "../../utils/error.js"

/**
 * statusコマンドを作成
 *
 * @returns Commander.js のCommandオブジェクト
 *
 * @example
 * ```typescript
 * const program = new Command()
 * program.addCommand(statusCommand())
 * ```
 */
export function statusCommand(): Command {
  return new Command("status")
    .description("Show status of worktrees and their Docker environments")
    .option("-a, --all", "Show all worktrees, not just current")
    .option("--docker-only", "Show only Docker-related information")
    .action(async (options: CommandOptions) => {
      try {
        await executeStatusCommand(options)
      } catch (error) {
        console.error(`Error: ${getErrorMessage(error)}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })
}

/**
 * statusコマンドのメイン実行ロジック
 *
 * @param options - コマンドオプション
 * @throws {Error} 実行に失敗した場合
 *
 * @example
 * ```typescript
 * await executeStatusCommand({ all: true, dockerOnly: false })
 * ```
 */
async function executeStatusCommand(options: CommandOptions): Promise<void> {
  // Git リポジトリチェック
  if (!isGitRepository()) {
    console.error("Error: Not in a git repository")
    process.exit(EXIT_CODES.NOT_GIT_REPOSITORY)
  }

  // Worktree 状態表示（--docker-only でない場合）
  if (!options.dockerOnly) {
    await showWorktreeStatus(!!options.all)
  }

  // Docker 状態表示
  await showDockerStatus()
}

/**
 * Git worktree の状態を表示
 *
 * @param showAll - 全てのworktreeを表示するか（falseの場合は現在のブランチのみ）
 * @throws {Error} Git操作に失敗した場合
 *
 * @example
 * ```typescript
 * await showWorktreeStatus(true) // 全てのworktreeを表示
 * await showWorktreeStatus(false) // 現在のブランチのみ
 * ```
 */
async function showWorktreeStatus(showAll: boolean): Promise<void> {
  console.log("📁 Git Worktrees Status\n")

  const worktrees = listWorktrees()
  const currentBranch = getCurrentBranch()

  if (worktrees.length === 0) {
    console.log("No worktrees found")
    return
  }

  // フィルタリング: showAll が false の場合は現在のブランチのみ
  const filteredWorktrees = showAll
    ? worktrees
    : worktrees.filter((wt) => wt.branch === currentBranch)

  for (const worktree of filteredWorktrees) {
    const isMain = worktree.path === getGitRoot()
    const isCurrent = worktree.branch === currentBranch

    // ブランチ名表示（現在のブランチは → 付き）
    console.log(`${isCurrent ? "→" : " "} ${worktree.branch}${isMain ? " (main)" : ""}`)
    console.log(`   📂 ${worktree.path}`)

    // Docker Compose ファイルチェック
    await showWorktreeDockerInfo(worktree.path)

    // 環境ファイルチェック
    showWorktreeEnvFiles(worktree.path)

    console.log() // 空行
  }
}

/**
 * worktreeのDocker関連情報を表示
 *
 * @param worktreePath - worktreeのパス
 *
 * @example
 * ```typescript
 * await showWorktreeDockerInfo('/path/to/worktree')
 * ```
 */
async function showWorktreeDockerInfo(worktreePath: string): Promise<void> {
  const composeFilePath = findComposeFile(worktreePath)

  if (composeFilePath) {
    const composeFileName = path.basename(composeFilePath)
    console.log(`   🐳 Docker: ${composeFileName}`)

    try {
      const config = readComposeFile(composeFilePath)
      const serviceCount = Object.keys(config.services || {}).length
      console.log(`   📦 Services: ${serviceCount}`)
    } catch {
      console.log("   ⚠️  Error reading compose file")
    }
  } else {
    console.log("   🐳 Docker: No compose file")
  }
}

/**
 * worktreeの環境ファイル情報を表示
 *
 * @param worktreePath - worktreeのパス
 *
 * @example
 * ```typescript
 * showWorktreeEnvFiles('/path/to/worktree')
 * ```
 */
function showWorktreeEnvFiles(worktreePath: string): void {
  const existingEnvFiles = ENV_FILE_NAMES.filter((fileName) =>
    existsSync(path.join(worktreePath, fileName))
  )

  if (existingEnvFiles.length > 0) {
    console.log(`   🔧 Environment: ${existingEnvFiles.join(", ")}`)
  }
}

/**
 * Docker環境の状態を表示
 *
 * @throws {Error} Docker操作に失敗した場合
 *
 * @example
 * ```typescript
 * await showDockerStatus()
 * ```
 */
async function showDockerStatus(): Promise<void> {
  console.log("🐳 Docker Environment Status\n")

  try {
    // 実行中コンテナ表示
    await showRunningContainers()

    // ボリューム表示
    await showDockerVolumes()

    // Docker情報表示
    await showDockerInfo()
  } catch {
    console.log("⚠️  Docker is not available or not running")
  }
}

/**
 * 実行中のDockerコンテナを表示
 *
 * @example
 * ```typescript
 * await showRunningContainers()
 * ```
 */
async function showRunningContainers(): Promise<void> {
  const containers = getRunningContainers()
  console.log(`📦 Running Containers: ${containers.length}`)

  if (containers.length > 0) {
    console.log()
    containers.forEach((container) => {
      const isWtcompose = isWTComposeContainer(container)

      console.log(`${isWtcompose ? "🌿" : "📦"} ${container.name}`)
      console.log(`   🏷️  Image: ${container.image}`)
      console.log(`   🔗 Status: ${container.status}`)

      if (container.ports.length > 0) {
        console.log(`   🔌 Ports: ${container.ports.join(", ")}`)
      }

      console.log()
    })
  }
}

/**
 * Dockerボリューム情報を表示
 *
 * @example
 * ```typescript
 * await showDockerVolumes()
 * ```
 */
async function showDockerVolumes(): Promise<void> {
  const volumes = getDockerVolumes()
  const wtcomposeVolumes = volumes.filter(
    (v) =>
      v.name.includes("wtcompose") ||
      v.name.match(/.*-.*wtcompose.*/) ||
      v.name.includes("worktree")
  )

  console.log(`🗂️  Total Volumes: ${volumes.length}`)

  if (wtcomposeVolumes.length > 0) {
    console.log(`🌿 WTCompose Volumes: ${wtcomposeVolumes.length}`)
    console.log()

    wtcomposeVolumes.forEach((volume) => {
      console.log(`   📁 ${volume.name}`)
      console.log(`      Driver: ${volume.driver}`)
    })
    console.log()
  }
}

/**
 * Docker システム情報を表示
 *
 * @example
 * ```typescript
 * await showDockerInfo()
 * ```
 */
async function showDockerInfo(): Promise<void> {
  try {
    const info = getDockerInfo()

    console.log("🔧 Docker Information")
    console.log(`   ${info.dockerVersion}`)
    console.log(`   Docker Compose: ${info.composeVersion}`)
  } catch {
    console.log("⚠️  Could not retrieve Docker version information")
  }
}
