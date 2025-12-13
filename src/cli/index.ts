#!/usr/bin/env node

/**
 * @fileoverview WTurbo CLI メインエントリーポイント
 * コマンドライン引数の解析とコマンド実行を担当
 */

import { Command } from 'commander'
import { APP_NAME, APP_VERSION, APP_DESCRIPTION, EXIT_CODES } from '../constants/index.js'
import { statusCommand } from './commands/status.js'
import { createCommand } from './commands/create.js'
import { removeCommand } from './commands/remove.js'

/**
 * メインCLIプログラムを作成・設定
 * 
 * @returns 設定済みのCommanderプログラム
 * 
 * @example
 * ```typescript
 * const program = createMainProgram()
 * program.parse()
 * ```
 */
function createMainProgram(): Command {
  const program = new Command()

  program
    .name(APP_NAME)
    .description(APP_DESCRIPTION)
    .version(APP_VERSION)

  // メインコマンド（ブランチ指定での worktree 操作）
  program
    .option('-b, --branch <name>', 'Create worktree for branch')
    .option('--build', 'Run docker-compose up with --build flag')
    .option('--remove', 'Remove worktree and Docker environment')
    .action(async (options) => {
      if (!options.branch) {
        program.help()
        return
      }

      try {
        await executeMainCommand(options)
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(EXIT_CODES.GENERAL_ERROR)
      }
    })

  // サブコマンド追加
  program.addCommand(statusCommand())
  program.addCommand(createCommand())
  program.addCommand(removeCommand())

  // 互換性保持のためのレガシーコマンド
  addLegacyCommands(program)

  return program
}

/**
 * メインコマンドの実行ロジック
 * 
 * @param options - コマンドオプション
 * @throws {Error} 実行に失敗した場合
 * 
 * @example
 * ```typescript
 * await executeMainCommand({ branch: 'feature/new-ui', build: true })
 * ```
 */
async function executeMainCommand(options: any): Promise<void> {
  const { branch, build, remove } = options

  if (remove) {
    console.log(`🗑️  Remove functionality will be implemented for branch: ${branch}`)
    console.log('This feature is coming soon!')
    console.log('')
    console.log('📋 Planned functionality:')
    console.log('  • Remove git worktree')
    console.log('  • Stop and remove Docker containers')
    console.log('  • Clean up Docker volumes and networks')
    console.log('  • Remove environment files')
  } else {
    console.log(`🚀 Create functionality will be implemented for branch: ${branch}${build ? ' with build' : ''}`)
    console.log('This feature is coming soon!')
    console.log('')
    console.log('📋 Planned functionality:')
    console.log('  • Create git worktree for specified branch')
    console.log('  • Copy and adjust Docker Compose configuration')
    console.log('  • Copy existing containers and volumes for fast setup')
    console.log('  • Automatically adjust ports and environment variables')
    console.log('  • Start Docker Compose services')
    if (build) {
      console.log('  • Build containers from scratch (--build flag)')
    }
  }
}

/**
 * レガシーコマンドを追加（後方互換性のため）
 * 
 * @param program - Commanderプログラム
 * 
 * @example
 * ```typescript
 * addLegacyCommands(program)
 * ```
 */
function addLegacyCommands(program: Command): void {
  // Hello コマンド（デモ用）
  program
    .command('hello')
    .description('Say hello')
    .option('-n, --name <name>', 'name to greet', 'World')
    .action((options) => {
      console.log(`Hello, ${options.name}!`)
    })

  // Info コマンド（詳細情報表示）
  program
    .command('info')
    .description('Show information about the CLI')
    .action(() => {
      showDetailedInfo()
    })
}

/**
 * 詳細なアプリケーション情報を表示
 * 
 * @example
 * ```typescript
 * showDetailedInfo()
 * ```
 */
function showDetailedInfo(): void {
  console.log(`${APP_NAME.toUpperCase()} - ${APP_DESCRIPTION}`)
  console.log('')
  console.log('🎯 This tool helps you create isolated development environments by:')
  console.log('   • Creating git worktrees for different branches')
  console.log('   • Copying and adjusting Docker Compose configurations')
  console.log('   • Copying existing containers, volumes, and networks for fast setup')
  console.log('   • Automatically adjusting ports and environment variables')
  console.log('   • Managing container and volume lifecycles')
  console.log('')
  console.log('📖 Usage:')
  console.log(`   ${APP_NAME} -b <branch>          Create worktree with Docker environment`)
  console.log(`   ${APP_NAME} -b <branch> --build  Create worktree and build containers`)
  console.log(`   ${APP_NAME} -b <branch> --remove Remove worktree and Docker environment`)
  console.log(`   ${APP_NAME} status               Show current worktree and Docker status`)
  console.log(`   ${APP_NAME} status --all         Show all worktrees`)
  console.log('')
  console.log('⚙️  Configuration:')
  console.log('   • Create wturbo.yaml in project root')
  console.log('   • Configure environment variable adjustments')
  console.log('   • Set Docker Compose file path')
  console.log('')
  console.log('🔧 Tech stack:')
  console.log('   • TypeScript for type safety')
  console.log('   • Commander.js for CLI framework')
  console.log('   • Git worktree for branch isolation')
  console.log('   • Biome for linting and formatting')
  console.log('   • Docker & Docker Compose for containerization')
  console.log('')
  console.log(`📦 Version: ${APP_VERSION}`)
}

/**
 * エラーハンドリングとプロセス終了の設定
 * 
 * @example
 * ```typescript
 * setupErrorHandling()
 * ```
 */
function setupErrorHandling(): void {
  // 未処理の例外をキャッチ
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message)
    process.exit(EXIT_CODES.GENERAL_ERROR)
  })

  // 未処理のPromise拒否をキャッチ
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
    process.exit(EXIT_CODES.GENERAL_ERROR)
  })

  // SIGINT（Ctrl+C）のハンドリング
  process.on('SIGINT', () => {
    console.log('\n👋 Goodbye!')
    process.exit(EXIT_CODES.SUCCESS)
  })
}

/**
 * CLIアプリケーションのメイン実行関数
 * 
 * @example
 * ```typescript
 * main()
 * ```
 */
function main(): void {
  setupErrorHandling()
  
  const program = createMainProgram()
  program.parse()
}

// スクリプトとして実行された場合のみmain()を呼び出し
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { createMainProgram, main }