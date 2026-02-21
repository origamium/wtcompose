/**
 * @fileoverview 安全なコマンド実行ユーティリティ
 * shell injectionを防ぐため execFileSync の引数配列形式を使用
 */

import { execFileSync, execSync } from "node:child_process"
import { FILE_ENCODING } from "../constants/index.js"

interface SafeExecOptions {
  cwd?: string
  env?: Record<string, string>
}

/**
 * 安全なコマンド実行（shell injection防止）
 * execFileSync を使用して引数を配列で渡す
 */
export function execSafeSync(file: string, args: string[], options?: SafeExecOptions): string {
  try {
    return execFileSync(file, args, {
      encoding: FILE_ENCODING,
      stdio: "pipe",
      ...(options?.cwd && { cwd: options.cwd }),
      ...(options?.env && { env: { ...process.env, ...options.env } }),
    }).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Command failed: ${file} ${args.join(" ")}\n${message}`)
  }
}

/**
 * Git コマンドを安全に実行
 */
export function execGitSafe(args: string[], options?: SafeExecOptions): string {
  return execSafeSync("git", args, options)
}

/**
 * Docker コマンドを安全に実行
 */
export function execDockerSafe(args: string[], options?: SafeExecOptions): string {
  return execSafeSync("docker", args, options)
}

/**
 * ライフサイクルコマンド（start_command / end_command）を実行
 * ユーザー指定のシェルスクリプトなので shell: "/bin/sh" を使用
 */
export function executeLifecycleCommand(command: string, cwd: string): void {
  execSync(command, {
    cwd,
    stdio: "inherit",
    shell: "/bin/sh",
  })
}
