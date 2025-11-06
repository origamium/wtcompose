/**
 * @fileoverview 環境変数ファイル処理
 * .envファイルの読み込み、書き込み、値の調整を担当
 */

import * as fs from 'fs-extra'
import * as path from 'node:path'
import type { FileOperationOptions } from '../../types/index.js'
import { FILE_ENCODING, BACKUP_EXTENSION } from '../../constants/index.js'

/**
 * 環境変数エントリ
 */
interface EnvEntry {
  /** 変数名 */
  key: string
  /** 値 */
  value: string
  /** コメント（空の場合は undefined） */
  comment?: string
  /** 元の行（コメント行の場合） */
  originalLine?: string
}

/**
 * 環境変数ファイルの解析結果
 */
interface ParsedEnvFile {
  /** 環境変数エントリ */
  entries: EnvEntry[]
  /** コメント行や空行 */
  otherLines: string[]
  /** 元のファイル内容（バックアップ用） */
  originalContent: string
}

/**
 * 環境変数ファイルを読み込んで解析
 * 
 * @param filePath - .envファイルのパス
 * @param options - ファイル操作オプション
 * @returns 解析結果オブジェクト
 * @throws {Error} ファイルの読み込みに失敗した場合
 * 
 * @example
 * ```typescript
 * try {
 *   const parsed = parseEnvFile('./.env')
 *   parsed.entries.forEach(entry => {
 *     console.log(`${entry.key}=${entry.value}`)
 *   })
 * } catch (error) {
 *   console.error('Failed to parse .env file:', error.message)
 * }
 * ```
 */
export function parseEnvFile(filePath: string, options?: FileOperationOptions): ParsedEnvFile {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, {
      encoding: options?.encoding || FILE_ENCODING
    })

    return parseEnvContent(content)
  } catch (error: any) {
    if (error.message.includes('not found')) {
      throw error
    }
    throw new Error(`Failed to read environment file: ${error.message}`)
  }
}

/**
 * 環境変数ファイルの内容を解析
 * 
 * @param content - .envファイルの内容
 * @returns 解析結果オブジェクト
 * 
 * @example
 * ```typescript
 * const content = "APP_PORT=3000\n# Database config\nDB_PORT=5432"
 * const parsed = parseEnvContent(content)
 * console.log(parsed.entries.length) // 2
 * ```
 */
export function parseEnvContent(content: string): ParsedEnvFile {
  const lines = content.split('\n')
  const entries: EnvEntry[] = []
  const otherLines: string[] = []

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()
    
    // 空行またはコメント行
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      otherLines.push(line)
      return
    }

    // KEY=VALUE形式の解析
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) {
      const [, key, rawValue] = match
      
      // 値の前後の引用符を除去
      let value = rawValue
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // インラインコメントをチェック
      let comment: string | undefined
      const commentMatch = rawValue.match(/^[^#]*#\s*(.+)$/)
      if (commentMatch) {
        comment = commentMatch[1].trim()
        // コメント部分を除去して値を再取得
        value = rawValue.replace(/#.*$/, '').trim()
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
      }

      entries.push({ key, value, comment })
    } else {
      // 解析できない行はそのまま保持
      otherLines.push(line)
    }
  })

  return {
    entries,
    otherLines,
    originalContent: content
  }
}

/**
 * 環境変数エントリを.env形式の文字列に変換
 * 
 * @param parsed - 解析済み環境変数ファイル
 * @returns .env形式の文字列
 * 
 * @example
 * ```typescript
 * const parsed = parseEnvFile('./.env')
 * const content = serializeEnvFile(parsed)
 * fs.writeFileSync('./.env.new', content)
 * ```
 */
export function serializeEnvFile(parsed: ParsedEnvFile): string {
  const lines: string[] = []

  // コメント行や空行を最初に追加（ヘッダーコメント等）
  const headerLines = parsed.otherLines.filter((_, index) => {
    // 最初の環境変数の前の行まで
    return index < parsed.entries.length
  })
  lines.push(...headerLines)

  // 環境変数エントリを追加
  parsed.entries.forEach(entry => {
    let line = `${entry.key}=${entry.value}`
    if (entry.comment) {
      line += ` # ${entry.comment}`
    }
    lines.push(line)
  })

  // 残りのコメント行（フッター）
  const footerLines = parsed.otherLines.filter((_, index) => {
    return index >= parsed.entries.length
  })
  lines.push(...footerLines)

  return lines.join('\n')
}

/**
 * 環境変数ファイルに設定を書き込み
 * 
 * @param filePath - 出力先ファイルパス
 * @param parsed - 書き込む環境変数データ
 * @param options - ファイル操作オプション
 * @throws {Error} ファイルの書き込みに失敗した場合
 * 
 * @example
 * ```typescript
 * const parsed = parseEnvFile('./.env')
 * // 値を調整
 * parsed.entries.forEach(entry => {
 *   if (entry.key === 'APP_PORT') {
 *     entry.value = '4000'
 *   }
 * })
 * writeEnvFile('./.env.new', parsed)
 * ```
 */
