/**
 * @fileoverview Docker Volume 操作
 * Dockerボリュームのコピー、作成、削除を担当
 * パフォーマンスを考慮したrsyncベースの実装
 */

import { spawn } from "node:child_process"
import { FILE_ENCODING } from "../../constants/index.js"
import { execDockerSafe } from "../../utils/exec.js"

/**
 * ボリュームコピーの進捗情報
 */
export interface VolumeCopyProgress {
  sourceVolume: string
  targetVolume: string
  percentage: number
  bytesTransferred: number
  totalBytes: number
  speed: number
  eta: number
  currentFile?: string
}

/**
 * ボリュームコピーのオプション
 */
export interface VolumeCopyOptions {
  onProgress?: (progress: VolumeCopyProgress) => void
  incremental?: boolean
  compress?: boolean
  deleteSource?: boolean
  parallelWorkers?: number
}

/**
 * ボリューム情報
 */
export interface VolumeDetails {
  name: string
  driver: string
  mountpoint: string
  size: number
  createdAt: string
}

/**
 * ボリュームのサイズを取得
 *
 * @param volumeName - ボリューム名
 * @returns サイズ（バイト）
 */
export function getVolumeSize(volumeName: string): number {
  try {
    const output = execDockerSafe(
      [
        "run",
        "--rm",
        "-v",
        `${volumeName}:/data`,
        "alpine",
        "sh",
        "-c",
        "du -sb /data 2>/dev/null | cut -f1",
      ],
      {}
    )
    return parseInt(output, 10) || 0
  } catch {
    return 0
  }
}

/**
 * ボリュームの詳細情報を取得
 *
 * @param volumeName - ボリューム名
 * @returns ボリューム詳細情報
 */
export function getVolumeDetails(volumeName: string): VolumeDetails | null {
  try {
    const output = execDockerSafe(
      [
        "volume",
        "inspect",
        volumeName,
        "--format",
        "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}\t{{.CreatedAt}}",
      ],
      {}
    )

    const [name, driver, mountpoint, createdAt] = output.split("\t")
    const size = getVolumeSize(volumeName)

    return { name, driver, mountpoint, size, createdAt }
  } catch {
    return null
  }
}

/**
 * ボリュームを作成
 *
 * @param volumeName - 作成するボリューム名
 * @param driver - ドライバー（デフォルト: local）
 */
export function createVolume(volumeName: string, driver: string = "local"): void {
  execDockerSafe(["volume", "create", "--driver", driver, volumeName], {})
}

/**
 * ボリュームを削除
 *
 * @param volumeName - 削除するボリューム名
 * @param force - 強制削除
 */
export function removeVolume(volumeName: string, force: boolean = false): void {
  const args = force ? ["volume", "rm", "-f", volumeName] : ["volume", "rm", volumeName]
  execDockerSafe(args, {})
}

/**
 * rsyncを使用した高速ボリュームコピー
 *
 * @param sourceVolume - コピー元ボリューム名
 * @param targetVolume - コピー先ボリューム名
 * @param options - コピーオプション
 * @returns コピー結果のPromise
 */
