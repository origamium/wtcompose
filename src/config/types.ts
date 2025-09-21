export interface WTurboConfig {
  base_branch: string
  docker_compose_file: string
  env: EnvConfig
}

export interface EnvConfig {
  file: string[]
  adjust: Record<string, EnvAdjustValue>
}

export type EnvAdjustValue = null | number | string

export interface EnvFileEntry {
  key: string
  value: string
  originalValue: string
}

export interface DockerComposeService {
  image?: string
  build?: string | { context?: string; dockerfile?: string }
  ports?: string[]
  volumes?: string[]
  environment?: Record<string, string> | string[]
  depends_on?: string[]
  [key: string]: any
}

export interface DockerComposeConfig {
  version?: string
  services: Record<string, DockerComposeService>
  volumes?: Record<string, any>
  networks?: Record<string, any>
  [key: string]: any
}

export const DEFAULT_CONFIG: WTurboConfig = {
  base_branch: "main",
  docker_compose_file: "./docker-compose.yaml",
  env: {
    file: [],
    adjust: {}
  }
}