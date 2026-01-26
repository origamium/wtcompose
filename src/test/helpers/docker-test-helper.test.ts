import * as path from "node:path"
import * as fs from "fs-extra"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  cloneDockerEnvWithPortOffset,
  type DockerTestEnvOptions,
  parseEnvFile,
  setupDockerTestEnv,
  updateEnvFile,
} from "./docker-test-helper"
import { createTestGitRepo, type TestGitRepo } from "./git-test-helper"

describe("Docker Test Helper", () => {
  let testRepo: TestGitRepo

  beforeEach(() => {
    testRepo = createTestGitRepo("docker-test")
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe("setupDockerTestEnv", () => {
    it("should create docker-compose.yml in the repository", () => {
      const env = setupDockerTestEnv(testRepo.path)

      expect(fs.existsSync(env.composeFile)).toBe(true)
      expect(env.composeFile).toBe(path.join(testRepo.path, "docker-compose.yml"))
    })

    it("should create .env file with default values", () => {
      const env = setupDockerTestEnv(testRepo.path)

      expect(fs.existsSync(env.envFile)).toBe(true)

      const envContent = parseEnvFile(env.envFile)
      expect(envContent.APP_PORT).toBe("3000")
      expect(envContent.DB_PORT).toBe("5432")
      expect(envContent.REDIS_PORT).toBe("6379")
    })

    it("should create .env file with custom values", () => {
      const options: DockerTestEnvOptions = {
        projectName: "custom-project",
        appPort: 4000,
        dbPort: 5433,
        redisPort: 6380,
      }

      const env = setupDockerTestEnv(testRepo.path, options)
      const envContent = parseEnvFile(env.envFile)

      expect(envContent.COMPOSE_PROJECT_NAME).toBe("custom-project")
      expect(envContent.APP_PORT).toBe("4000")
      expect(envContent.DB_PORT).toBe("5433")
      expect(envContent.REDIS_PORT).toBe("6380")
    })

    it("should create init-db directory with SQL script", () => {
      const env = setupDockerTestEnv(testRepo.path)

      expect(fs.existsSync(env.initDbFile)).toBe(true)

      const sqlContent = fs.readFileSync(env.initDbFile, "utf-8")
      expect(sqlContent).toContain("CREATE TABLE")
    })

    it("should return options used for setup", () => {
      const options: DockerTestEnvOptions = {
        appPort: 5000,
        dbName: "mydb",
      }

      const env = setupDockerTestEnv(testRepo.path, options)

      expect(env.options.appPort).toBe(5000)
      expect(env.options.dbName).toBe("mydb")
      expect(env.options.projectName).toBeDefined()
    })
  })

  describe("parseEnvFile", () => {
    it("should parse key-value pairs", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "KEY1=value1\nKEY2=value2")

      const result = parseEnvFile(envPath)

      expect(result.KEY1).toBe("value1")
      expect(result.KEY2).toBe("value2")
    })

    it("should ignore comments and empty lines", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "# Comment\nKEY=value\n\n# Another comment")

      const result = parseEnvFile(envPath)

      expect(Object.keys(result)).toHaveLength(1)
      expect(result.KEY).toBe("value")
    })

    it("should handle values with equals signs", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "URL=http://localhost:8080?foo=bar")

      const result = parseEnvFile(envPath)

      expect(result.URL).toBe("http://localhost:8080?foo=bar")
    })
  })

  describe("updateEnvFile", () => {
    it("should update existing keys", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "PORT=3000\nHOST=localhost")

      updateEnvFile(envPath, { PORT: 4000 })

      const result = parseEnvFile(envPath)
      expect(result.PORT).toBe("4000")
      expect(result.HOST).toBe("localhost")
    })

    it("should add new keys", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "EXISTING=value")

      updateEnvFile(envPath, { NEW_KEY: "new_value" })

      const result = parseEnvFile(envPath)
      expect(result.EXISTING).toBe("value")
      expect(result.NEW_KEY).toBe("new_value")
    })

    it("should preserve comments", () => {
      const envPath = path.join(testRepo.path, "test.env")
      fs.writeFileSync(envPath, "# Comment\nKEY=value")

      updateEnvFile(envPath, { KEY: "updated" })

      const content = fs.readFileSync(envPath, "utf-8")
      expect(content).toContain("# Comment")
    })
  })

  describe("cloneDockerEnvWithPortOffset", () => {
    it("should create new environment with offset ports", () => {
      // Setup source environment
      setupDockerTestEnv(testRepo.path, {
        projectName: "source-project",
        appPort: 3000,
        dbPort: 5432,
        redisPort: 6379,
      })

      // Create destination directory
      const destPath = path.join(testRepo.path, "worktree-feature")
      fs.ensureDirSync(destPath)

      // Clone with port offset
      const clonedEnv = cloneDockerEnvWithPortOffset(testRepo.path, destPath, 100)
      const clonedEnvContent = parseEnvFile(clonedEnv.envFile)

      expect(clonedEnvContent.APP_PORT).toBe("3100")
      expect(clonedEnvContent.DB_PORT).toBe("5532")
      expect(clonedEnvContent.REDIS_PORT).toBe("6479")
      expect(clonedEnvContent.COMPOSE_PROJECT_NAME).toContain("-wt-")
    })
  })
})
