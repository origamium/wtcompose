/**
 * @fileoverview 設定バリデーターのテスト
 * 新しいディレクトリ構造に対応したテストファイル
 */

import * as path from "node:path"
import { existsSync } from "fs-extra"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WTurboConfig } from "../../types/index.js"
import { suggestEnvVarName, validateConfig, validateEnvVarName } from "./validator.js"

// Mock dependencies
vi.mock("fs-extra", () => ({
  existsSync: vi.fn(),
}))

describe("Config Validator (Refactored)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("validateConfig", () => {
    const configFile = "/test/wturbo.yaml"
    const configDir = "/test"

    beforeEach(() => {
      // Default mock behavior
      vi.mocked(existsSync).mockReturnValue(true)
    })

    it("should validate a complete valid configuration", () => {
      const validConfig: WTurboConfig = {
        base_branch: "main",
        docker_compose_file: "./docker-compose.yaml",
        copy_files: [".env", ".claude"],
        env: {
          file: ["./env/prod.env", "./env/dev.env"],
          adjust: {
            APP_PORT: 3000,
            API_URL: "http://localhost:8080",
            DEBUG_MODE: null,
          },
        },
      }

      expect(() => validateConfig(validConfig, configFile)).not.toThrow()
    })

    it("should throw error when base_branch is missing", () => {
      const invalidConfig = {
        docker_compose_file: "./docker-compose.yaml",
        env: { file: ["./.env"], adjust: {} },
      } as WTurboConfig

      expect(() => validateConfig(invalidConfig, configFile)).toThrow(
        "base_branch must be a non-empty string"
      )
    })

    it("should throw error when docker_compose_file does not exist", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return !path.toString().includes("docker-compose.yaml")
      })

      const invalidConfig: WTurboConfig = {
        base_branch: "main",
        docker_compose_file: "./docker-compose.yaml",
        copy_files: [],
        env: { file: ["./.env"], adjust: {} },
      }

      expect(() => validateConfig(invalidConfig, configFile)).toThrow(
        "docker_compose_file not found"
      )
    })
  })

  describe("validateEnvVarName", () => {
    it("should validate correct environment variable names", () => {
      expect(validateEnvVarName("APP_PORT")).toBe(true)
      expect(validateEnvVarName("DATABASE_URL")).toBe(true)
      expect(validateEnvVarName("NODE_ENV")).toBe(true)
      expect(validateEnvVarName("API_KEY_SECRET")).toBe(true)
    })

    it("should reject invalid environment variable names", () => {
      expect(validateEnvVarName("app_port")).toBe(false) // lowercase
      expect(validateEnvVarName("123_VAR")).toBe(false) // starts with number
      expect(validateEnvVarName("APP-PORT")).toBe(false) // hyphen
      expect(validateEnvVarName("APP.PORT")).toBe(false) // dot
      expect(validateEnvVarName("")).toBe(false) // empty
    })
  })

  describe("suggestEnvVarName", () => {
    it("should convert lowercase to uppercase", () => {
      expect(suggestEnvVarName("app_port")).toBe("APP_PORT")
      expect(suggestEnvVarName("database_url")).toBe("DATABASE_URL")
    })

    it("should replace invalid characters with underscores", () => {
      expect(suggestEnvVarName("app-port")).toBe("APP_PORT")
      expect(suggestEnvVarName("api.key")).toBe("API_KEY")
      expect(suggestEnvVarName("my@var")).toBe("MY_VAR")
    })

    it("should handle names starting with numbers", () => {
      expect(suggestEnvVarName("123_var")).toBe("_123_VAR")
      expect(suggestEnvVarName("2factor")).toBe("_2FACTOR")
      expect(suggestEnvVarName("99_bottles")).toBe("_99_BOTTLES")
    })

    it("should remove multiple consecutive underscores", () => {
      expect(suggestEnvVarName("my__var__name")).toBe("MY_VAR_NAME")
      expect(suggestEnvVarName("app___port")).toBe("APP_PORT")
    })

    it("should remove trailing underscores", () => {
      expect(suggestEnvVarName("app_port_")).toBe("APP_PORT")
      expect(suggestEnvVarName("my_var__")).toBe("MY_VAR")
    })

    it("should handle complex scenarios", () => {
      expect(suggestEnvVarName("123-my.var@name_")).toBe("_123_MY_VAR_NAME")
      expect(suggestEnvVarName("__leading")).toBe("LEADING")
      expect(suggestEnvVarName("mix3d-c4s3")).toBe("MIX3D_C4S3")
    })
  })
})
