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

/**
 * CLIエラー（終了コード付き）
 * process.exit() を直接呼ぶ代わりにこのエラーをスローし、
 * アクションハンドラでキャッチして process.exit() を呼ぶ
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message)
    this.name = "CLIError"
  }
}
