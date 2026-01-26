/**
 * @fileoverview 設定ローダーのテスト
 * 新しいディレクトリ構造に対応したテストファイル
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs-extra'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  loadConfig,
  findConfigFile,
  getConfigFilePath,
  hasConfigFile,
  createDefaultConfig,
  mergeWithDefaults
} from './loader.js'
import type { WTurboConfig } from '../../types/index.js'
import { createTestGitRepo, type TestGitRepo } from '../../test/helpers/git-test-helper.js'

// Mock dependencies
vi.mock('fs-extra', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))
vi.mock('yaml', () => ({
  parse: vi.fn()
}))

describe('Config Loader (Refactored)', () => {
  let testRepo: TestGitRepo

  beforeEach(() => {
    vi.clearAllMocks()
    testRepo = createTestGitRepo()
  })

  afterEach(() => {
    testRepo?.cleanup()
  })

  describe('loadConfig', () => {
    it('should load default config when no wturbo.yaml exists', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const config = loadConfig(testRepo.path)

      expect(config.base_branch).toBe('main')
      expect(config.docker_compose_file).toBe('./docker-compose.yml')
      expect(config.env.file).toEqual(['./.env'])
    })

    it('should load custom config from wturbo.yaml', () => {
      const mockContent = `
base_branch: develop
docker_compose_file: ./docker-compose.dev.yml
env:
  file:
    - ./.env.custom
  adjust:
    APP_PORT: 1000
`
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockContent)
      vi.mocked(parse).mockReturnValue({
        base_branch: 'develop',
        docker_compose_file: './docker-compose.dev.yml',
        env: {
          file: ['./.env.custom'],
          adjust: { APP_PORT: 1000 }
        }
      })

      const config = loadConfig(testRepo.path)

      expect(config.base_branch).toBe('develop')
      expect(config.docker_compose_file).toBe('./docker-compose.dev.yml')
      expect(config.env.file).toEqual(['./.env.custom'])
      expect(config.env.adjust.APP_PORT).toBe(1000)
    })

    it('should merge partial config with defaults', () => {
      const mockContent = `base_branch: develop`
      
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockContent)
      vi.mocked(parse).mockReturnValue({
        base_branch: 'develop'
      })

      const config = loadConfig(testRepo.path)

      expect(config.base_branch).toBe('develop')
      expect(config.docker_compose_file).toBe('./docker-compose.yml') // default
      expect(config.env.file).toEqual(['./.env']) // default
    })
  })

  describe('findConfigFile', () => {
    it('should find first existing config file', () => {
      vi.mocked(existsSync)
        .mockReturnValueOnce(false) // wturbo.yaml
        .mockReturnValueOnce(true)  // wturbo.yml

      const result = findConfigFile(testRepo.path)

      expect(result.exists).toBe(true)
      expect(result.path).toContain('wturbo.yml')
    })

    it('should return null when no config file exists', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = findConfigFile(testRepo.path)

      expect(result.exists).toBe(false)
      expect(result.path).toBeNull()
    })
  })

  describe('createDefaultConfig', () => {
    it('should create valid YAML that can be loaded', () => {
      const configPath = path.join(testRepo.path, 'wturbo.yaml')
      vi.mocked(existsSync).mockReturnValue(false)

      const config = createDefaultConfig(configPath)

      expect(writeFileSync).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('base_branch: "main"'),
        'utf-8'
      )
      expect(config.base_branch).toBe('main')
    })
  })
})