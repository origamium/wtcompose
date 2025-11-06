import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync } from 'fs-extra'
import * as path from 'node:path'
import { validateConfig, validateEnvVarName, suggestEnvVarName } from './validator'
import type { WTurboConfig } from './types'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  existsSync: vi.fn()
}))

describe('Config Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateConfig', () => {
    const configFile = '/test/wturbo.yaml'
    const configDir = '/test'

    beforeEach(() => {
      // Default mock behavior
      vi.mocked(existsSync).mockReturnValue(true)
    })

    it('should validate a complete valid configuration', () => {
      const validConfig: WTurboConfig = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: ['./env/prod.env', './env/dev.env'],
          adjust: {
            PORT: 3000,
            API_URL: 'http://localhost:8080',
            DEBUG: null
          }
        }
      }

      expect(() => validateConfig(validConfig, configFile)).not.toThrow()
    })

    it('should throw error when base_branch is missing', () => {
      const invalidConfig = {
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {}
        }
      } as any

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('base_branch must be a non-empty string')
    })

    it('should throw error when base_branch is empty string', () => {
      const invalidConfig: WTurboConfig = {
        base_branch: '',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {}
        }
      }

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('base_branch must be a non-empty string')
    })

    it('should throw error when docker_compose_file is missing', () => {
      const invalidConfig = {
        base_branch: 'main',
        env: {
          file: [],
          adjust: {}
        }
      } as any

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('docker_compose_file must be a non-empty string')
    })

    it('should throw error when docker_compose_file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const config: WTurboConfig = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {}
        }
      }

      expect(() => validateConfig(config, configFile))
        .toThrow('docker_compose_file not found: ./docker-compose.yaml')
    })

    it('should throw error when env section is missing', () => {
      const invalidConfig = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml'
      } as any

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('env section must be an object')
    })

    it('should throw error when env.file is not an array', () => {
      const invalidConfig: any = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: 'not-an-array',
          adjust: {}
        }
      }

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('env.file must be an array')
    })

    it('should throw error when env.file contains non-string values', () => {
      const invalidConfig: any = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: ['./valid.env', 123, './another.env'],
          adjust: {}
        }
      }

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('env.file[1] must be a string')
    })

    it('should log warning when env file does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      vi.mocked(existsSync).mockImplementation((path) => {
        if (path.toString().includes('.env')) return false
        return true
      })

      const config: WTurboConfig = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: ['./missing.env'],
          adjust: {}
        }
      }

      validateConfig(config, configFile)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Environment file not found'))
      
      consoleSpy.mockRestore()
    })

    it('should throw error when env.adjust is not an object', () => {
      const invalidConfig: any = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: 'not-an-object'
        }
      }

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('env.adjust must be an object')
    })

    it('should throw error when env.adjust contains invalid values', () => {
      const invalidConfig: any = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {
            VALID_NULL: null,
            VALID_STRING: 'hello',
            VALID_NUMBER: 123,
            INVALID_BOOL: true,
            INVALID_OBJECT: { key: 'value' }
          }
        }
      }

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow('env.adjust.INVALID_BOOL must be null, string, or number')
    })

    it('should allow null, string, and number values in env.adjust', () => {
      const validConfig: WTurboConfig = {
        base_branch: 'main',
        docker_compose_file: './docker-compose.yaml',
        env: {
          file: [],
          adjust: {
            NULL_VALUE: null,
            STRING_VALUE: 'test',
            NUMBER_VALUE: 42
          }
        }
      }

      expect(() => validateConfig(validConfig, configFile)).not.toThrow()
    })

    it('should handle multiple validation errors', () => {
      const invalidConfig = {
        base_branch: '',
        docker_compose_file: '',
        env: null
      } as any

      expect(() => validateConfig(invalidConfig, configFile))
        .toThrow(/Configuration validation failed/)
    })

    it('should resolve relative paths correctly', () => {
      const config: WTurboConfig = {
        base_branch: 'main',
        docker_compose_file: '../compose/docker-compose.yaml',
        env: {
          file: ['../../.env'],
          adjust: {}
        }
      }

      // Mock fs.existsSync to track the resolved paths
      const existsSyncMock = vi.mocked(existsSync).mockReturnValue(true)
      
      validateConfig(config, '/project/config/wturbo.yaml')
      
      // Check if paths were resolved relative to config directory
      expect(existsSyncMock).toHaveBeenCalledWith(
        expect.stringMatching(/compose\/docker-compose\.yaml$/)
      )
    })
  })

  describe('validateEnvVarName', () => {
    it('should return true for valid environment variable names', () => {
      expect(validateEnvVarName('NODE_ENV')).toBe(true)
      expect(validateEnvVarName('PORT')).toBe(true)
      expect(validateEnvVarName('API_KEY_SECRET')).toBe(true)
      expect(validateEnvVarName('DB_HOST_2')).toBe(true)
      expect(validateEnvVarName('A')).toBe(true)
      expect(validateEnvVarName('VERY_LONG_ENVIRONMENT_VARIABLE_NAME_123')).toBe(true)
    })

    it('should return false for invalid environment variable names', () => {
      expect(validateEnvVarName('node-env')).toBe(false) // Contains hyphen
      expect(validateEnvVarName('2_START_WITH_NUMBER')).toBe(false) // Starts with number
      expect(validateEnvVarName('lower_case')).toBe(false) // Not uppercase
      expect(validateEnvVarName('SPECIAL!CHAR')).toBe(false) // Contains special char
      expect(validateEnvVarName('SPACE NAME')).toBe(false) // Contains space
      expect(validateEnvVarName('')).toBe(false) // Empty string
      expect(validateEnvVarName('123')).toBe(false) // Only numbers
      expect(validateEnvVarName('_UNDERSCORE_START')).toBe(false) // Starts with underscore
    })

    it('should handle edge cases', () => {
      expect(validateEnvVarName('_')).toBe(false) // Just underscore
      expect(validateEnvVarName('__')).toBe(false) // Multiple underscores
      expect(validateEnvVarName('A_')).toBe(true) // Ends with underscore is ok
      expect(validateEnvVarName('A__B')).toBe(true) // Multiple underscores in middle is ok
    })
  })

  describe('suggestEnvVarName', () => {
    it('should convert lowercase to uppercase', () => {
      expect(suggestEnvVarName('node_env')).toBe('NODE_ENV')
      expect(suggestEnvVarName('api_key')).toBe('API_KEY')
      expect(suggestEnvVarName('database')).toBe('DATABASE')
    })

    it('should replace hyphens with underscores', () => {
      expect(suggestEnvVarName('node-env')).toBe('NODE_ENV')
      expect(suggestEnvVarName('api-key-secret')).toBe('API_KEY_SECRET')
      expect(suggestEnvVarName('my-var-name')).toBe('MY_VAR_NAME')
    })

    it('should handle names starting with numbers', () => {
      expect(suggestEnvVarName('123_var')).toBe('_123_VAR')
      expect(suggestEnvVarName('2factor')).toBe('_2FACTOR')
      expect(suggestEnvVarName('99_bottles')).toBe('_99_BOTTLES')
    })

    it('should remove special characters', () => {
      expect(suggestEnvVarName('my!var')).toBe('MY_VAR')
      expect(suggestEnvVarName('test@email')).toBe('TEST_EMAIL')
      expect(suggestEnvVarName('price$amount')).toBe('PRICE_AMOUNT')
      expect(suggestEnvVarName('node.env')).toBe('NODE_ENV')
    })

    it('should handle spaces', () => {
      expect(suggestEnvVarName('my var')).toBe('MY_VAR')
      expect(suggestEnvVarName('test  multiple   spaces')).toBe('TEST_MULTIPLE_SPACES')
      expect(suggestEnvVarName(' leading space')).toBe('LEADING_SPACE')
      expect(suggestEnvVarName('trailing space ')).toBe('TRAILING_SPACE')
    })

    it('should remove duplicate underscores', () => {
      expect(suggestEnvVarName('my__var')).toBe('MY_VAR')
      expect(suggestEnvVarName('test___name')).toBe('TEST_NAME')
      expect(suggestEnvVarName('a____b')).toBe('A_B')
    })

    it('should remove leading and trailing underscores', () => {
      expect(suggestEnvVarName('_leading')).toBe('LEADING')
      expect(suggestEnvVarName('trailing_')).toBe('TRAILING')
      expect(suggestEnvVarName('___both___')).toBe('BOTH')
      expect(suggestEnvVarName('_')).toBe('')
      expect(suggestEnvVarName('___')).toBe('')
    })

    it('should handle mixed cases', () => {
      expect(suggestEnvVarName('camelCase')).toBe('CAMELCASE')
      expect(suggestEnvVarName('PascalCase')).toBe('PASCALCASE')
      expect(suggestEnvVarName('MiXeD_CaSe')).toBe('MIXED_CASE')
    })

    it('should handle complex scenarios', () => {
      expect(suggestEnvVarName('123-my$var@name!')).toBe('_123_MY_VAR_NAME')
      expect(suggestEnvVarName('__test--multiple___issues__')).toBe('TEST_MULTIPLE_ISSUES')
      expect(suggestEnvVarName('  spaces  and-hyphens_and_underscores  ')).toBe('SPACES_AND_HYPHENS_AND_UNDERSCORES')
    })

    it('should handle unicode and non-ASCII characters', () => {
      expect(suggestEnvVarName('café')).toBe('CAF')
      expect(suggestEnvVarName('日本語')).toBe('')
      expect(suggestEnvVarName('test_日本_var')).toBe('TEST_VAR')
    })

    it('should return empty string for completely invalid input', () => {
      expect(suggestEnvVarName('!@#$%')).toBe('')
      expect(suggestEnvVarName('___')).toBe('')
      expect(suggestEnvVarName('   ')).toBe('')
    })
  })
})