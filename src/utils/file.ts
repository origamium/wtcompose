/**
 * @fileoverview ファイル操作ユーティリティ
 * ファイルの読み書きやパス操作などの汎用的なファイル操作を担当
 */

import * as fs from 'fs-extra'
import * as path from 'node:path'
import type { FileOperationOptions } from '../types/index.js'
import { FILE_ENCODING, BACKUP_EXTENSION } from '../constants/index.js'

/**
 * ファイルの存在をチェック
 * 
 * @param filePath - チェックするファイルパス
 * @returns ファイルが存在する場合true
 * 
 * @example
 * ```typescript
 * if (fileExists('./config.json')) {
 *   console.log('Config file found')
 * }
 * ```
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * ディレクトリの存在をチェック
 * 
 * @param dirPath - チェックするディレクトリパス
 * @returns ディレクトリが存在する場合true
 * 
 * @example
 * ```typescript
 * if (directoryExists('./src')) {
 *   console.log('Source directory found')
 * }
 * ```
 */
export function directoryExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

/**
 * ディレクトリを再帰的に作成
 * 
 * @param dirPath - 作成するディレクトリパス
 * @throws {Error} ディレクトリの作成に失敗した場合
 * 
 * @example
 * ```typescript
 * ensureDirectory('./path/to/nested/dir')
 * ```
 */
export function ensureDirectory(dirPath: string): void {
  try {
    fs.mkdirpSync(dirPath)
  } catch (error: any) {
    throw new Error(`Failed to create directory: ${dirPath}\n${error.message}`)
  }
}

/**
 * ファイルを安全に読み込み（存在チェック付き）
 * 
 * @param filePath - 読み込むファイルパス
 * @param options - ファイル操作オプション
 * @returns ファイルの内容
 * @throws {Error} ファイルが存在しないか読み込みに失敗した場合
 * 
 * @example
 * ```typescript
 * try {
 *   const content = readFileIfExists('./config.json')
 *   console.log('Config:', JSON.parse(content))
 * } catch (error) {
 *   console.error('Failed to read config:', error.message)
 * }
 * ```
 */
export function readFileIfExists(filePath: string, options?: FileOperationOptions): string {
  if (!fileExists(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  try {
    return fs.readFileSync(filePath, {
      encoding: options?.encoding || FILE_ENCODING
    })
  } catch (error: any) {
    throw new Error(`Failed to read file: ${filePath}\n${error.message}`)
  }
}

/**
 * ファイルを安全に書き込み（ディレクトリ作成付き）
 * 
 * @param filePath - 書き込むファイルパス
 * @param content - 書き込む内容
 * @param options - ファイル操作オプション
 * @throws {Error} 書き込みに失敗した場合
 * 
 * @example
 * ```typescript
 * writeFileEnsureDir('./output/result.txt', 'Hello World', { createBackup: true })
 * ```
 */
export function writeFileEnsureDir(
  filePath: string, 
  content: string, 
  options?: FileOperationOptions
): void {
  try {
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(filePath)
    if (!directoryExists(dir)) {
      ensureDirectory(dir)
    }

    // バックアップ作成（オプション）
    if (options?.createBackup && fileExists(filePath)) {
      const backupPath = `${filePath}${BACKUP_EXTENSION}`
      fs.copyFileSync(filePath, backupPath)
    }

    fs.writeFileSync(filePath, content, {
      encoding: options?.encoding || FILE_ENCODING
    })
  } catch (error: any) {
    throw new Error(`Failed to write file: ${filePath}\n${error.message}`)
  }
}

/**
 * ファイルをコピー（ディレクトリ作成付き）
 * 
 * @param sourcePath - コピー元ファイルパス
 * @param targetPath - コピー先ファイルパス
 * @param options - ファイル操作オプション
 * @throws {Error} コピーに失敗した場合
 * 
 * @example
 * ```typescript
 * copyFile('./template.yaml', './output/config.yaml')
 * ```
 */
export function copyFile(
  sourcePath: string, 
  targetPath: string, 
  options?: FileOperationOptions
): void {
  if (!fileExists(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`)
  }

  try {
    // ターゲットディレクトリが存在しない場合は作成
    const targetDir = path.dirname(targetPath)
    if (!directoryExists(targetDir)) {
      ensureDirectory(targetDir)
    }

    // バックアップ作成（オプション）
    if (options?.createBackup && fileExists(targetPath)) {
      const backupPath = `${targetPath}${BACKUP_EXTENSION}`
      fs.copyFileSync(targetPath, backupPath)
    }

    fs.copyFileSync(sourcePath, targetPath)
  } catch (error: any) {
    throw new Error(`Failed to copy file: ${sourcePath} -> ${targetPath}\n${error.message}`)
  }
}

/**
 * 一時ファイルのパスを生成
 * 
 * @param prefix - ファイル名のプレフィックス（デフォルト: 'temp'）
 * @param extension - ファイル拡張子（デフォルト: '.tmp'）
 * @returns 一時ファイルのパス
 * 
 * @example
 * ```typescript
 * const tempFile = generateTempFilePath('config', '.yaml')
 * console.log(tempFile) // /tmp/config-1234567890.yaml
 * ```
 */
export function generateTempFilePath(prefix: string = 'temp', extension: string = '.tmp'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const fileName = `${prefix}-${timestamp}-${random}${extension}`
  
  return path.join(process.platform === 'win32' ? process.env.TEMP || 'C:\\temp' : '/tmp', fileName)
}

/**
 * ファイルサイズを取得（人間が読みやすい形式）
 * 
 * @param filePath - ファイルパス
 * @returns ファイルサイズの文字列表現
 * @throws {Error} ファイルが存在しない場合
 * 
 * @example
 * ```typescript
 * const size = getFileSize('./large-file.txt')
 * console.log(`File size: ${size}`) // "File size: 1.5 MB"
 * ```
 */
export function getFileSize(filePath: string): string {
  if (!fileExists(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stats = fs.statSync(filePath)
  const bytes = stats.size
  
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * ファイルの最終更新日時を取得
 * 
 * @param filePath - ファイルパス
 * @returns 最終更新日時
 * @throws {Error} ファイルが存在しない場合
 * 
 * @example
 * ```typescript
 * const mtime = getFileModificationTime('./config.json')
 * console.log(`Last modified: ${mtime.toISOString()}`)
 * ```
 */
export function getFileModificationTime(filePath: string): Date {
  if (!fileExists(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stats = fs.statSync(filePath)
  return stats.mtime
}

/**
 * パスが絶対パスかどうかをチェック
 * 
 * @param filePath - チェックするパス
 * @returns 絶対パスの場合true
 * 
 * @example
 * ```typescript
 * console.log(isAbsolutePath('/usr/local/bin')) // true
 * console.log(isAbsolutePath('./relative/path')) // false
 * ```
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath)
}

/**
 * 相対パスを絶対パスに変換
 * 
 * @param filePath - 変換するパス
 * @param basePath - ベースパス（デフォルト: 現在のディレクトリ）
 * @returns 絶対パス
 * 
 * @example
 * ```typescript
 * const absolutePath = resolveAbsolutePath('./config.json')
 * console.log(absolutePath) // /current/directory/config.json
 * ```
 */
export function resolveAbsolutePath(filePath: string, basePath?: string): string {
  if (isAbsolutePath(filePath)) {
    return filePath
  }
  
  const base = basePath || process.cwd()
  return path.resolve(base, filePath)
}