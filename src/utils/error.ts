/**
 * @fileoverview エラーハンドリングユーティリティ
 */

/**
 * unknownエラーからメッセージを安全に抽出
 *
 * @param error - エラーオブジェクト（unknown型）
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return String(error)
}
