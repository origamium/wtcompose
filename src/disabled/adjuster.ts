import { EnvAdjustValue, EnvFileEntry } from "../config/types.js"
import { getUsedPorts } from "../utils/docker.js"

/**
 * Adjust environment variable value based on configuration
 */
export function adjustEnvValue(
  key: string,
  originalValue: string,
  adjustConfig: EnvAdjustValue,
  usedPorts: number[] = []
): string {
  // If no adjustment configured, return original
  if (adjustConfig === undefined) {
    return originalValue
  }

  // Auto-detect and adjust
  if (adjustConfig === null) {
    return autoAdjustValue(key, originalValue, usedPorts)
  }

  // Use specific adjustment value
  if (typeof adjustConfig === "number") {
    return adjustNumericValue(originalValue, adjustConfig, usedPorts)
  }

  if (typeof adjustConfig === "string") {
    return adjustStringValue(originalValue, adjustConfig)
  }

  return originalValue
}

/**
 * Auto-detect value type and adjust accordingly
 */
function autoAdjustValue(key: string, value: string, usedPorts: number[]): string {
  // Detect port numbers
  if (isPortValue(value)) {
    const port = parseInt(value, 10)
    return findAvailablePort(port, usedPorts).toString()
  }

  // Detect URLs
  if (isUrlValue(value)) {
    return adjustUrlValue(value, usedPorts)
  }

  // Detect numeric values
  if (isNumericValue(value)) {
    const num = parseInt(value, 10)
    return incrementNumber(num).toString()
  }

  // Detect strings with incremental suffixes
  if (hasIncrementalSuffix(value)) {
    return incrementString(value)
  }

  // Default: append suffix for uniqueness
  return `${value}-wt${generateRandomSuffix()}`
}

/**
 * Adjust numeric value (typically for ports)
 */
function adjustNumericValue(originalValue: string, targetValue: number, usedPorts: number[]): string {
  if (isPortValue(originalValue)) {
    return findAvailablePort(targetValue, usedPorts).toString()
  }
  
  if (isNumericValue(originalValue)) {
    return targetValue.toString()
  }

  // If original is URL, replace port
  if (isUrlValue(originalValue)) {
    return replaceUrlPort(originalValue, targetValue)
  }

  return targetValue.toString()
}

/**
 * Adjust string value
 */
function adjustStringValue(originalValue: string, targetValue: string): string {
  // If original is URL and target is URL, use target
  if (isUrlValue(originalValue) && isUrlValue(targetValue)) {
    return targetValue
  }

  // If original has incremental suffix, replace it
  if (hasIncrementalSuffix(originalValue)) {
    return targetValue
  }

  return targetValue
}

/**
 * Check if value represents a port number
 */
function isPortValue(value: string): boolean {
  const num = parseInt(value, 10)
  return !isNaN(num) && num > 0 && num <= 65535 && value === num.toString()
}

/**
 * Check if value is a URL
 */
function isUrlValue(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return /^https?:\/\//.test(value) || 
           /^(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/.test(value)
  }
}

/**
 * Check if value is numeric
 */
function isNumericValue(value: string): boolean {
  const num = parseInt(value, 10)
  return !isNaN(num) && value === num.toString()
}

/**
 * Check if string has incremental suffix like "app-1", "myservice_2"
 */
function hasIncrementalSuffix(value: string): boolean {
  return /[-_]\d+$/.test(value)
}

/**
 * Find available port starting from given port
 */
function findAvailablePort(startPort: number, usedPorts: number[]): number {
  let port = startPort
  while (usedPorts.includes(port)) {
    port++
    // Avoid system ports and common service ports
    if (port > 65535) {
      throw new Error(`No available ports found starting from ${startPort}`)
    }
    if (port < 1024) {
      port = 1024
    }
  }
  return port
}

/**
 * Adjust URL by finding available port
 */
function adjustUrlValue(url: string, usedPorts: number[]): string {
  const portMatch = url.match(/:(\d+)/)
  if (!portMatch) {
    return url
  }

  const currentPort = parseInt(portMatch[1], 10)
  const newPort = findAvailablePort(currentPort, usedPorts)
  
  return url.replace(`:${currentPort}`, `:${newPort}`)
}

/**
 * Replace port in URL
 */
function replaceUrlPort(url: string, newPort: number): string {
  const portMatch = url.match(/:(\d+)/)
  if (portMatch) {
    return url.replace(`:${portMatch[1]}`, `:${newPort}`)
  }
  
  // Add port if not present
  if (url.includes("://")) {
    const [protocol, rest] = url.split("://")
    const [host, ...pathParts] = rest.split("/")
    return `${protocol}://${host}:${newPort}${pathParts.length > 0 ? "/" + pathParts.join("/") : ""}`
  }
  
  return `${url}:${newPort}`
}

/**
 * Increment numeric value
 */
function incrementNumber(num: number): number {
  return num + 1
}

/**
 * Increment string with suffix
 */
function incrementString(value: string): string {
  const match = value.match(/^(.+?)[-_](\d+)$/)
  if (match) {
    const [, base, numStr] = match
    const num = parseInt(numStr, 10)
    const separator = value.includes("-") ? "-" : "_"
    return `${base}${separator}${num + 1}`
  }
  
  // Add initial suffix
  return `${value}-2`
}

/**
 * Generate random suffix for uniqueness
 */
function generateRandomSuffix(): string {
  return Math.random().toString(36).substring(2, 6)
}

/**
 * Process all environment files with adjustments
 */
export async function processEnvironmentFiles(
  envFiles: string[],
  adjustConfig: Record<string, EnvAdjustValue>
): Promise<{ [filePath: string]: EnvFileEntry[] }> {
  const usedPorts = getUsedPorts()
  const result: { [filePath: string]: EnvFileEntry[] } = {}

  for (const filePath of envFiles) {
    try {
      const { parseEnvFile } = await import("./processor.js")
      const entries = parseEnvFile(filePath)

      // Apply adjustments
      const adjustedEntries = entries.map(entry => {
        if (adjustConfig[entry.key] !== undefined) {
          const adjustedValue = adjustEnvValue(
            entry.key,
            entry.originalValue,
            adjustConfig[entry.key],
            usedPorts
          )
          
          return {
            ...entry,
            value: adjustedValue
          }
        }
        return entry
      })

      result[filePath] = adjustedEntries
    } catch (error: any) {
      console.log(`⚠️  Failed to process ${filePath}: ${error.message}`)
      result[filePath] = []
    }
  }

  return result
}