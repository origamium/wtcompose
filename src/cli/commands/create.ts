/**
 * @fileoverview Create コマンド実装
 * Git worktreeの作成を担当
 */

import * as path from 'node:path'
import { Command } from 'commander'
import { EXIT_CODES } from '../../constants/index.js'

// Core modules
import { isGitRepository, getGitRoot, branchExists } from '../../core/git/repository.js'
import { createWorktree, getWorktreePath, listWorktrees } from '../../core/git/worktree.js'

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
  return new Command('create')
    .description('Create a new git worktree for the specified branch')
    .argument('<branch>', 'Branch name to create worktree for')
    .option('-p, --path <path>', 'Custom path for the worktree')
    .option('--no-create-branch', 'Use existing branch instead of creating new one')
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
    console.error('Error: Not in a git repository')
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
  const sanitizedBranch = branch.replace(/\//g, '-')

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

  // 成功メッセージ
  console.log('')
  console.log('🎉 Worktree created successfully!')
  console.log('')
  console.log('Next steps:')
  console.log(`  cd ${worktreePath}`)
  console.log('  # Start working on your branch')

  // 現在のworktree一覧を表示
  console.log('')
  console.log('📋 Current worktrees:')
  const worktrees = listWorktrees()
  for (const wt of worktrees) {
    const isNew = wt.branch === branch
    console.log(`  ${isNew ? '→' : ' '} ${wt.branch}: ${wt.path}`)
  }
}