export async function copyVolumeWithRsync(
  sourceVolume: string,
  targetVolume: string,
  options: VolumeCopyOptions = {}
): Promise<void> {
  const { onProgress, incremental = true, compress = false } = options

  try {
    createVolume(targetVolume)
  } catch {
    // 既に存在する場合は無視
  }

  const totalBytes = getVolumeSize(sourceVolume)

  const rsyncFlags = ["-a", "--info=progress2", "--no-inc-recursive"]

  if (incremental) {
    rsyncFlags.push("--delete")
  }

  if (compress) {
    rsyncFlags.push("-z")
  }

  const rsyncCommand = `rsync ${rsyncFlags.join(" ")} /source/ /target/`

  return new Promise((resolve, reject) => {
    const dockerProcess = spawn("docker", [
      "run",
      "--rm",
      "-v",
      `${sourceVolume}:/source:ro`,
      "-v",
      `${targetVolume}:/target`,
      "instrumentisto/rsync-ssh",
      "sh",
      "-c",
      rsyncCommand,
    ])

    let lastProgress: VolumeCopyProgress = {
      sourceVolume,
      targetVolume,
      percentage: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0,
    }

    dockerProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString()

      const progressMatch = output.match(/(\d[\d,]*)\s+(\d+)%\s+([\d.]+\w+\/s)\s+(\d+:\d+:\d+)/)

      if (progressMatch && onProgress) {
        const bytesTransferred = parseInt(progressMatch[1].replace(/,/g, ""), 10)
        const percentage = parseInt(progressMatch[2], 10)
        const speedStr = progressMatch[3]
        const etaStr = progressMatch[4]

        const speedMatch = speedStr.match(/([\d.]+)(\w+)/)
        let speed = 0
        if (speedMatch) {
          const value = parseFloat(speedMatch[1])
          const unit = speedMatch[2].toLowerCase()
          const multipliers: Record<string, number> = {
            "b/s": 1,
            "kb/s": 1024,
            "mb/s": 1024 * 1024,
            "gb/s": 1024 * 1024 * 1024,
          }
          speed = value * (multipliers[unit] || 1)
        }

        const etaParts = etaStr.split(":").map(Number)
        const eta = etaParts[0] * 3600 + etaParts[1] * 60 + etaParts[2]

        lastProgress = {
          sourceVolume,
          targetVolume,
          percentage,
          bytesTransferred,
          totalBytes,
          speed,
          eta,
        }

        onProgress(lastProgress)
      }
    })

    dockerProcess.stderr.on("data", (data: Buffer) => {
      const error = data.toString()
      if (error.includes("error") || error.includes("failed")) {
        console.error("rsync error:", error)
      }
    })

    dockerProcess.on("close", (code) => {
      if (code === 0) {
        if (onProgress) {
          onProgress({
            ...lastProgress,
            percentage: 100,
            bytesTransferred: totalBytes,
          })
        }
        resolve()
      } else {
        reject(new Error(`Volume copy failed with exit code ${code}`))
      }
    })

    dockerProcess.on("error", (error) => {
      reject(error)
    })
  })
}

/**
 * cpコマンドを使用したボリュームコピー（フォールバック用）
 *
 * @param sourceVolume - コピー元ボリューム名
 * @param targetVolume - コピー先ボリューム名
 * @param onProgress - 進捗コールバック
 */
export async function copyVolumeWithCp(
  sourceVolume: string,
  targetVolume: string,
  onProgress?: (progress: VolumeCopyProgress) => void
): Promise<void> {
  try {
    createVolume(targetVolume)
  } catch {
    // 既に存在する場合は無視
  }

  const totalBytes = getVolumeSize(sourceVolume)

  if (onProgress) {
    onProgress({
      sourceVolume,
      targetVolume,
      percentage: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0,
    })
  }

  execDockerSafe(
    [
      "run",
      "--rm",
      "-v",
      `${sourceVolume}:/source:ro`,
      "-v",
      `${targetVolume}:/target`,
      "alpine",
      "sh",
      "-c",
      "cp -a /source/. /target/",
    ],
    {}
  )

  if (onProgress) {
    onProgress({
      sourceVolume,
      targetVolume,
      percentage: 100,
      bytesTransferred: totalBytes,
      totalBytes,
      speed: 0,
      eta: 0,
    })
  }
}

/**
 * 最適な方法でボリュームをコピー
 * rsyncが利用可能な場合はrsyncを使用、そうでなければcpを使用
 *
 * @param sourceVolume - コピー元ボリューム名
 * @param targetVolume - コピー先ボリューム名
 * @param options - コピーオプション
 * @returns コピー結果のPromise
 */
export async function copyVolume(
  sourceVolume: string,
  targetVolume: string,
  options: VolumeCopyOptions = {}
): Promise<void> {
  try {
    await copyVolumeWithRsync(sourceVolume, targetVolume, options)
  } catch (error) {
    console.warn("rsync copy failed, falling back to cp:", error)
    await copyVolumeWithCp(sourceVolume, targetVolume, options.onProgress)
  }
}

/**
 * 複数のボリュームを並列でコピー
 *
 * @param volumePairs - コピーするボリュームのペア配列
 * @param options - コピーオプション
 * @returns コピー結果のPromise
 */
export async function copyVolumesParallel(
  volumePairs: Array<{ source: string; target: string }>,
  options: VolumeCopyOptions = {}
): Promise<void> {
  const { parallelWorkers = 2, ...copyOptions } = options

  for (let i = 0; i < volumePairs.length; i += parallelWorkers) {
    const batch = volumePairs.slice(i, i + parallelWorkers)
    await Promise.all(batch.map((pair) => copyVolume(pair.source, pair.target, copyOptions)))
  }
}

/**
 * バイト数を人間が読みやすい形式にフォーマット
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / 1024 ** i

  return `${value.toFixed(2)} ${units[i]}`
}

/**
 * 秒数を人間が読みやすい形式にフォーマット
 */
export function formatEta(seconds: number): string {
  if (seconds <= 0) return "--:--"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

// Re-export FILE_ENCODING for backward compat
export { FILE_ENCODING }
