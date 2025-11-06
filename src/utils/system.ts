/**
 * @fileoverview システム操作ユーティリティ
 * シェルコマンド実行とシステム情報取得を担当
 */

import { execSync } from 'node:child_process'
import type { ExecOptions } from '../types/index.js'
import { FILE_ENCODING } from '../constants/index.js'

/**
 * シェルコマンドを実行
 * 
 * @param command - 実行するコマンド
 * @param options - 実行オプション
 * @returns コマンドの出力結果（改行は除去される）
 * @throws {Error} コマンドの実行に失敗した場合
 * 
 * @example
 * ```typescript
 * try {
 *   const output = execCommand('ls -la')
 *   console.log(output)
 * } catch (error) {
 *   console.error('Command failed:', error.message)
 * }
 * ```
 */
export function execCommand(command: string, options?: ExecOptions): string {
  try {
    const execOptions = {
      encoding: FILE_ENCODING as const,
      stdio: 'pipe' as const,
      ...(options?.cwd && { cwd: options.cwd }),
      ...(options?.env && { env: { ...process.env, ...options.env } }),
      ...(options?.timeout && { timeout: options.timeout })
    }
    
    return execSync(command, execOptions).trim()
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`)
  }
}