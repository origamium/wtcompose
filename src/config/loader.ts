import * as fs from "fs-extra"
import * as path from "node:path"
import * as yaml from "yaml"
import { DEFAULT_CONFIG, WTurboConfig } from "./types.js"
import { validateConfig } from "./validator.js"

const CONFIG_FILE_NAMES = ["wturbo.yaml", "wturbo.yml", ".wturbo.yaml", ".wturbo.yml"]

/**
 * Load WTurbo configuration from project root
 */
export function loadConfig(projectRoot?: string): WTurboConfig {
  const searchRoot = projectRoot || process.cwd()
  
  // Search for config file
  const configFile = findConfigFile(searchRoot)
  
  if (!configFile) {
    console.log("⚠️  No wturbo.yaml found, using default configuration")
    return DEFAULT_CONFIG
  }

  try {
    console.log(`📋 Loading configuration from: ${path.relative(searchRoot, configFile)}`)
    const configContent = fs.readFileSync(configFile, "utf-8")
    const config = yaml.parse(configContent) as WTurboConfig
    
    // Merge with defaults
    const mergedConfig = mergeWithDefaults(config)
    
    // Validate configuration
    validateConfig(mergedConfig, configFile)
    
    return mergedConfig
  } catch (error: any) {
    throw new Error(`Failed to load configuration from ${configFile}: ${error.message}`)
  }
}

/**
 * Find configuration file in project root
 */
function findConfigFile(projectRoot: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(projectRoot, fileName)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

/**
 * Merge loaded config with defaults
 */
function mergeWithDefaults(config: Partial<WTurboConfig>): WTurboConfig {
  return {
    base_branch: config.base_branch || DEFAULT_CONFIG.base_branch,
    docker_compose_file: config.docker_compose_file || DEFAULT_CONFIG.docker_compose_file,
    env: {
      file: config.env?.file || DEFAULT_CONFIG.env.file,
      adjust: config.env?.adjust || DEFAULT_CONFIG.env.adjust
    }
  }
}

/**
 * Check if configuration file exists
 */
export function hasConfigFile(projectRoot?: string): boolean {
  const searchRoot = projectRoot || process.cwd()
  return findConfigFile(searchRoot) !== null
}

/**
 * Get configuration file path if exists
 */
export function getConfigFilePath(projectRoot?: string): string | null {
  const searchRoot = projectRoot || process.cwd()
  return findConfigFile(searchRoot)
}

/**
 * Create a default configuration file
 */
export function createDefaultConfig(projectRoot?: string): string {
  const searchRoot = projectRoot || process.cwd()
  const configPath = path.join(searchRoot, "wturbo.yaml")
  
  const defaultConfigYaml = `# WTurbo Configuration
base_branch: main
docker_compose_file: ./docker-compose.yaml

env:
  file:
    - ./.env
  adjust:
    # Port adjustments (null = auto-detect and increment)
    # FRONTEND_PORT: null
    # BACKEND_PORT: null
    
    # URL adjustments  
    # FRONTEND_URL: "http://localhost:3000"
    # BACKEND_URL: "http://localhost:8000"
    
    # String adjustments
    # APP_NAME: "myapp"
`

  fs.writeFileSync(configPath, defaultConfigYaml)
  return configPath
}