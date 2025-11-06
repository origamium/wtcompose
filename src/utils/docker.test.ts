import { describe, it, expect, beforeEach, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs-extra'
import { parse, stringify } from 'yaml'
import {
  execCommand,
  getRunningContainers,
  getContainerVolumes,
  getContainerNetworks,
  getDockerVolumes,
  getUsedPorts,
  findAvailablePort,
  readComposeFile,
  writeComposeFile,
  adjustPortsInCompose
} from './docker'
import type { ComposeConfig } from './docker'

// Mock dependencies
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}))
vi.mock('fs-extra', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn()
}))
vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn()
}))

describe('Docker Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('execCommand', () => {
    it('should execute command successfully', () => {
      const mockOutput = 'command output'
      vi.mocked(execSync).mockReturnValue(`${mockOutput}\n`)

      const result = execCommand('docker ps')

      expect(execSync).toHaveBeenCalledWith('docker ps', {
        encoding: 'utf-8',
        stdio: 'pipe'
      })
      expect(result).toBe(mockOutput)
    })

    it('should execute command with cwd option', () => {
      const mockOutput = 'output'
      vi.mocked(execSync).mockReturnValue((mockOutput))

      execCommand('ls', { cwd: '/test/dir' })

      expect(execSync).toHaveBeenCalledWith('ls', {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: '/test/dir'
      })
    })

    it('should throw error when command fails', () => {
      const error = new Error('Command failed')
      vi.mocked(execSync).mockImplementation(() => {
        throw error
      })

      expect(() => execCommand('invalid-command'))
        .toThrow('Command failed: invalid-command')
    })

    it('should trim output whitespace', () => {
      vi.mocked(execSync).mockReturnValue(('  output with spaces  \n\t'))

      const result = execCommand('test')

      expect(result).toBe('output with spaces')
    })
  })

  describe('getRunningContainers', () => {
    it('should return list of running containers', () => {
      const mockOutput = `id1|name1|image1|0.0.0.0:3000->80/tcp|Up 5 minutes
id2|name2|image2|0.0.0.0:5432->5432/tcp|Up 1 hour`

      vi.mocked(execSync).mockReturnValueOnce((mockOutput))
      
      // Mock getContainerVolumes and getContainerNetworks
      vi.mocked(execSync)
        .mockReturnValueOnce(('/data:/app/data,/logs:/app/logs'))
        .mockReturnValueOnce(('bridge,custom-network'))
        .mockReturnValueOnce(('/var/lib/volume:/app/volume'))
        .mockReturnValueOnce(('custom-network'))

      const containers = getRunningContainers()

      expect(containers).toHaveLength(2)
      expect(containers[0]).toEqual({
        id: 'id1',
        name: 'name1',
        image: 'image1',
        ports: ['0.0.0.0:3000->80/tcp'],
        volumes: ['/data:/app/data', '/logs:/app/logs'],
        networks: ['bridge', 'custom-network'],
        status: 'Up 5 minutes'
      })
    })

    it('should return empty array when no containers are running', () => {
      vi.mocked(execSync).mockReturnValue((''))

      const containers = getRunningContainers()

      expect(containers).toEqual([])
    })

    it('should handle command failure gracefully', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Docker not running')
      })

      const containers = getRunningContainers()

      expect(containers).toEqual([])
    })

    it('should parse container info with empty ports', () => {
      const mockOutput = 'id1|name1|image1||Up 5 minutes'
      vi.mocked(execSync).mockReturnValueOnce((mockOutput))
        .mockReturnValueOnce((''))
        .mockReturnValueOnce((''))

      const containers = getRunningContainers()

      expect(containers[0].ports).toEqual([])
    })
  })

  describe('getContainerVolumes', () => {
    it('should return container volumes', () => {
      const mockOutput = '/host/data:/container/data,/host/logs:/container/logs'
      vi.mocked(execSync).mockReturnValue((mockOutput))

      const volumes = getContainerVolumes('container-id')

      expect(volumes).toEqual(['/host/data:/container/data', '/host/logs:/container/logs'])
    })

    it('should return empty array when no volumes', () => {
      vi.mocked(execSync).mockReturnValue((''))

      const volumes = getContainerVolumes('container-id')

      expect(volumes).toEqual([])
    })

    it('should handle command failure gracefully', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Container not found')
      })

      const volumes = getContainerVolumes('invalid-id')

      expect(volumes).toEqual([])
    })
  })

  describe('getContainerNetworks', () => {
    it('should return container networks', () => {
      const mockOutput = 'bridge,custom-network,app-network'
      vi.mocked(execSync).mockReturnValue((mockOutput))

      const networks = getContainerNetworks('container-id')

      expect(networks).toEqual(['bridge', 'custom-network', 'app-network'])
    })

    it('should filter out empty network names', () => {
      const mockOutput = 'bridge,,custom-network,'
      vi.mocked(execSync).mockReturnValue((mockOutput))

      const networks = getContainerNetworks('container-id')

      expect(networks).toEqual(['bridge', 'custom-network'])
    })
  })

  describe('getDockerVolumes', () => {
    it('should return list of Docker volumes', () => {
      const mockOutput = `vol1|/var/lib/docker/volumes/vol1|local
vol2|/var/lib/docker/volumes/vol2|local`

      vi.mocked(execSync).mockReturnValue((mockOutput))

      const volumes = getDockerVolumes()

      expect(volumes).toEqual([
        { name: 'vol1', mountpoint: '/var/lib/docker/volumes/vol1', driver: 'local' },
        { name: 'vol2', mountpoint: '/var/lib/docker/volumes/vol2', driver: 'local' }
      ])
    })

    it('should return empty array when no volumes exist', () => {
      vi.mocked(execSync).mockReturnValue((''))

      const volumes = getDockerVolumes()

      expect(volumes).toEqual([])
    })
  })

  describe('getUsedPorts', () => {
    it('should extract ports from running containers', () => {
      const mockOutput = `id1|name1|image1|0.0.0.0:3000->80/tcp,0.0.0.0:3001->443/tcp|Up
id2|name2|image2|0.0.0.0:5432->5432/tcp|Up`

      vi.mocked(execSync)
        .mockReturnValueOnce((mockOutput))
        .mockReturnValue(('')) // For volume and network calls

      const ports = getUsedPorts()

      expect(ports).toEqual([3000, 3001, 5432])
    })

    it('should handle containers with no exposed ports', () => {
      const mockOutput = 'id1|name1|image1||Up'
      vi.mocked(execSync)
        .mockReturnValueOnce((mockOutput))
        .mockReturnValue((''))

      const ports = getUsedPorts()

      expect(ports).toEqual([])
    })

    it('should handle malformed port mappings', () => {
      const mockOutput = 'id1|name1|image1|invalid-port-format|Up'
      vi.mocked(execSync)
        .mockReturnValueOnce((mockOutput))
        .mockReturnValue((''))

      const ports = getUsedPorts()

      expect(ports).toEqual([])
    })
  })

  describe('findAvailablePort', () => {
    it('should return base port when not in use', () => {
      const usedPorts = [3000, 3002, 3003]
      const availablePort = findAvailablePort(3001, usedPorts)

      expect(availablePort).toBe(3001)
    })

    it('should increment port when base port is in use', () => {
      const usedPorts = [3000, 3001, 3002]
      const availablePort = findAvailablePort(3000, usedPorts)

      expect(availablePort).toBe(3003)
    })

    it('should find first available port in sequence', () => {
      const usedPorts = [3000, 3001, 3003, 3004]
      const availablePort = findAvailablePort(3000, usedPorts)

      expect(availablePort).toBe(3002)
    })

    it('should handle empty used ports array', () => {
      const availablePort = findAvailablePort(8080, [])

      expect(availablePort).toBe(8080)
    })
  })

  describe('readComposeFile', () => {
    it('should read and parse docker-compose file', () => {
      const mockComposeContent = `
version: '3.8'
services:
  web:
    image: nginx
    ports:
      - "3000:80"
`
      const expectedConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['3000:80']
          }
        }
      }

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockComposeContent)
      vi.mocked(parse).mockReturnValue(expectedConfig)

      const config = readComposeFile('/path/to/docker-compose.yml')

      expect(readFileSync).toHaveBeenCalledWith('/path/to/docker-compose.yml', 'utf-8')
      expect(parse).toHaveBeenCalledWith(mockComposeContent)
      expect(config).toEqual(expectedConfig)
    })

    it('should throw error when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      expect(() => readComposeFile('/nonexistent/docker-compose.yml'))
        .toThrow('Docker Compose file not found: /nonexistent/docker-compose.yml')
    })

    it('should handle YAML parsing errors', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('invalid: yaml: content:')
      vi.mocked(parse).mockImplementation(() => {
        throw new Error('YAML parsing failed')
      })

      expect(() => readComposeFile('/path/to/invalid.yml'))
        .toThrow('YAML parsing failed')
    })
  })

  describe('writeComposeFile', () => {
    it('should write compose configuration to file', () => {
      const config = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['3000:80']
          }
        }
      }
      const expectedYaml = 'version: 3.8\nservices:\n  web:\n    image: nginx'

      vi.mocked(stringify).mockReturnValue(expectedYaml)

      writeComposeFile('/path/to/output.yml', config)

      expect(stringify).toHaveBeenCalledWith(config)
      expect(writeFileSync).toHaveBeenCalledWith('/path/to/output.yml', expectedYaml, 'utf-8')
    })

    it('should handle write errors', () => {
      const config = { version: '3.8', services: {} }
      vi.mocked(stringify).mockReturnValue('version: 3.8')
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(() => writeComposeFile('/readonly/file.yml', config))
        .toThrow('Permission denied')
    })
  })

  describe('adjustPortsInCompose', () => {
    it('should adjust conflicting ports in compose configuration', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['3000:80', '3001:443']
          },
          api: {
            image: 'node',
            ports: ['8080:8080']
          }
        }
      }
      const usedPorts = [3000, 8080]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      expect(adjustedConfig.services.web.ports).toEqual(['3001:80', '3002:443'])
      expect(adjustedConfig.services.api.ports).toEqual(['8081:8080'])
    })

    it('should not modify ports that are not in use', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['5000:80', '5001:443']
          }
        }
      }
      const usedPorts = [3000, 3001]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      expect(adjustedConfig.services.web.ports).toEqual(['5000:80', '5001:443'])
    })

    it('should handle services without ports', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          db: {
            image: 'postgres'
          }
        }
      }
      const usedPorts = [3000]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      expect(adjustedConfig.services.db).not.toHaveProperty('ports')
    })

    it('should handle complex port mapping formats', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['127.0.0.1:3000:80', '3000:80', 'invalid-format']
          }
        }
      }
      const usedPorts = [3000]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      expect(adjustedConfig.services.web.ports).toEqual([
        '127.0.0.1:3000:80', // Complex format preserved
        '3001:80',           // Simple format adjusted
        'invalid-format'     // Invalid format preserved
      ])
    })

    it('should create deep copy of original config', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['3000:80']
          }
        }
      }
      const usedPorts = [3000]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      // Modify adjusted config
      adjustedConfig.services.web.image = 'apache'

      // Original should be unchanged
      expect(config.services.web.image).toBe('nginx')
    })

    it('should update used ports array during adjustment', () => {
      const config: ComposeConfig = {
        version: '3.8',
        services: {
          web: {
            image: 'nginx',
            ports: ['3000:80']
          },
          api: {
            image: 'node',
            ports: ['3000:8080'] // Same port as web
          }
        }
      }
      const usedPorts = [3000]

      const adjustedConfig = adjustPortsInCompose(config, usedPorts)

      // Both services should get different ports
      expect(adjustedConfig.services.web.ports).toEqual(['3001:80'])
      expect(adjustedConfig.services.api.ports).toEqual(['3002:8080'])
    })
  })
})