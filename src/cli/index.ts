#!/usr/bin/env node

/**
 * @fileoverview WTurbo CLI メインエントリーポイント
 * コマンドライン引数の解析とコマンド実行を担当
 */

import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Command } from "commander"
import { APP_DESCRIPTION, APP_NAME, APP_VERSION, EXIT_CODES } from "../constants/index.js"
import { createCommand } from "./commands/create.js"
import { removeCommand } from "./commands/remove.js"
import { statusCommand } from "./commands/status.js"

/**
 * メインCLIプログラムを作成・設定
 */
function createMainProgram(): Command {
  const program = new Command()

  program.name(APP_NAME).description(APP_DESCRIPTION).version(APP_VERSION)

  // サブコマンド追加
  program.addCommand(statusCommand())
  program.addCommand(createCommand())
  program.addCommand(removeCommand())

  return program
}

/**
 * エラーハンドリングとプロセス終了の設定
 */
function setupErrorHandling(): void {
  process.on("uncaughtException", (error) => {
    console.error("💥 Uncaught Exception:", error.message)
    process.exit(EXIT_CODES.GENERAL_ERROR)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
    process.exit(EXIT_CODES.GENERAL_ERROR)
  })

  process.on("SIGINT", () => {
    console.log("\n👋 Goodbye!")
    process.exit(EXIT_CODES.SUCCESS)
  })
}

/**
 * CLIアプリケーションのメイン実行関数
 */
function main(): void {
  setupErrorHandling()

  const program = createMainProgram()
  program.parse()
}

// スクリプトとして実行された場合のみmain()を呼び出し
// realpathSync resolves symlinks so npm-linked binaries work correctly
if (realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main()
}

export { createMainProgram, main }