export function writeEnvFile(
  filePath: string, 
  parsed: ParsedEnvFile, 
  options?: FileOperationOptions
): void {
  try {
    // バックアップ作成（オプション）
    if (options?.createBackup && fs.existsSync(filePath)) {
      const backupPath = `${filePath}${BACKUP_EXTENSION}`
      fs.copyFileSync(filePath, backupPath)
      console.log(`📋 Created backup: ${backupPath}`)
    }

    const content = serializeEnvFile(parsed)
    
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirpSync(dir)
    }

    fs.writeFileSync(filePath, content, {
      encoding: options?.encoding || FILE_ENCODING
    })

    console.log(`🔧 Wrote environment file: ${filePath}`)
  } catch (error: any) {
    throw new Error(`Failed to write environment file: ${error.message}`)
  }
}

/**
 * 環境変数ファイルをコピーして値を調整
 * 
 * @param sourcePath - コピー元ファイルパス
 * @param targetPath - コピー先ファイルパス
 * @param adjustments - 調整ルール（key -> value または adjustment function）
 * @param options - ファイル操作オプション
 * @returns 調整された環境変数の数
 * 
 * @example
 * ```typescript
 * const adjustments = {
 *   APP_PORT: (value: string) => (parseInt(value) + 1000).toString(),
 *   DB_HOST: 'localhost-dev',
 *   DEBUG_MODE: null // 削除
 * }
 * 
 * const adjustedCount = copyAndAdjustEnvFile('./.env', './.env.new', adjustments)
 * console.log(`Adjusted ${adjustedCount} variables`)
 * ```
 */
export function copyAndAdjustEnvFile(
  sourcePath: string,
  targetPath: string,
  adjustments: Record<string, string | number | null | ((value: string) => string)>,
  options?: FileOperationOptions
): number {
  const parsed = parseEnvFile(sourcePath, options)
  let adjustedCount = 0

  // 既存の環境変数を調整
  parsed.entries.forEach(entry => {
    const adjustment = adjustments[entry.key]
    
    if (adjustment === null) {
      // null の場合は削除（フィルタリングは後で）
      entry.value = '__DELETE__'
      adjustedCount++
    } else if (typeof adjustment === 'string') {
      entry.value = adjustment
      adjustedCount++
    } else if (typeof adjustment === 'number') {
      // 数値の場合は元の値に加算（ポート番号等）
      const originalValue = parseInt(entry.value, 10)
      if (!isNaN(originalValue)) {
        entry.value = (originalValue + adjustment).toString()
        adjustedCount++
      }
    } else if (typeof adjustment === 'function') {
      entry.value = adjustment(entry.value)
      adjustedCount++
    }
  })

  // 削除マークされた項目を除去
  parsed.entries = parsed.entries.filter(entry => entry.value !== '__DELETE__')

  // 新しい環境変数を追加
  Object.entries(adjustments).forEach(([key, value]) => {
    const existingEntry = parsed.entries.find(entry => entry.key === key)
    if (!existingEntry && value !== null && typeof value !== 'function') {
      parsed.entries.push({
        key,
        value: typeof value === 'number' ? value.toString() : value as string,
        comment: 'Added by WTurbo'
      })
      adjustedCount++
    }
  })

  writeEnvFile(targetPath, parsed, options)
  return adjustedCount
}

/**
 * 環境変数ファイルをバックアップ
 * 
 * @param filePath - バックアップするファイルパス
 * @param backupSuffix - バックアップファイルの接尾辞（デフォルト: BACKUP_EXTENSION）
 * @returns バックアップファイルのパス
 * 
 * @example
 * ```typescript
 * const backupPath = backupEnvFile('./.env')
 * console.log(`Backup created: ${backupPath}`)
 * ```
 */
export function backupEnvFile(filePath: string, backupSuffix?: string): string {
  const suffix = backupSuffix || BACKUP_EXTENSION
  const backupPath = `${filePath}${suffix}`
  
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`📋 Created backup: ${backupPath}`)
  }
  
  return backupPath
}

/**
 * 環境変数ファイルからバックアップを復元
 * 
 * @param filePath - 復元先ファイルパス
 * @param backupSuffix - バックアップファイルの接尾辞（デフォルト: BACKUP_EXTENSION）
 * @throws {Error} バックアップファイルが存在しない場合
 * 
 * @example
 * ```typescript
 * try {
 *   restoreEnvFile('./.env')
 *   console.log('Environment file restored from backup')
 * } catch (error) {
 *   console.error('No backup file found')
 * }
 * ```
 */
export function restoreEnvFile(filePath: string, backupSuffix?: string): void {
  const suffix = backupSuffix || BACKUP_EXTENSION
  const backupPath = `${filePath}${suffix}`
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }
  
  fs.copyFileSync(backupPath, filePath)
  console.log(`📋 Restored from backup: ${backupPath}`)
}