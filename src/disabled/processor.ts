import * as fs from "fs-extra"
import * as path from "node:path"
import { EnvFileEntry } from "../config/types.js"

/**
 * Parse .env file into key-value pairs
 */
export function parseEnvFile(filePath: string): EnvFileEntry[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, "utf-8")
  const entries: EnvFileEntry[] = []

  content.split("
").forEach((line, lineNumber) => {
    const trimmedLine = line.trim()
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return
    }

    // Parse KEY=VALUE format
    const equalIndex = trimmedLine.indexOf("=")
    if (equalIndex === -1) {
      console.log(`⚠️  Invalid env line at ${path.basename(filePath)}:${lineNumber + 1}: ${line}`)
      return
    }

    const key = trimmedLine.substring(0, equalIndex).trim()
    const value = trimmedLine.substring(equalIndex + 1).trim()

    // Remove quotes if present
    const cleanValue = removeQuotes(value)

    entries.push({
      key,
      value: cleanValue,
      originalValue: cleanValue
    })
  })

  return entries
}

/**
 * Write environment entries back to .env file
 */
export function writeEnvFile(filePath: string, entries: EnvFileEntry[]): void {
  const lines: string[] = []

  // If file exists, preserve comments and empty lines
  if (fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, "utf-8")
    const existingLines = existingContent.split("
")
    const entryMap = new Map(entries.map(e => [e.key, e]))

    existingLines.forEach(line => {
      const trimmedLine = line.trim()
      
      // Preserve comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        lines.push(line)
        return
      }

      // Check if this is a key-value line
      const equalIndex = trimmedLine.indexOf("=")
      if (equalIndex === -1) {
        lines.push(line)
        return
      }

      const key = trimmedLine.substring(0, equalIndex).trim()
      const entry = entryMap.get(key)
      
      if (entry) {
        lines.push(`${key}=${needsQuotes(entry.value) ? `"${entry.value}"` : entry.value}`)
        entryMap.delete(key) // Mark as processed
      } else {
        lines.push(line) // Keep original line if no adjustment
      }
    })

    // Add any new entries that weren't in the original file
    entryMap.forEach(entry => {
      lines.push(`${entry.key}=${needsQuotes(entry.value) ? `"${entry.value}"` : entry.value}`)
    })
  } else {
    // Create new file
    entries.forEach(entry => {
      lines.push(`${entry.key}=${needsQuotes(entry.value) ? `"${entry.value}"` : entry.value}`)
    })
  }

  fs.writeFileSync(filePath, lines.join("
") + "
")
}

/**
 * Remove quotes from value if present
 */
function removeQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Check if value needs quotes
 */
function needsQuotes(value: string): boolean {
  // Need quotes if contains spaces, special characters, or is empty
  return value.includes(" ") || 
         value.includes("	") || 
         value.includes("
") || 
         value.includes("#") || 
         value === "" ||
         /[<>|&;(){}\[\]$`]/.test(value)
}

/**
 * Backup environment file
 */
export function backupEnvFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${filePath}.backup.${timestamp}`
  
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

/**
 * Restore environment file from backup
 */
export function restoreEnvFile(backupPath: string, originalPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }

  fs.copyFileSync(backupPath, originalPath)
  fs.removeSync(backupPath)
}