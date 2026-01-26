/**
 * @fileoverview 設定バリデーター
 * WTurbo設定ファイルの検証と環境変数名の正規化を担当
 */

import { existsSync } from "node:fs"
import * as path from "node:path"
import fs from "fs-extra"
import { ENV_VAR_PATTERNS } from "../../constants/index.js"
import type { WTurboConfig } from "../../types/index.js"

/**
 * バリデーションエラー情報
 */
interface ValidationError {
  /** エラーメッセージ */
  message: string
  /** エラーが発生したフィールドパス */
  field: string
  /** エラーの重要度 */
  severity: "error" | "warning"
}

/**
 * WTurbo設定ファイルをバリデートする
 *
 * @param config - 検証する設定オブジェクト
 * @param configFile - 設定ファイルのパス（相対パス解決用）
 * @throws {Error} バリデーションエラーが発生した場合
 *
 * @example
 * ```typescript
 * try {
 *   validateConfig(config, '/project/wturbo.yaml')
 *   console.log('Configuration is valid')
 * } catch (error) {
 *   console.error('Validation failed:', error.message)
 * }
 * ```
 */
export function validateConfig(config: WTurboConfig, configFile: string): void {
  const errors: ValidationError[] = []
  const configDir = path.dirname(configFile)

  // base_branchの検証
  if (!config.base_branch || typeof config.base_branch !== "string") {
    errors.push({
      message: "base_branch must be a non-empty string",
      field: "base_branch",
      severity: "error",
    })
  }

  // docker_compose_fileの検証
  if (!config.docker_compose_file || typeof config.docker_compose_file !== "string") {
    errors.push({
      message: "docker_compose_file must be a non-empty string",
      field: "docker_compose_file",
      severity: "error",
    })
  } else {
    const composePath = path.resolve(configDir, config.docker_compose_file)
    if (!existsSync(composePath)) {
      errors.push({
        message: `docker_compose_file not found: ${config.docker_compose_file}`,
        field: "docker_compose_file",
        severity: "error",
      })
    }
  }

  // copy_filesの検証
  if (config.copy_files !== undefined) {
    if (!Array.isArray(config.copy_files)) {
      errors.push({
        message: "copy_files must be an array",
        field: "copy_files",
        severity: "error",
      })
    } else {
      config.copy_files.forEach((copyFile, index) => {
        if (typeof copyFile !== "string") {
          errors.push({
            message: `copy_files[${index}] must be a string`,
            field: `copy_files[${index}]`,
            severity: "error",
          })
        }
      })
    }
  }

  // start_commandの検証
  if (config.start_command !== undefined && typeof config.start_command !== "string") {
    errors.push({
      message: "start_command must be a string",
      field: "start_command",
      severity: "error",
    })
  }

  // end_commandの検証
  if (config.end_command !== undefined && typeof config.end_command !== "string") {
    errors.push({
      message: "end_command must be a string",
      field: "end_command",
      severity: "error",
    })
  }

  // env設定の検証
  if (!config.env || typeof config.env !== "object") {
    errors.push({
      message: "env section must be an object",
      field: "env",
      severity: "error",
    })
  } else {
    // env.fileの検証
    if (!Array.isArray(config.env.file)) {
      errors.push({
        message: "env.file must be an array",
        field: "env.file",
        severity: "error",
      })
    } else {
      config.env.file.forEach((envFile, index) => {
        if (typeof envFile !== "string") {
          errors.push({
            message: `env.file[${index}] must be a string`,
            field: `env.file[${index}]`,
            severity: "error",
          })
        } else {
          const envPath = path.resolve(configDir, envFile)
          if (!existsSync(envPath)) {
            console.log(`⚠️  Environment file not found: ${envFile}`)
          }
        }
      })
    }

    // env.adjustの検証
    if (config.env.adjust && typeof config.env.adjust !== "object") {
      errors.push({
        message: "env.adjust must be an object",
        field: "env.adjust",
        severity: "error",
      })
    } else if (config.env.adjust) {
      Object.entries(config.env.adjust).forEach(([key, value]) => {
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          errors.push({
            message: `env.adjust.${key} must be null, string, or number`,
            field: `env.adjust.${key}`,
            severity: "error",
          })
        }
      })
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors
      .filter((e) => e.severity === "error")
      .map((e) => `  - ${e.message}`)
      .join("\\n")

    throw new Error(`Configuration validation failed:\\n${errorMessages}`)
  }
}

/**
 * 環境変数名が有効かチェック
 * 環境変数名は大文字、数字、アンダースコアのみで構成され、数字で始まってはいけない
 *
 * @param name - チェックする環境変数名
 * @returns 有効な環境変数名かどうか
 *
 * @example
 * ```typescript
 * console.log(validateEnvVarName('APP_PORT'))     // true
 * console.log(validateEnvVarName('app_port'))     // false (小文字)
 * console.log(validateEnvVarName('123_VAR'))      // false (数字始まり)
 * console.log(validateEnvVarName('APP-PORT'))     // false (ハイフン)
 * ```
 */
export function validateEnvVarName(name: string): boolean {
  return ENV_VAR_PATTERNS.VALID_NAME.test(name)
}

/**
 * 無効な環境変数名を有効な形式に修正する
 *
 * @param name - 修正する環境変数名
 * @returns 修正された環境変数名
 *
 * @example
 * ```typescript
 * console.log(suggestEnvVarName('app-port'))      // 'APP_PORT'
 * console.log(suggestEnvVarName('123_var'))       // '_123_VAR'
 * console.log(suggestEnvVarName('my__var__'))     // 'MY_VAR'
 * console.log(suggestEnvVarName('__leading'))     // 'LEADING'
 * ```
 */
export function suggestEnvVarName(name: string): string {
  const result = name
    .toUpperCase()
    .replace(ENV_VAR_PATTERNS.INVALID_CHARS, "_")
    .replace(ENV_VAR_PATTERNS.STARTS_WITH_NUMBER, "_$1") // 数字始まりの場合は前にアンダースコアを追加
    .replace(ENV_VAR_PATTERNS.MULTIPLE_UNDERSCORES, "_") // 連続するアンダースコアを単一に
    .replace(/_{0,1}$/, "") // 末尾のアンダースコアを削除

  // 先頭のアンダースコアは、数字対応で追加されたもの以外は削除
  if (result.startsWith("_") && !/^_[0-9]/.test(result)) {
    return result.replace(/^_+/, "")
  }

  return result
}

/**
 * 設定オブジェクト内の環境変数名をすべて検証し、問題があれば修正案を提示
 *
 * @param config - 検証する設定オブジェクト
 * @returns 修正案のマップ（元の名前 -> 修正後の名前）
 *
 * @example
 * ```typescript
 * const config = {
 *   env: {
 *     adjust: {
 *       'app-port': 3000,
 *       '123_var': 'value'
 *     }
 *   }
 * }
 *
 * const suggestions = validateConfigEnvVars(config)
 * // 結果: { 'app-port': 'APP_PORT', '123_var': '_123_VAR' }
 * ```
 */
export function validateConfigEnvVars(config: WTurboConfig): Record<string, string> {
  const suggestions: Record<string, string> = {}

  if (config.env?.adjust) {
    Object.keys(config.env.adjust).forEach((key) => {
      if (!validateEnvVarName(key)) {
        const suggestion = suggestEnvVarName(key)
        if (suggestion !== key) {
          suggestions[key] = suggestion
        }
      }
    })
  }

  return suggestions
}
