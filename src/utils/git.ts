export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

export function isGitRepository(): boolean {
  // Minimal implementation - always return true for now
  return true
}

export function getGitRoot(): string {
  // Minimal implementation - return current directory
  return process.cwd()
}

export function getCurrentBranch(): string {
  // Minimal implementation - return main
  return "main"
}

export function branchExists(branchName: string): boolean {
  // Minimal implementation - always return false for new branches
  return false
}

export function createWorktree(branchName: string, worktreePath: string): void {
  console.log(`Would create worktree: ${branchName} at ${worktreePath}`)
  // Minimal implementation - just log what would happen
}

export function removeWorktree(worktreePath: string): void {
  console.log(`Would remove worktree at: ${worktreePath}`)
  // Minimal implementation - just log what would happen
}

export function listWorktrees(): WorktreeInfo[] {
  // Minimal implementation - return empty array
  return []
}

export function getWorktreePath(branchName: string): string | null {
  // Minimal implementation - return null
  return null
}

export function isWorktree(dirPath: string): boolean {
  // Minimal implementation - return false
  return false
}