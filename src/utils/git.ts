import simpleGit, { SimpleGit } from "simple-git"
import * as path from "node:path"
import * as fs from "fs-extra"

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

/**
 * Get simple-git instance for the given directory
 */
function getGit(dir: string = process.cwd()): SimpleGit {
  return simpleGit(dir)
}

/**
 * Check if current directory is a git repository (async)
 */
export async function isGitRepositoryAsync(dir: string = process.cwd()): Promise<boolean> {
  try {
    const git = getGit(dir)
    await git.status()
    return true
  } catch (_error) {
    return false
  }
}

/**
 * Check if current directory is a git repository (sync)
 */
export function isGitRepository(dir: string = process.cwd()): boolean {
  try {
    // Use a simple sync check by looking for .git directory
    const gitDir = path.join(dir, ".git")
    return fs.existsSync(gitDir)
  } catch (_error) {
    return false
  }
}

/**
 * Get git root directory (async)
 */
export async function getGitRootAsync(dir: string = process.cwd()): Promise<string> {
  try {
    const git = getGit(dir)
    const result = await git.revparse(["--show-toplevel"])
    return result.trim()
  } catch (_error) {
    throw new Error("Not in a git repository")
  }
}

/**
 * Get git root directory (sync)
 */
export function getGitRoot(dir: string = process.cwd()): string {
  try {
    // Walk up the directory tree to find .git
    let currentDir = path.resolve(dir)
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        return currentDir
      }
      currentDir = path.dirname(currentDir)
    }
    throw new Error("Not in a git repository")
  } catch (_error) {
    throw new Error("Not in a git repository")
  }
}

/**
 * Get current git branch (async)
 */
export async function getCurrentBranchAsync(dir: string = process.cwd()): Promise<string> {
  try {
    const git = getGit(dir)
    const status = await git.status()
    return status.current || "HEAD"
  } catch (_error) {
    throw new Error("Unable to get current branch")
  }
}

/**
 * Get current git branch (sync)
 */
export function getCurrentBranch(dir: string = process.cwd()): string {
  try {
    const git = getGit(dir)
    const gitDir = path.join(getGitRoot(dir), ".git")
    const headFile = path.join(gitDir, "HEAD")
    
    if (fs.existsSync(headFile)) {
      const content = fs.readFileSync(headFile, "utf-8").trim()
      if (content.startsWith("ref: refs/heads/")) {
        return content.substring("ref: refs/heads/".length)
      }
    }
    return "HEAD"
  } catch (_error) {
    throw new Error("Unable to get current branch")
  }
}

/**
 * Check if branch exists (async)
 */
export async function branchExistsAsync(branchName: string, dir: string = process.cwd()): Promise<boolean> {
  try {
    const git = getGit(dir)
    const branches = await git.branch(["-a"])
    return branches.all.some(branch => 
      branch === branchName || 
      branch === `remotes/origin/${branchName}` ||
      branch.endsWith(`/${branchName}`)
    )
  } catch (_error) {
    return false
  }
}

/**
 * Check if branch exists (sync)
 */
export function branchExists(branchName: string, dir: string = process.cwd()): boolean {
  try {
    const gitRoot = getGitRoot(dir)
    const branchFile = path.join(gitRoot, ".git", "refs", "heads", branchName)
    return fs.existsSync(branchFile)
  } catch (_error) {
    return false
  }
}

/**
 * Create a new git worktree (async)
 */
export async function createWorktreeAsync(
  branchName: string,
  worktreePath: string,
  dir: string = process.cwd()
): Promise<void> {
  try {
    const git = getGit(dir)
    
    // Check if branch exists, if not create it
    if (!(await branchExistsAsync(branchName, dir))) {
      await git.checkoutLocalBranch(branchName)
      await git.checkout("-") // Go back to previous branch
    }
    
    // Add worktree
    await git.raw(["worktree", "add", worktreePath, branchName])
  } catch (error: any) {
    throw new Error(`Failed to create worktree: ${error.message}`)
  }
}

