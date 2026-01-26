/**
 * @fileoverview Git リポジトリ操作のテスト
 * 新しいディレクトリ構造に対応したテストファイル
 */

import { execSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestGitRepo, type TestGitRepo } from "../../test/helpers/git-test-helper.js"
import {
  branchExists,
  getCurrentBranch,
  getGitRoot,
  getRepositoryInfo,
  isGitRepository,
} from "./repository.js"

// Mock dependencies
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

describe("Git Repository Operations (Refactored)", () => {
  let testRepo: TestGitRepo

  beforeEach(() => {
    vi.clearAllMocks()
    testRepo = createTestGitRepo()
  })

  afterEach(() => {
    testRepo?.cleanup()
  })

  describe("isGitRepository", () => {
    it("should return true when in a git repository", () => {
      vi.mocked(execSync).mockReturnValue("true\n")

      const result = isGitRepository(testRepo.path)

      expect(result).toBe(true)
      expect(execSync).toHaveBeenCalledWith(
        "git rev-parse --is-inside-work-tree",
        expect.objectContaining({ cwd: testRepo.path })
      )
    })

    it("should return false when not in a git repository", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("Not a git repository")
      })

      const result = isGitRepository("/tmp/not-git")

      expect(result).toBe(false)
    })
  })

  describe("getGitRoot", () => {
    it("should return repository root path", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockReturnValueOnce("/path/to/repo\n") // git rev-parse --show-toplevel

      const root = getGitRoot(testRepo.path)

      expect(root).toBe("/path/to/repo")
      expect(execSync).toHaveBeenCalledWith(
        "git rev-parse --show-toplevel",
        expect.objectContaining({ cwd: testRepo.path })
      )
    })

    it("should throw error when not in git repository", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("Not a git repository")
      })

      expect(() => getGitRoot("/tmp/not-git")).toThrow("Not in a Git repository")
    })
  })

  describe("getCurrentBranch", () => {
    it("should return current branch name", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockReturnValueOnce("main\n") // git branch --show-current

      const branch = getCurrentBranch(testRepo.path)

      expect(branch).toBe("main")
      expect(execSync).toHaveBeenCalledWith(
        "git branch --show-current",
        expect.objectContaining({ cwd: testRepo.path })
      )
    })
  })

  describe("branchExists", () => {
    it("should return true when branch exists", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockReturnValueOnce("") // git show-ref (success = branch exists)

      const exists = branchExists("feature-branch", testRepo.path)

      expect(exists).toBe(true)
      expect(execSync).toHaveBeenCalledWith(
        "git show-ref --verify --quiet refs/heads/feature-branch",
        expect.objectContaining({ cwd: testRepo.path })
      )
    })

    it("should return false when branch does not exist", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockImplementationOnce(() => {
          throw new Error("Branch not found")
        })

      const exists = branchExists("nonexistent-branch", testRepo.path)

      expect(exists).toBe(false)
    })
  })

  describe("getRepositoryInfo", () => {
    it("should return complete repository information", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockReturnValueOnce("/path/to/repo\n") // getGitRoot
        .mockReturnValueOnce("main\n") // getCurrentBranch
        .mockReturnValueOnce("") // git status --porcelain (clean repo)

      const info = getRepositoryInfo(testRepo.path)

      expect(info.root).toBe("/path/to/repo")
      expect(info.currentBranch).toBe("main")
      expect(info.isClean).toBe(true)
      expect(info.isGitRepository).toBe(true)
    })

    it("should detect dirty repository", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("true\n") // isGitRepository check
        .mockReturnValueOnce("/path/to/repo\n") // getGitRoot
        .mockReturnValueOnce("main\n") // getCurrentBranch
        .mockReturnValueOnce("M file.txt\n") // git status --porcelain (dirty)

      const info = getRepositoryInfo(testRepo.path)

      expect(info.isClean).toBe(false)
    })
  })
})
