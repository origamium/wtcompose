import * as fs from 'fs-extra'
import * as path from 'node:path'

/**
 * Docker テスト環境のオプション
 */
export interface DockerTestEnvOptions {
  projectName?: string
  appPort?: number
  apiPort?: number
  dbPort?: number
  dbName?: string
  redisPort?: number
  adminerPort?: number
}

/**
 * Docker テスト環境の情報
 */
export interface DockerTestEnv {
  composeFile: string
  envFile: string
  initDbFile: string
  options: Required<DockerTestEnvOptions>
}

/**
 * デフォルトのポート番号
 */
const DEFAULT_PORTS = {
  app: 3000,
  api: 3000,
  db: 5432,
  redis: 6379,
  adminer: 8080
}

/**
 * フィクスチャのディレクトリパス
 */
const FIXTURES_DIR = path.join(__dirname, '../fixtures/docker-project')

/**
 * テスト用のDocker環境をリポジトリにセットアップする
 * 
 * @param repoPath - セットアップ先のリポジトリパス
 * @param options - 環境オプション
 * @returns セットアップされた環境の情報
 */
export function setupDockerTestEnv(repoPath: string, options: DockerTestEnvOptions = {}): DockerTestEnv {
  const resolvedOptions: Required<DockerTestEnvOptions> = {
    projectName: options.projectName || `test-${Date.now()}`,
    appPort: options.appPort || DEFAULT_PORTS.app,
    apiPort: options.apiPort || DEFAULT_PORTS.api,
    dbPort: options.dbPort || DEFAULT_PORTS.db,
    dbName: options.dbName || 'test_db',
    redisPort: options.redisPort || DEFAULT_PORTS.redis,
    adminerPort: options.adminerPort || DEFAULT_PORTS.adminer
  }

  // docker-compose.yml をコピー
  const composeSource = path.join(FIXTURES_DIR, 'docker-compose.yml')
  const composeDest = path.join(repoPath, 'docker-compose.yml')
  fs.copySync(composeSource, composeDest)

  // .env ファイルを生成
  const envTemplate = fs.readFileSync(
    path.join(FIXTURES_DIR, '.env.template'),
    'utf-8'
  )
  const envContent = envTemplate
    .replace(/\{\{PROJECT_NAME\}\}/g, resolvedOptions.projectName)
    .replace(/\{\{APP_PORT\}\}/g, String(resolvedOptions.appPort))
    .replace(/\{\{API_PORT\}\}/g, String(resolvedOptions.apiPort))
    .replace(/\{\{DB_PORT\}\}/g, String(resolvedOptions.dbPort))
    .replace(/\{\{DB_NAME\}\}/g, resolvedOptions.dbName)
    .replace(/\{\{REDIS_PORT\}\}/g, String(resolvedOptions.redisPort))
    .replace(/\{\{ADMINER_PORT\}\}/g, String(resolvedOptions.adminerPort))

  const envDest = path.join(repoPath, '.env')
  fs.writeFileSync(envDest, envContent)

  // init-db スクリプトをコピー
  const initDbDir = path.join(repoPath, 'docker', 'init-db')
  fs.ensureDirSync(initDbDir)
  
  const initDbSource = path.join(FIXTURES_DIR, 'docker/init-db/01-init.sql')
  const initDbDest = path.join(initDbDir, '01-init.sql')
  fs.copySync(initDbSource, initDbDest)

  return {
    composeFile: composeDest,
    envFile: envDest,
    initDbFile: initDbDest,
    options: resolvedOptions
  }
}

/**
 * 環境変数ファイルを読み込んでパースする
 * 
 * @param envFilePath - .envファイルのパス
 * @returns パースされた環境変数のオブジェクト
 */
export function parseEnvFile(envFilePath: string): Record<string, string> {
  const content = fs.readFileSync(envFilePath, 'utf-8')
  const result: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    
    // コメントや空行をスキップ
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim()
      const value = trimmed.substring(eqIndex + 1).trim()
      result[key] = value
    }
  }

  return result
}

/**
 * 環境変数ファイルを更新する
 * 
 * @param envFilePath - .envファイルのパス
 * @param updates - 更新する環境変数
 */
export function updateEnvFile(envFilePath: string, updates: Record<string, string | number>): void {
  const content = fs.readFileSync(envFilePath, 'utf-8')
  const lines = content.split('\n')
  const updatedKeys = new Set<string>()

  const updatedLines = lines.map(line => {
    const trimmed = line.trim()
    
    // コメントや空行はそのまま
    if (!trimmed || trimmed.startsWith('#')) {
      return line
    }

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim()
      if (key in updates) {
        updatedKeys.add(key)
        return `${key}=${updates[key]}`
      }
    }
    return line
  })

  // 新規のキーを追加
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      updatedLines.push(`${key}=${value}`)
    }
  }

  fs.writeFileSync(envFilePath, updatedLines.join('\n'))
}

/**
 * Docker Compose ファイルをパースする
 * 
 * @param composeFilePath - docker-compose.yml のパス
 * @returns パースされた設定オブジェクト
 */
export function parseComposeFile(composeFilePath: string): any {
  const yaml = require('yaml')
  const content = fs.readFileSync(composeFilePath, 'utf-8')
  return yaml.parse(content)
}

/**
 * 使用中のポートを取得する（テスト用モック）
 * 
 * @param basePort - 基準ポート
 * @param count - 取得するポート数
 * @returns 利用可能なポート番号の配列
 */
export function getAvailablePorts(basePort: number, count: number): number[] {
  const ports: number[] = []
  let current = basePort
  
  for (let i = 0; i < count; i++) {
    ports.push(current)
    current += 1
  }
  
  return ports
}

/**
 * テスト用のDocker環境を異なるポートで複製する
 * 
 * @param sourceRepoPath - 元のリポジトリパス
 * @param destRepoPath - 複製先のリポジトリパス
 * @param portOffset - ポート番号のオフセット
 * @returns 新しい環境の情報
 */
export function cloneDockerEnvWithPortOffset(
  sourceRepoPath: string,
  destRepoPath: string,
  portOffset: number
): DockerTestEnv {
  // 元の環境を読み込む
  const sourceEnv = parseEnvFile(path.join(sourceRepoPath, '.env'))
  
  // オフセットを適用した新しいポートを計算
  const newOptions: DockerTestEnvOptions = {
    projectName: `${sourceEnv.COMPOSE_PROJECT_NAME}-wt-${portOffset}`,
    appPort: parseInt(sourceEnv.APP_PORT || '3000') + portOffset,
    apiPort: parseInt(sourceEnv.API_PORT || '3000') + portOffset,
    dbPort: parseInt(sourceEnv.DB_PORT || '5432') + portOffset,
    dbName: sourceEnv.DB_NAME || 'test_db',
    redisPort: parseInt(sourceEnv.REDIS_PORT || '6379') + portOffset,
    adminerPort: parseInt(sourceEnv.ADMINER_PORT || '8080') + portOffset
  }

  return setupDockerTestEnv(destRepoPath, newOptions)
}
