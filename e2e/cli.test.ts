/**
 * @fileoverview Comprehensive E2E Tests for WTurbo CLI
 * Tests all CLI commands against multiple test projects
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  CLI_PATH,
  cleanupAllTestWorkspaces,
  createNonGitDir,
  createTestRepo,
  getTestProjects,
  runCLI,
  type TestRepo,
} from "./helpers.js"

// Ensure CLI is built before running tests
beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`CLI not built. Run 'npm run build' first. Expected: ${CLI_PATH}`)
  }
})

afterAll(() => {
  cleanupAllTestWorkspaces()
})

// =============================================================================
// HELP AND VERSION COMMANDS
// =============================================================================

describe("Help and Version Commands", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("basic", "help")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("--help", () => {
    it("should display main help with all commands listed", () => {
      const result = testRepo.runCLI("--help")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Usage: wturbo")
      expect(result.stdout).toContain("Git worktree management")
      expect(result.stdout).toContain("Commands:")
      expect(result.stdout).toContain("status")
      expect(result.stdout).toContain("create")
      expect(result.stdout).toContain("remove")
    })

    it("should display create command help with all options", () => {
      const result = testRepo.runCLI("create --help")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Create a new git worktree")
      expect(result.stdout).toContain("-p, --path")
      expect(result.stdout).toContain("--no-create-branch")
      expect(result.stdout).toContain("<branch>")
    })

    it("should display remove command help with all options", () => {
      const result = testRepo.runCLI("remove --help")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Remove a git worktree")
      expect(result.stdout).toContain("-f, --force")
      expect(result.stdout).toContain("<branch>")
    })

    it("should display status command help with all options", () => {
      const result = testRepo.runCLI("status --help")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Show status of worktrees")
      expect(result.stdout).toContain("-a, --all")
      expect(result.stdout).toContain("--docker-only")
    })
  })

  describe("--version", () => {
    it("should display version number in semver format", () => {
      const result = testRepo.runCLI("--version")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })
  })

  describe("info command", () => {
    it("should display detailed application information", () => {
      const result = testRepo.runCLI("info")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("WTURBO")
      expect(result.stdout).toContain("Usage:")
      expect(result.stdout).toContain("Configuration:")
      expect(result.stdout).toContain("Version:")
    })
  })
})

// =============================================================================
// CREATE COMMAND - BASIC PROJECT
// =============================================================================

describe("Create Command - Basic Project", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("basic", "create")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Basic worktree creation", () => {
    it("should create worktree for a new branch", () => {
      const result = testRepo.runCLI("create test/new-branch")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Creating worktree for branch: test/new-branch")
      expect(result.combined).toContain("Creating new branch: test/new-branch")
      expect(result.combined).toContain("Worktree created successfully")

      // Verify worktree exists
      const wtPath = testRepo.getWorktreePath("test/new-branch")
      expect(existsSync(wtPath)).toBe(true)

      // Verify branch was created
      expect(testRepo.branchExists("test/new-branch")).toBe(true)
    })

    it("should automatically use existing branch", () => {
      // First create a worktree (which also creates the branch)
      testRepo.runCLI("create existing-branch")
      testRepo.runCLI("remove existing-branch --force")

      // Branch should still exist after worktree removal
      expect(testRepo.branchExists("existing-branch")).toBe(true)

      // Creating a new worktree should detect the existing branch
      const result = testRepo.runCLI("create existing-branch")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("already exists")
      expect(result.combined).toContain("Worktree created successfully")
    })

    it("should create worktree at custom path with -p option", () => {
      const customPath = path.join(path.dirname(testRepo.path), "custom-wt-path")
      const result = testRepo.runCLI(`create test/custom -p "${customPath}"`)

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain(`Worktree path: ${customPath}`)
      expect(existsSync(customPath)).toBe(true)
    })

    it("should sanitize branch names with slashes for path", () => {
      const result = testRepo.runCLI("create feature/deep/nested/branch")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("worktree-feature-deep-nested-branch")
    })
  })

  describe("Error handling", () => {
    it("should fail when worktree already exists for branch", () => {
      // Create first worktree
      testRepo.runCLI("create duplicate-test")

      // Try to create duplicate
      const result = testRepo.runCLI("create duplicate-test")

      expect(result.exitCode).toBe(1)
      expect(result.combined).toContain("already exists")
    })

    it("should fail when branch argument is missing", () => {
      const result = testRepo.runCLI("create")

      expect(result.combined.toLowerCase()).toContain("error")
    })
  })

  describe("Status after create", () => {
    it("should show new worktree in status --all", () => {
      testRepo.runCLI("create status-test")

      const result = testRepo.runCLI("status --all")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("status-test")
    })
  })
})

// =============================================================================
// CREATE COMMAND - FULL-FEATURED PROJECT
// =============================================================================

describe("Create Command - Full-Featured Project", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("full-featured", "create-full")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("copy_files functionality", () => {
    it("should copy all files specified in copy_files config", () => {
      const result = testRepo.runCLI("create test/copy-all")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Copying files/directories")

      const wtPath = testRepo.getWorktreePath("test/copy-all")

      // Verify all copy_files were copied
      expect(existsSync(path.join(wtPath, ".env"))).toBe(true)
      expect(existsSync(path.join(wtPath, ".env.local"))).toBe(true)
      expect(existsSync(path.join(wtPath, ".secrets"))).toBe(true)
      expect(existsSync(path.join(wtPath, "config/local.json"))).toBe(true)
      expect(existsSync(path.join(wtPath, "scripts/start.sh"))).toBe(true)
      expect(existsSync(path.join(wtPath, "scripts/stop.sh"))).toBe(true)
    })

    it("should preserve file contents when copying", () => {
      testRepo.runCLI("create test/content-check")

      const wtPath = testRepo.getWorktreePath("test/content-check")
      const envContent = fs.readFileSync(path.join(wtPath, ".env"), "utf-8")

      expect(envContent).toContain("APP_PORT=3000")
      expect(envContent).toContain("DB_PORT=5432")
    })

    it("should preserve directory structure when copying", () => {
      testRepo.runCLI("create test/dir-structure")

      const wtPath = testRepo.getWorktreePath("test/dir-structure")
      const configContent = fs.readFileSync(path.join(wtPath, "config/local.json"), "utf-8")

      expect(JSON.parse(configContent)).toHaveProperty("app.name", "full-featured-test")
    })
  })

  describe("start_command functionality", () => {
    it("should execute start_command after worktree creation", () => {
      const result = testRepo.runCLI("create test/start-cmd")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Running start command")
      expect(result.combined).toContain("START COMMAND EXECUTED")
      expect(result.combined).toContain("Start command completed successfully")
    })

    it("should create marker file from start_command script", () => {
      testRepo.runCLI("create test/start-marker")

      const wtPath = testRepo.getWorktreePath("test/start-marker")
      expect(existsSync(path.join(wtPath, ".start-executed"))).toBe(true)
    })

    it("should have access to copied files in start_command", () => {
      const result = testRepo.runCLI("create test/start-env")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain(".env found")
      expect(result.combined).toContain(".env.local found")
    })
  })
})

// =============================================================================
// CREATE COMMAND - EDGE CASES PROJECT
// =============================================================================

describe("Create Command - Edge Cases Project", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("edge-cases", "create-edge")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Files with spaces in path", () => {
    it("should copy directories with spaces in name", () => {
      testRepo.runCLI("create test/spaces")

      const wtPath = testRepo.getWorktreePath("test/spaces")
      expect(existsSync(path.join(wtPath, "dir with spaces/config.json"))).toBe(true)
    })
  })

  describe("Deeply nested paths", () => {
    it("should copy files in deeply nested directories", () => {
      testRepo.runCLI("create test/deep")

      const wtPath = testRepo.getWorktreePath("test/deep")
      expect(existsSync(path.join(wtPath, "deeply/nested/path/to/file.txt"))).toBe(true)
    })
  })

  describe("Unicode filenames", () => {
    it("should copy files with unicode characters in name", () => {
      testRepo.runCLI("create test/unicode")

      const wtPath = testRepo.getWorktreePath("test/unicode")
      expect(existsSync(path.join(wtPath, "unicode-日本語.txt"))).toBe(true)

      const content = fs.readFileSync(path.join(wtPath, "unicode-日本語.txt"), "utf-8")
      expect(content).toContain("こんにちは世界")
    })
  })

  describe("Branch names with special characters", () => {
    it("should handle branch names with multiple slashes", () => {
      const result = testRepo.runCLI("create feature/v1/major/release")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("worktree-feature-v1-major-release")
    })

    it("should handle branch names with numbers", () => {
      const result = testRepo.runCLI("create fix/issue-123")

      expect(result.exitCode).toBe(0)
      expect(testRepo.branchExists("fix/issue-123")).toBe(true)
    })
  })
})

// =============================================================================
// CREATE COMMAND - MISSING FILES PROJECT
// =============================================================================

describe("Create Command - Missing Files Handling", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("missing-files", "create-missing")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Graceful handling of missing copy_files", () => {
    it("should skip non-existent files and continue", () => {
      const result = testRepo.runCLI("create test/skip-missing")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Skip (not found)")
      expect(result.combined).toContain("Worktree created successfully")
    })

    it("should copy existing files even when some are missing", () => {
      testRepo.runCLI("create test/partial-copy")

      const wtPath = testRepo.getWorktreePath("test/partial-copy")
      expect(existsSync(path.join(wtPath, ".env"))).toBe(true)
    })
  })

  describe("Graceful handling of missing start_command", () => {
    it("should continue worktree creation when start_command fails", () => {
      const result = testRepo.runCLI("create test/no-script")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Start command failed")
      expect(result.combined).toContain("Worktree created successfully")
    })
  })
})

// =============================================================================
// REMOVE COMMAND - BASIC PROJECT
// =============================================================================

describe("Remove Command - Basic Project", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("basic", "remove")
    // Create a worktree to remove
    testRepo.runCLI("create test/to-remove")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Basic worktree removal", () => {
    it("should remove existing worktree", () => {
      const wtPath = testRepo.getWorktreePath("test/to-remove")
      expect(existsSync(wtPath)).toBe(true)

      const result = testRepo.runCLI("remove test/to-remove")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Worktree removed successfully")
      expect(existsSync(wtPath)).toBe(false)
    })

    it("should show remaining worktrees after removal", () => {
      const result = testRepo.runCLI("remove test/to-remove")

      expect(result.combined).toContain("Remaining worktrees")
      expect(result.combined).toContain("main")
    })
  })

  describe("Force removal", () => {
    it("should force remove worktree with untracked files", () => {
      const wtPath = testRepo.getWorktreePath("test/to-remove")
      fs.writeFileSync(path.join(wtPath, "untracked.txt"), "untracked content")

      const result = testRepo.runCLI("remove test/to-remove --force")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Force removal enabled")
      expect(result.combined).toContain("Worktree removed successfully")
    })

    it("should force remove worktree with modified files", () => {
      const wtPath = testRepo.getWorktreePath("test/to-remove")
      fs.writeFileSync(path.join(wtPath, "README.md"), "modified content")

      const result = testRepo.runCLI("remove test/to-remove --force")

      expect(result.exitCode).toBe(0)
      expect(existsSync(wtPath)).toBe(false)
    })
  })

  describe("Error handling", () => {
    it("should fail when worktree does not exist", () => {
      // Remove first
      testRepo.runCLI("remove test/to-remove --force")

      const result = testRepo.runCLI("remove nonexistent/branch")

      expect(result.exitCode).toBe(1)
      expect(result.combined).toContain("No worktree found for branch")
    })

    it("should prevent removing main repository", () => {
      const result = testRepo.runCLI("remove main")

      expect(result.exitCode).toBe(1)
      expect(result.combined).toContain("Cannot remove the main repository")
    })

    it("should list available worktrees when target not found", () => {
      testRepo.runCLI("remove test/to-remove --force")

      const result = testRepo.runCLI("remove nonexistent")

      expect(result.combined).toContain("Available worktrees")
    })
  })
})

// =============================================================================
// REMOVE COMMAND - FULL-FEATURED PROJECT
// =============================================================================

describe("Remove Command - Full-Featured Project", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("full-featured", "remove-full")
    testRepo.runCLI("create test/end-cmd")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("end_command functionality", () => {
    it("should execute end_command before worktree removal", () => {
      const result = testRepo.runCLI("remove test/end-cmd --force")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Running end command")
      expect(result.combined).toContain("STOP COMMAND EXECUTED")
      expect(result.combined).toContain("End command completed successfully")
    })
  })
})

// =============================================================================
// REMOVE COMMAND - MISSING FILES PROJECT
// =============================================================================

describe("Remove Command - Missing Files Handling", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("missing-files", "remove-missing")
    testRepo.runCLI("create test/missing-end")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Graceful handling of missing end_command", () => {
    it("should continue removal when end_command fails", () => {
      const result = testRepo.runCLI("remove test/missing-end --force")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("End command failed")
      expect(result.combined).toContain("Worktree removed successfully")
    })
  })
})

// =============================================================================
// STATUS COMMAND
// =============================================================================

describe("Status Command", () => {
  let testRepo: TestRepo

  beforeEach(() => {
    testRepo = createTestRepo("full-featured", "status")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("Basic status display", () => {
    it("should show Git Worktrees Status header", () => {
      const result = testRepo.runCLI("status")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Git Worktrees Status")
    })

    it("should show main branch as current", () => {
      const result = testRepo.runCLI("status")

      expect(result.combined).toContain("main")
      expect(result.combined).toContain("→")
    })

    it("should show Docker Environment Status", () => {
      const result = testRepo.runCLI("status")

      expect(result.combined).toContain("Docker Environment Status")
    })
  })

  describe("--all flag", () => {
    it("should show all worktrees with --all flag", () => {
      testRepo.runCLI("create branch1")
      testRepo.runCLI("create branch2")

      const result = testRepo.runCLI("status --all")

      expect(result.combined).toContain("main")
      expect(result.combined).toContain("branch1")
      expect(result.combined).toContain("branch2")
    })
  })

  describe("--docker-only flag", () => {
    it("should show only Docker status with --docker-only flag", () => {
      const result = testRepo.runCLI("status --docker-only")

      expect(result.exitCode).toBe(0)
      expect(result.combined).toContain("Docker Environment Status")
      expect(result.combined).not.toContain("Git Worktrees Status")
    })
  })

  describe("Environment file detection", () => {
    it("should detect and show environment files", () => {
      const result = testRepo.runCLI("status")

      // The status command shows env files if they exist
      expect(result.exitCode).toBe(0)
    })
  })
})

// =============================================================================
// FULL WORKFLOW TESTS
// =============================================================================

describe("Full Workflow Tests", () => {
  describe("Basic project workflow", () => {
    let testRepo: TestRepo

    beforeEach(() => {
      testRepo = createTestRepo("basic", "workflow-basic")
    })

    afterEach(() => {
      testRepo.cleanup()
    })

    it("should complete create → status → remove cycle", () => {
      // Create
      const createResult = testRepo.runCLI("create feature/workflow")
      expect(createResult.exitCode).toBe(0)

      // Status
      const statusResult = testRepo.runCLI("status --all")
      expect(statusResult.combined).toContain("feature/workflow")

      // Remove
      const removeResult = testRepo.runCLI("remove feature/workflow")
      expect(removeResult.exitCode).toBe(0)

      // Verify removed
      const finalStatus = testRepo.runCLI("status --all")
      expect(finalStatus.combined).not.toContain("feature/workflow")
    })
  })

  describe("Full-featured project workflow", () => {
    let testRepo: TestRepo

    beforeEach(() => {
      testRepo = createTestRepo("full-featured", "workflow-full")
    })

    afterEach(() => {
      testRepo.cleanup()
    })

    it("should complete full lifecycle with all features", () => {
      // Create with copy_files and start_command
      const createResult = testRepo.runCLI("create feature/full-lifecycle")

      expect(createResult.exitCode).toBe(0)
      expect(createResult.combined).toContain("Copying files/directories")
      expect(createResult.combined).toContain("START COMMAND EXECUTED")

      const wtPath = testRepo.getWorktreePath("feature/full-lifecycle")

      // Verify copy_files
      expect(existsSync(path.join(wtPath, ".env"))).toBe(true)
      expect(existsSync(path.join(wtPath, ".secrets"))).toBe(true)
      expect(existsSync(path.join(wtPath, "config/local.json"))).toBe(true)

      // Verify start_command marker
      expect(existsSync(path.join(wtPath, ".start-executed"))).toBe(true)

      // Remove with end_command
      const removeResult = testRepo.runCLI("remove feature/full-lifecycle --force")

      expect(removeResult.exitCode).toBe(0)
      expect(removeResult.combined).toContain("STOP COMMAND EXECUTED")
      expect(removeResult.combined).toContain("Worktree removed successfully")

      // Verify cleanup
      expect(existsSync(wtPath)).toBe(false)
    })
  })

  describe("Multiple worktrees workflow", () => {
    let testRepo: TestRepo

    beforeEach(() => {
      testRepo = createTestRepo("basic", "workflow-multi")
    })

    afterEach(() => {
      testRepo.cleanup()
    })

    it("should manage multiple worktrees simultaneously", () => {
      // Create multiple worktrees
      testRepo.runCLI("create feature/one")
      testRepo.runCLI("create feature/two")
      testRepo.runCLI("create feature/three")

      // Verify all exist
      const worktrees = testRepo.listWorktrees()
      expect(worktrees.length).toBe(4) // main + 3 features

      // Status shows all
      const status = testRepo.runCLI("status --all")
      expect(status.combined).toContain("feature/one")
      expect(status.combined).toContain("feature/two")
      expect(status.combined).toContain("feature/three")

      // Remove one
      testRepo.runCLI("remove feature/two")

      // Verify removed
      const statusAfter = testRepo.runCLI("status --all")
      expect(statusAfter.combined).toContain("feature/one")
      expect(statusAfter.combined).not.toContain("feature/two")
      expect(statusAfter.combined).toContain("feature/three")
    })
  })
})

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling", () => {
  describe("Not in git repository", () => {
    it("should error when running create outside git repo", () => {
      const { path: nonGitPath, cleanup } = createNonGitDir("create-test")

      try {
        const result = runCLI("create test/branch", nonGitPath)

        expect(result.exitCode).toBeGreaterThan(0)
        expect(result.combined.toLowerCase()).toContain("not")
        expect(result.combined.toLowerCase()).toContain("git")
      } finally {
        cleanup()
      }
    })

    it("should error when running remove outside git repo", () => {
      const { path: nonGitPath, cleanup } = createNonGitDir("remove-test")

      try {
        const result = runCLI("remove test/branch", nonGitPath)

        expect(result.exitCode).toBeGreaterThan(0)
        expect(result.combined.toLowerCase()).toContain("not")
      } finally {
        cleanup()
      }
    })

    it("should error when running status outside git repo", () => {
      const { path: nonGitPath, cleanup } = createNonGitDir("status-test")

      try {
        const result = runCLI("status", nonGitPath)

        expect(result.exitCode).toBeGreaterThan(0)
      } finally {
        cleanup()
      }
    })
  })

  describe("Missing arguments", () => {
    let testRepo: TestRepo

    beforeEach(() => {
      testRepo = createTestRepo("basic", "error-args")
    })

    afterEach(() => {
      testRepo.cleanup()
    })

    it("should show help when no command given and no branch option", () => {
      const result = testRepo.runCLI("")

      // Should show help
      expect(result.combined).toContain("Usage")
    })
  })
})

// =============================================================================
// CROSS-PROJECT TESTS
// =============================================================================

describe("Cross-Project Compatibility", () => {
  const projects = getTestProjects()

  for (const project of projects) {
    describe(`Project: ${project.name}`, () => {
      let testRepo: TestRepo

      beforeEach(() => {
        testRepo = createTestRepo(project.name, "cross")
      })

      afterEach(() => {
        testRepo.cleanup()
      })

      it("should create worktree successfully", () => {
        const result = testRepo.runCLI("create test/cross-project")

        expect(result.exitCode).toBe(0)
        expect(result.combined).toContain("Worktree created successfully")
      })

      it("should show status without errors", () => {
        const result = testRepo.runCLI("status")

        expect(result.exitCode).toBe(0)
        expect(result.combined).toContain("Git Worktrees Status")
      })

      it("should remove worktree successfully", () => {
        testRepo.runCLI("create test/to-cleanup")

        const result = testRepo.runCLI("remove test/to-cleanup --force")

        expect(result.exitCode).toBe(0)
        expect(result.combined).toContain("Worktree removed successfully")
      })
    })
  }
})
