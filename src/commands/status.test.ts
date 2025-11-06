import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { statusCommand } from './status'
import * as dockerUtils from '../utils/docker'
import * as gitUtils from '../utils/git'
import { existsSync } from 'fs-extra'
import * as path from 'node:path'
import type { Command } from 'commander'

// Mock dependencies
vi.mock('../utils/docker')
vi.mock('../utils/git')
vi.mock('fs-extra', () => ({
  existsSync: vi.fn()
}))

describe('Status Command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let command: Command

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    command = statusCommand()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('statusCommand', () => {
    it('should create command with correct configuration', () => {
      expect(command.name()).toBe('status')
      expect(command.description()).toBe('Show status of worktrees and their Docker environments')
    })

    it('should have correct options', () => {
      const options = command.options
      expect(options).toHaveLength(2)

      const allOption = options.find(opt => opt.flags === '-a, --all')
      expect(allOption?.description).toBe('Show all worktrees, not just current')

      const dockerOnlyOption = options.find(opt => opt.flags === '--docker-only')
      expect(dockerOnlyOption?.description).toBe('Show only Docker-related information')
    })

    it('should exit with error when not in git repository', async () => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(false)

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(async () => {
        await command.parseAsync([], { from: 'user' })
      }).rejects.toThrow('process.exit called')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a git repository')
      expect(mockExit).toHaveBeenCalledWith(1)

      mockExit.mockRestore()
    })
  })

  describe('showWorktreeStatus', () => {
    beforeEach(() => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(true)
      vi.mocked(gitUtils.listWorktrees).mockReturnValue([])
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')
      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])
      vi.mocked(existsSync).mockReturnValue(false)
    })

    it('should show message when no worktrees found', async () => {
      vi.mocked(gitUtils.listWorktrees).mockReturnValue([])

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('📁 Git Worktrees Status\n')
      expect(consoleSpy).toHaveBeenCalledWith('No worktrees found')
    })

    it('should display worktree information', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        },
        {
          path: '/project-feature',
          branch: 'feature',
          head: 'def456'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')

      await command.parseAsync(['--all'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('→ main (main)')
      expect(consoleSpy).toHaveBeenCalledWith('   📂 /project')
      expect(consoleSpy).toHaveBeenCalledWith('  feature')
      expect(consoleSpy).toHaveBeenCalledWith('   📂 /project-feature')
    })

    it('should show docker-compose file information when present', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')

      // Mock docker-compose.yml exists
      vi.mocked(existsSync).mockImplementation((filePath) => {
        return filePath.toString().includes('docker-compose.yml')
      })

      // Mock compose file content
      vi.mocked(dockerUtils.readComposeFile).mockReturnValue({
        version: '3.8',
        services: {
          web: { image: 'nginx' },
          db: { image: 'postgres' }
        }
      })

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('   🐳 Docker: docker-compose.yml')
      expect(consoleSpy).toHaveBeenCalledWith('   📦 Services: 2')
    })

    it('should show no docker-compose file when not present', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')
      vi.mocked(existsSync).mockReturnValue(false)

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('   🐳 Docker: No compose file')
    })

    it('should show environment files when present', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')

      // Mock .env and .env.local exist
      vi.mocked(existsSync).mockImplementation((filePath) => {
        const fileName = path.basename(filePath.toString())
        return fileName === '.env' || fileName === '.env.local'
      })

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('   🔧 Environment: .env, .env.local')
    })

    it('should handle docker-compose file read errors', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(dockerUtils.readComposeFile).mockImplementation(() => {
        throw new Error('Parse error')
      })

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('   ⚠️  Error reading compose file')
    })

    it('should filter worktrees when not showing all', async () => {
      const mockWorktrees = [
        {
          path: '/project',
          branch: 'main',
          head: 'abc123'
        },
        {
          path: '/project-feature',
          branch: 'feature',
          head: 'def456'
        }
      ]

      vi.mocked(gitUtils.listWorktrees).mockReturnValue(mockWorktrees)
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')

      // Don't use --all flag, should only show current branch
      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('→ main (main)')
      expect(consoleSpy).not.toHaveBeenCalledWith('  feature')
    })
  })

  describe('showDockerStatus', () => {
    beforeEach(() => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(true)
      vi.mocked(gitUtils.listWorktrees).mockReturnValue([])
      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])
    })

    it('should show running containers information', async () => {
      const mockContainers = [
        {
          id: 'container1',
          name: 'app_web_1',
          image: 'nginx:alpine',
          status: 'Up 5 minutes',
          ports: ['0.0.0.0:3000->80/tcp'],
          volumes: [],
          networks: []
        },
        {
          id: 'container2',
          name: 'wtcompose_api_1',
          image: 'node:16',
          status: 'Up 1 hour',
          ports: ['0.0.0.0:8080->8080/tcp'],
          volumes: [],
          networks: []
        }
      ]

      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue(mockContainers)
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('🐳 Docker Environment Status\n')
      expect(consoleSpy).toHaveBeenCalledWith('📦 Running Containers: 2')
      expect(consoleSpy).toHaveBeenCalledWith('📦 app_web_1')
      expect(consoleSpy).toHaveBeenCalledWith('   🏷️  Image: nginx:alpine')
      expect(consoleSpy).toHaveBeenCalledWith('   🔗 Status: Up 5 minutes')
      expect(consoleSpy).toHaveBeenCalledWith('   🔌 Ports: 0.0.0.0:3000->80/tcp')
      expect(consoleSpy).toHaveBeenCalledWith('🌿 wtcompose_api_1')
    })

    it('should show volumes information', async () => {
      const mockVolumes = [
        {
          name: 'project_data',
          driver: 'local',
          mountpoint: '/var/lib/docker/volumes/project_data'
        },
        {
          name: 'wtcompose_db_data',
          driver: 'local',
          mountpoint: '/var/lib/docker/volumes/wtcompose_db_data'
        }
      ]

      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue(mockVolumes)

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('🗂️  Total Volumes: 2')
      expect(consoleSpy).toHaveBeenCalledWith('🌿 WTCompose Volumes: 1')
      expect(consoleSpy).toHaveBeenCalledWith('   📁 wtcompose_db_data')
      expect(consoleSpy).toHaveBeenCalledWith('      Driver: local')
    })

    it('should show docker version information', async () => {
      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])
      vi.mocked(dockerUtils.execCommand)
        .mockReturnValueOnce('Docker version 20.10.17')
        .mockReturnValueOnce('docker-compose version 1.29.2')

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('🔧 Docker Information')
      expect(consoleSpy).toHaveBeenCalledWith('   Docker version 20.10.17')
      expect(consoleSpy).toHaveBeenCalledWith('   Docker Compose: 1.29.2')
    })

    it('should handle docker version command failure', async () => {
      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])
      vi.mocked(dockerUtils.execCommand).mockImplementation(() => {
        throw new Error('Docker not available')
      })

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Could not retrieve Docker version information')
    })

    it('should identify wtcompose containers by environment variables', async () => {
      // Mock process.env for testing
      const originalEnv = process.env
      process.env.WTCOMPOSE_PROJECT = 'test-project'

      const mockContainers = [
        {
          id: 'container1',
          name: 'test-project_web_1',
          image: 'nginx',
          status: 'Up',
          ports: [],
          volumes: [],
          networks: []
        }
      ]

      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue(mockContainers)
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('🌿 test-project_web_1')

      process.env = originalEnv
    })

    it('should show containers without ports correctly', async () => {
      const mockContainers = [
        {
          id: 'container1',
          name: 'db_container',
          image: 'postgres',
          status: 'Up',
          ports: [],
          volumes: [],
          networks: []
        }
      ]

      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue(mockContainers)
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])

      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('📦 db_container')
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('🔌 Ports'))
    })
  })

  describe('command options', () => {
    beforeEach(() => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(true)
      vi.mocked(gitUtils.listWorktrees).mockReturnValue([
        { path: '/project', branch: 'main', head: 'abc123' },
        { path: '/project-feature', branch: 'feature', head: 'def456' }
      ])
      vi.mocked(gitUtils.getCurrentBranch).mockReturnValue('main')
      vi.mocked(gitUtils.getGitRoot).mockReturnValue('/project')
      vi.mocked(dockerUtils.getRunningContainers).mockReturnValue([])
      vi.mocked(dockerUtils.getDockerVolumes).mockReturnValue([])
    })

    it('should show all worktrees with --all flag', async () => {
      await command.parseAsync(['--all'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('→ main (main)')
      expect(consoleSpy).toHaveBeenCalledWith('  feature')
    })

    it('should skip worktree status with --docker-only flag', async () => {
      await command.parseAsync(['--docker-only'], { from: 'user' })

      expect(consoleSpy).not.toHaveBeenCalledWith('📁 Git Worktrees Status\n')
      expect(consoleSpy).toHaveBeenCalledWith('🐳 Docker Environment Status\n')
    })

    it('should show both worktree and docker status by default', async () => {
      await command.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('📁 Git Worktrees Status\n')
      expect(consoleSpy).toHaveBeenCalledWith('🐳 Docker Environment Status\n')
    })
  })

  describe('error handling', () => {
    it('should handle git utilities throwing errors', async () => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(true)
      vi.mocked(gitUtils.listWorktrees).mockImplementation(() => {
        throw new Error('Git error')
      })

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(async () => {
        await command.parseAsync([], { from: 'user' })
      }).rejects.toThrow('process.exit called')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Git error')
      expect(mockExit).toHaveBeenCalledWith(1)

      mockExit.mockRestore()
    })

    it('should handle docker utilities throwing errors', async () => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(true)
      vi.mocked(gitUtils.listWorktrees).mockReturnValue([])
      vi.mocked(dockerUtils.getRunningContainers).mockImplementation(() => {
        throw new Error('Docker error')
      })

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(async () => {
        await command.parseAsync([], { from: 'user' })
      }).rejects.toThrow('process.exit called')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Docker error')
      expect(mockExit).toHaveBeenCalledWith(1)

      mockExit.mockRestore()
    })
  })
})