/**
 * Create a new git worktree (sync)
 */
export function createWorktree(
  branchName: string,
  worktreePath: string,
  dir: string = process.cwd()
): void {
  try {
    const git = getGit(dir)
    
    if (!branchExists(branchName, dir)) {
      // Create branch first using simple-git sync methods
      git.checkoutLocalBranch(branchName)
      git.checkout("-") // Go back to previous branch
    }
    
    // Add worktree
    git.raw(["worktree", "add", worktreePath, branchName])
  } catch (error: any) {
    throw new Error(`Failed to create worktree: ${error.message}`)
  }
}

/**
 * Remove a git worktree (async)
 */
export async function removeWorktreeAsync(worktreePath: string, dir: string = process.cwd()): Promise<void> {
  try {
    const git = getGit(dir)
    await git.raw(["worktree", "remove", worktreePath])
  } catch (error: any) {
    throw new Error(`Failed to remove worktree: ${error.message}`)
  }
}

/**
 * Remove a git worktree (sync)
 */
export function removeWorktree(worktreePath: string, dir: string = process.cwd()): void {
  try {
    const git = getGit(dir)
    git.raw(["worktree", "remove", worktreePath])
  } catch (error: any) {
    throw new Error(`Failed to remove worktree: ${error.message}`)
  }
}

/**
 * List all git worktrees (async)
 */
export async function listWorktreesAsync(dir: string = process.cwd()): Promise<WorktreeInfo[]> {
  try {
    const git = getGit(dir)
    const output = await git.raw(["worktree", "list", "--porcelain"])
    return parseWorktreeOutput(output)
  } catch (_error) {
    return []
  }
}

/**
 * List all git worktrees (sync)
 */
export function listWorktrees(dir: string = process.cwd()): WorktreeInfo[] {
  try {
    const git = getGit(dir)
    const output = git.raw(["worktree", "list", "--porcelain"])
    return parseWorktreeOutput(output)
  } catch (_error) {
    return []
  }
}

/**
 * Parse worktree list output
 */
function parseWorktreeOutput(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  const entries = output.split("

").filter((entry) => entry.trim())

  entries.forEach((entry) => {
    const lines = entry.split("
")
    const worktree: Partial<WorktreeInfo> = {}

    lines.forEach((line) => {
      if (line.startsWith("worktree ")) {
        worktree.path = line.substring(9)
      } else if (line.startsWith("branch ")) {
        worktree.branch = line.substring(7)
      } else if (line.startsWith("HEAD ")) {
        worktree.head = line.substring(5)
      }
    })

    if (worktree.path) {
      worktrees.push({
        path: worktree.path,
        branch: worktree.branch || "detached",
        head: worktree.head || "unknown",
      })
    }
  })

  return worktrees
}

/**
 * Get worktree path for a branch (async)
 */
export async function getWorktreePathAsync(branchName: string, dir: string = process.cwd()): Promise<string | null> {
  const worktrees = await listWorktreesAsync(dir)
  const worktree = worktrees.find((w) => w.branch === branchName)
  return worktree ? worktree.path : null
}

/**
 * Get worktree path for a branch (sync)
 */
export function getWorktreePath(branchName: string, dir: string = process.cwd()): string | null {
  const worktrees = listWorktrees(dir)
  const worktree = worktrees.find((w) => w.branch === branchName)
  return worktree ? worktree.path : null
}

/**
 * Check if path is a worktree
 */
export function isWorktree(dirPath: string): boolean {
  try {
    const gitDir = path.join(dirPath, ".git")
    if (fs.existsSync(gitDir)) {
      const content = fs.readFileSync(gitDir, "utf-8").trim()
      return content.startsWith("gitdir: ")
    }
    return false
  } catch (_error) {
    return false
  }
}
    return false
  } catch (_error) {
    return false
  }
}
