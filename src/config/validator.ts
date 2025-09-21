import * as fs from "fs-extra"
import * as path from "node:path"
import { WTurboConfig } from "./types.js"

/**
 * Validate WTurbo configuration
 */
export function validateConfig(config: WTurboConfig, configFile: string): void {
  const errors: string[] = []
  const configDir = path.dirname(configFile)

  // Validate base_branch
  if (!config.base_branch || typeof config.base_branch !== "string") {
    errors.push("base_branch must be a non-empty string")
  }

  // Validate docker_compose_file
  if (!config.docker_compose_file || typeof config.docker_compose_file !== "string") {
    errors.push("docker_compose_file must be a non-empty string")
  } else {
    const composePath = path.resolve(configDir, config.docker_compose_file)
    if (!fs.existsSync(composePath)) {
      errors.push(`docker_compose_file not found: ${config.docker_compose_file}`)
    }
  }

  // Validate env section
  if (!config.env || typeof config.env !== "object") {
    errors.push("env section must be an object")
  } else {
    // Validate env.file
    if (!Array.isArray(config.env.file)) {
      errors.push("env.file must be an array")
    } else {
      config.env.file.forEach((envFile, index) => {
        if (typeof envFile !== "string") {
          errors.push(`env.file[${index}] must be a string`)
        } else {
          const envPath = path.resolve(configDir, envFile)
          if (!fs.existsSync(envPath)) {
            console.log(`⚠️  Environment file not found: ${envFile}`)
          }
        }
      })
    }

    // Validate env.adjust
    if (config.env.adjust && typeof config.env.adjust !== "object") {
      errors.push("env.adjust must be an object")
    } else if (config.env.adjust) {
      Object.entries(config.env.adjust).forEach(([key, value]) => {
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          errors.push(`env.adjust.${key} must be null, string, or number`)
        }
      })
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\\n${errors.map(e => `  - ${e}`).join("\\n")}`)
  }
}

/**
 * Validate environment variable name
 */
export function validateEnvVarName(name: string): boolean {
  // Environment variable names should be uppercase letters, numbers, and underscores
  return /^[A-Z][A-Z0-9_]*$/.test(name)
}

/**
 * Suggest corrections for invalid environment variable names
 */
export function suggestEnvVarName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/^([0-9])/, "_$1") // Can't start with number
    .replace(/_+/g, "_") // Remove duplicate underscores
    .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
}