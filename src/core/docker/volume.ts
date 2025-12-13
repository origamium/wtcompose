/**
 * @fileoverview Docker Volume 操作
 * Dockerボリュームのコピー、作成、削除を担当
 * パフォーマンスを考慮したrsyncベースの実装
 */

import { execSync, spawn } from 'node:child_process'
import type { ExecOptions } from '../../types/index.js'
import { FILE_ENCODING } from '../../constants/index.js'

/**
 * ボリュームコピーの進捗情報
 */
export interface VolumeCopyProgress {
  /** コピー元ボリューム名 */
  sourceVolume: string
  /** コピー先ボリューム名 */
  targetVolume: string
  /** 進捗率 (0-100) */
  percentage: number
  /** 転送済みバイト数 */
  bytesTransferred: number
  /** 総バイト数 */
  totalBytes: number
  /** 転送速度 (bytes/sec) */
  speed: number
  /** 残り時間（秒） */
  eta: number
  /** 現在処理中のファイル */
  currentFile?: string
}

/**
 * ボリュームコピーのオプション
 */
export interface VolumeCopyOptions {
  /** 進捗コールバック */
  onProgress?: (progress: VolumeCopyProgress) => void
  /** 差分コピーを使用するか（デフォルト: true） */
  incremental?: boolean
  /** 圧縮を使用するか（デフォルト: true、ネットワーク経由の場合に有効） */
  compress?: boolean
  /** コピー完了後にソースを削除するか */
  deleteSource?: boolean
  /** 並列コピーのワーカー数 */
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
 * rsyncが利用可能かチェック
 */
function isRsyncAvailable(): boolean {
  try {
    execSync('docker run --rm alpine which rsync', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * ボリュームのサイズを取得
 * 
 * @param volumeName - ボリューム名
 * @returns サイズ（バイト）
 */
export function getVolumeSize(volumeName: string): number {
  try {
    const output = execSync(
      `docker run --rm -v ${volumeName}:/data alpine sh -c "du -sb /data 2>/dev/null | cut -f1"`,
      { encoding: FILE_ENCODING, stdio: 'pipe' }
    ).trim()
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
    const output = execSync(
      `docker volume inspect ${volumeName} --format '{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}\t{{.CreatedAt}}'`,
      { encoding: FILE_ENCODING, stdio: 'pipe' }
    ).trim()

    const [name, driver, mountpoint, createdAt] = output.split('\t')
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
export function createVolume(volumeName: string, driver: string = 'local'): void {
  execSync(`docker volume create --driver ${driver} ${volumeName}`, { stdio: 'pipe' })
}

/**
 * ボリュームを削除
 * 
 * @param volumeName - 削除するボリューム名
 * @param force - 強制削除
 */
export function removeVolume(volumeName: string, force: boolean = false): void {
  const forceFlag = force ? ' -f' : ''
  execSync(`docker volume rm${forceFlag} ${volumeName}`, { stdio: 'pipe' })
}

/**
 * rsyncを使用した高速ボリュームコピー
 * 
 * @param sourceVolume - コピー元ボリューム名
 * @param targetVolume - コピー先ボリューム名
 * @param options - コピーオプション
 * @returns コピー結果のPromise
 * 
 * @example
 * ```typescript
 * await copyVolumeWithRsync('source-vol', 'target-vol', {
 *   onProgress: (p) => console.log(`${p.percentage}% complete`),
 *   incremental: true
 * })
 * ```
 */
export async function copyVolumeWithRsync(
  sourceVolume: string,
  targetVolume: string,
  options: VolumeCopyOptions = {}
): Promise<void> {
  const {
    onProgress,
    incremental = true,
    compress = false
  } = options

  // ターゲットボリュームを作成（存在しない場合）
  try {
    createVolume(targetVolume)
  } catch {
    // 既に存在する場合は無視
  }

  // ソースボリュームのサイズを取得
  const totalBytes = getVolumeSize(sourceVolume)

  // rsyncオプションを構築
  const rsyncFlags = [
    '-a',           // アーカイブモード（パーミッション保持）
    '--info=progress2', // 進捗表示
    '--no-inc-recursive' // 最初にファイルリストを構築（進捗計算用）
  ]

  if (incremental) {
    rsyncFlags.push('--delete') // 差分同期時に不要ファイルを削除
  }

  if (compress) {
    rsyncFlags.push('-z') // 圧縮
  }

  const rsyncCommand = `rsync ${rsyncFlags.join(' ')} /source/ /target/`

  return new Promise((resolve, reject) => {
    const dockerProcess = spawn('docker', [
      'run', '--rm',
      '-v', `${sourceVolume}:/source:ro`,
      '-v', `${targetVolume}:/target`,
      'instrumentisto/rsync-ssh',
      'sh', '-c', rsyncCommand
    ])

    let lastProgress: VolumeCopyProgress = {
      sourceVolume,
      targetVolume,
      percentage: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0
    }

    dockerProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      
      // rsync --info=progress2 の出力をパース
      // 例: "1,234,567  45%   12.34MB/s    0:01:23"
      const progressMatch = output.match(
        /(\d[\d,]*)\s+(\d+)%\s+([\d.]+\w+\/s)\s+(\d+:\d+:\d+)/
      )

      if (progressMatch && onProgress) {
        const bytesTransferred = parseInt(progressMatch[1].replace(/,/g, ''), 10)
        const percentage = parseInt(progressMatch[2], 10)
        const speedStr = progressMatch[3]
        const etaStr = progressMatch[4]

        // 速度をパース (例: "12.34MB/s" -> bytes/sec)
        const speedMatch = speedStr.match(/([\d.]+)(\w+)/)
        let speed = 0
        if (speedMatch) {
          const value = parseFloat(speedMatch[1])
          const unit = speedMatch[2].toLowerCase()
          const multipliers: Record<string, number> = {
            'b/s': 1,
            'kb/s': 1024,
            'mb/s': 1024 * 1024,
            'gb/s': 1024 * 1024 * 1024
          }
          speed = value * (multipliers[unit] || 1)
        }

        // ETAをパース (例: "0:01:23" -> 秒)
        const etaParts = etaStr.split(':').map(Number)
        const eta = etaParts[0] * 3600 + etaParts[1] * 60 + etaParts[2]

        lastProgress = {
          sourceVolume,
          targetVolume,
          percentage,
          bytesTransferred,
          totalBytes,
          speed,
          eta
        }

        onProgress(lastProgress)
      }
    })

    dockerProcess.stderr.on('data', (data: Buffer) => {
      // rsyncのエラー出力を処理
      const error = data.toString()
      if (error.includes('error') || error.includes('failed')) {
        console.error('rsync error:', error)
      }
    })

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        // 完了時に100%を通知
        if (onProgress) {
          onProgress({
            ...lastProgress,
            percentage: 100,
            bytesTransferred: totalBytes
          })
        }
        resolve()
      } else {
        reject(new Error(`Volume copy failed with exit code ${code}`))
      }
    })

    dockerProcess.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * 従来のcpコマンドを使用したボリュームコピー（フォールバック用）
 * 
 * @param sourceVolume - コピー元ボリューム名
 * @param targetVolume - コピー先ボリューム名
 * @param onProgress - 進捗コールバック（開始/終了のみ）
 */
export async function copyVolumeWithCp(
  sourceVolume: string,
  targetVolume: string,
  onProgress?: (progress: VolumeCopyProgress) => void
): Promise<void> {
  // ターゲットボリュームを作成
  try {
    createVolume(targetVolume)
  } catch {
    // 既に存在する場合は無視
  }

  const totalBytes = getVolumeSize(sourceVolume)

  // 開始通知
  if (onProgress) {
    onProgress({
      sourceVolume,
      targetVolume,
      percentage: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0
    })
  }

  // cpコマンドでコピー
  execSync(
    `docker run --rm -v ${sourceVolume}:/source:ro -v ${targetVolume}:/target alpine sh -c "cp -a /source/. /target/"`,
    { stdio: 'pipe' }
  )

  // 完了通知
  if (onProgress) {
    onProgress({
      sourceVolume,
      targetVolume,
      percentage: 100,
      bytesTransferred: totalBytes,
      totalBytes,
      speed: 0,
      eta: 0
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
 * 
 * @example
 * ```typescript
 * // プログレスバー付きでコピー
 * await copyVolume('db-data', 'db-data-backup', {
 *   onProgress: (p) => {
 *     process.stdout.write(`\r${p.percentage}% | ${formatBytes(p.speed)}/s | ETA: ${p.eta}s`)
 *   }
 * })
 * ```
 */
export async function copyVolume(
  sourceVolume: string,
  targetVolume: string,
  options: VolumeCopyOptions = {}
): Promise<void> {
  // rsyncイメージを使用（より高速で進捗表示可能）
  try {
    await copyVolumeWithRsync(sourceVolume, targetVolume, options)
  } catch (error) {
    console.warn('rsync copy failed, falling back to cp:', error)
    await copyVolumeWithCp(sourceVolume, targetVolume, options.onProgress)
  }
}

/**
 * 複数のボリュームを並列でコピー
 * 
 * @param volumePairs - コピーするボリュームのペア配列
 * @param options - コピーオプション
 * @returns コピー結果のPromise
 * 
 * @example
 * ```typescript
 * await copyVolumesParallel([
 *   { source: 'db-data', target: 'db-data-wt1' },
 *   { source: 'redis-data', target: 'redis-data-wt1' },
 *   { source: 'uploads', target: 'uploads-wt1' }
 * ], {
 *   parallelWorkers: 2,
 *   onProgress: (p) => console.log(`${p.sourceVolume}: ${p.percentage}%`)
 * })
 * ```
 */
export async function copyVolumesParallel(
  volumePairs: Array<{ source: string; target: string }>,
  options: VolumeCopyOptions = {}
): Promise<void> {
  const { parallelWorkers = 2, ...copyOptions } = options
  
  // バッチに分割して並列実行
  for (let i = 0; i < volumePairs.length; i += parallelWorkers) {
    const batch = volumePairs.slice(i, i + parallelWorkers)
    await Promise.all(
      batch.map(pair => copyVolume(pair.source, pair.target, copyOptions))
    )
  }
}

/**
 * バイト数を人間が読みやすい形式にフォーマット
 * 
 * @param bytes - バイト数
 * @returns フォーマットされた文字列
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  
  return `${value.toFixed(2)} ${units[i]}`
}

/**
 * 秒数を人間が読みやすい形式にフォーマット
 * 
 * @param seconds - 秒数
 * @returns フォーマットされた文字列
 */
export function formatEta(seconds: number): string {
  if (seconds <= 0) return '--:--'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}
