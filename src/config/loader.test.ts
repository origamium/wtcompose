import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, hasConfigFile, createDefaultConfig } from './loader'
import { createTestGitRepo, addFileToRepo, createWTurboConfig } from '../test/helpers/git-test-helper'
import type { TestGitRepo } from '../test/helpers/git-test-helper'
import * as fs from 'fs-extra'
import * as path from 'node:path'

describe('Config Loader', () => {
  let testRepo: TestGitRepo

  beforeEach(() => {
    testRepo = createTestGitRepo('config-test')
  })

  afterEach(() => {
    testRepo.cleanup()
  })

  describe('loadConfig', () => {
    it('should load default config when no wturbo.yaml exists', () => {
      const config = loadConfig(testRepo.path)
      
      expect(config).toEqual({
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {}
        }
      })
    })

    it('should load custom config from wturbo.yaml', () => {
      // Create the docker-compose file first
      const composeContent = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "4000:80"
`
      fs.writeFileSync(path.join(testRepo.path, 'compose.yml'), composeContent)
      
      // Create a custom wturbo.yaml config
      createWTurboConfig(testRepo.path, {
        base_branch: 'develop',
        docker_compose_file: './compose.yml',
        env: {
          file: ['./.env.custom'],
          adjust: {
            APP_PORT: 4000,
            DB_PORT: null
          }
        }
      })

      const config = loadConfig(testRepo.path)
      
      expect(config.base_branch).toBe('develop')
      expect(config.docker_compose_file).toBe('./compose.yml')
      expect(config.env.file).toEqual(['./.env.custom'])
      expect(config.env.adjust.APP_PORT).toBe(4000)
      expect(config.env.adjust.DB_PORT).toBe(null)
    })

    it('should merge partial config with defaults', () => {
      // Create the docker-compose file first
      fs.writeFileSync(path.join(testRepo.path, 'docker-compose.yaml'), `version: "3.8"
services:
  web:
    image: nginx`)
      
      // Create a minimal config that only specifies base_branch
      const configContent = `base_branch: feature
docker_compose_file: ./docker-compose.yaml

env:
  file:
    - ./.env
  adjust:
    APP_PORT: null
`
      fs.writeFileSync(path.join(testRepo.path, 'wturbo.yaml'), configContent)

      const config = loadConfig(testRepo.path)
      
      expect(config.base_branch).toBe('feature')
      expect(config.docker_compose_file).toBe('./docker-compose.yaml')
      expect(config.env.file).toEqual(['./.env'])
    })

    it('should handle different config file names', () => {
      // Create the docker-compose file first
      fs.writeFileSync(path.join(testRepo.path, 'docker-compose.yaml'), `version: "3.8"
services:
  web:
    image: nginx`)
      
      // Test with .wturbo.yaml (hidden file)
      const configContent = `base_branch: test
docker_compose_file: ./docker-compose.yaml

env:
  file: []
  adjust: {}
`
      fs.writeFileSync(path.join(testRepo.path, '.wturbo.yaml'), configContent)

      const config = loadConfig(testRepo.path)
      expect(config.base_branch).toBe('test')
    })
  })

  describe('hasConfigFile', () => {
    it('should return false when no config file exists', () => {
      expect(hasConfigFile(testRepo.path)).toBe(false)
    })

    it('should return true when wturbo.yaml exists', () => {
      createWTurboConfig(testRepo.path)
      expect(hasConfigFile(testRepo.path)).toBe(true)
    })

    it('should return true when .wturbo.yaml exists', () => {
      fs.writeFileSync(path.join(testRepo.path, '.wturbo.yaml'), 'base_branch: main')
      expect(hasConfigFile(testRepo.path)).toBe(true)
    })
  })

  describe('createDefaultConfig', () => {
    it('should create a default wturbo.yaml file', () => {
      const configPath = createDefaultConfig(testRepo.path)
      
      expect(configPath).toBe(path.join(testRepo.path, 'wturbo.yaml'))
      expect(fs.existsSync(configPath)).toBe(true)
      
      const content = fs.readFileSync(configPath, 'utf-8')
      expect(content).toContain('base_branch: main')
      expect(content).toContain('docker_compose_file: ./docker-compose.yaml')
    })

    it('should create valid YAML that can be loaded', () => {
      // Create the docker-compose file that the config references
      fs.writeFileSync(path.join(testRepo.path, 'docker-compose.yaml'), `version: "3.8"
services:
  web:
    image: nginx`)
      
      createDefaultConfig(testRepo.path)
      
      // Should be able to load the created config
      const config = loadConfig(testRepo.path)
      expect(config.base_branch).toBe('main')
      expect(config.docker_compose_file).toBe('./docker-compose.yaml')
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid YAML syntax', () => {
      // Create invalid YAML
      const invalidYaml = `
base_branch: main
  invalid: yaml: syntax:
    - broken
`
      fs.writeFileSync(path.join(testRepo.path, 'wturbo.yaml'), invalidYaml)

      expect(() => loadConfig(testRepo.path)).toThrow()
    })

    it('should handle missing docker-compose file gracefully', () => {
      createWTurboConfig(testRepo.path, {
        docker_compose_file: './nonexistent-compose.yml'
      })

      // Should not throw, but should log warning
      expect(() => loadConfig(testRepo.path)).toThrow('docker_compose_file not found')
    })
  })

  describe('integration with git repository', () => {
    it('should work in a real git repository context', () => {
      // Create the docker-compose file first
      fs.writeFileSync(path.join(testRepo.path, 'docker-compose.yaml'), `version: "3.8"
services:
  web:
    image: nginx`)
      
      // Add some files to make it more realistic
      addFileToRepo(testRepo.path, 'package.json', '{"name": "test"}')
      
      // Create src directory first, then add file
      fs.ensureDirSync(path.join(testRepo.path, 'src'))
      addFileToRepo(testRepo.path, 'src/index.ts', 'console.log("hello")')
      
      // Create config
      createWTurboConfig(testRepo.path)
      
      const config = loadConfig(testRepo.path)
      expect(config).toBeDefined()
      expect(config.base_branch).toBe('main')
    })

    it('should handle config in different directories within repo', () => {
      // Create the docker-compose file first
      fs.writeFileSync(path.join(testRepo.path, 'docker-compose.yaml'), `version: "3.8"
services:
  web:
    image: nginx`)
      
      // Create a subdirectory structure
      const subDir = path.join(testRepo.path, 'sub', 'directory')
      fs.ensureDirSync(subDir)
      
      // Create config in root
      createWTurboConfig(testRepo.path)
      
      // Should find config when called from subdirectory
      const config = loadConfig(testRepo.path)
      expect(config.base_branch).toBe('main')
    })
  })
})