import { execSync } from "node:child_process"
import * as fs from "fs-extra"
import * as yaml from "yaml"

export interface ContainerInfo {
  id: string
  name: string
  image: string
  ports: string[]
  volumes: string[]
  networks: string[]
  status: string
}

export interface VolumeInfo {
  name: string
  mountpoint: string
  driver: string
}

export interface ComposeService {
  image?: string
  ports?: string[]
  volumes?: string[]
  environment?: Record<string, string>
  networks?: string[]
  [key: string]: any
}

export interface ComposeConfig {
  version?: string
  services: Record<string, ComposeService>
  volumes?: Record<string, any>
  networks?: Record<string, any>
}

/**
 * Execute a shell command and return the output
 */
export function execCommand(command: string, options?: { cwd?: string }): string {
  try {
    const execOptions = {
      encoding: "utf-8" as const,
      stdio: "pipe" as const,
      ...(options?.cwd && { cwd: options.cwd })
    }
    return execSync(command, execOptions).trim()
  } catch (error: any) {
    throw new Error(`Command failed: ${command}
${error.message}`)
  }
}

/**
 * Get list of running Docker containers
 */
export function getRunningContainers(): ContainerInfo[] {
  try {
    const output = execCommand(
      'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Ports}}|{{.Status}}"'
    )

    if (!output) return []

    return output.split("\n").map((line) => {
      const [id, name, image, ports, status] = line.split("|")
      return {
        id,
        name,
        image,
        ports: ports ? ports.split(",").map((p) => p.trim()) : [],
        volumes: getContainerVolumes(id),
        networks: getContainerNetworks(id),
        status,
      }
    })
  } catch (_error) {
    return []
  }
}

/**
 * Get volumes for a specific container
 */
export function getContainerVolumes(containerId: string): string[] {
  try {
    const output = execCommand(
      `docker inspect ${containerId} --format="{{range .Mounts}}{{.Source}}:{{.Destination}},{{end}}"`
    )
    return output ? output.split(",").filter((v) => v.trim()) : []
  } catch (_error) {
    return []
  }
}

/**
 * Get networks for a specific container
 */
export function getContainerNetworks(containerId: string): string[] {
  try {
    const output = execCommand(
      `docker inspect ${containerId} --format="{{range $k, $v := .NetworkSettings.Networks}}{{$k}},{{end}}"`
    )
    return output ? output.split(",").filter((n) => n.trim()) : []
  } catch (_error) {
    return []
  }
}

/**
 * Get list of Docker volumes
 */
export function getDockerVolumes(): VolumeInfo[] {
  try {
    const output = execCommand('docker volume ls --format "{{.Name}}|{{.Mountpoint}}|{{.Driver}}"')

    if (!output) return []

    return output.split("\n").map((line) => {
      const [name, mountpoint, driver] = line.split("|")
      return { name, mountpoint, driver }
    })
  } catch (_error) {
    return []
  }
}

/**
 * Get used ports from running containers
 */
export function getUsedPorts(): number[] {
  const containers = getRunningContainers()
  const ports: number[] = []

  containers.forEach((container) => {
    container.ports.forEach((portMapping) => {
      const match = portMapping.match(/0\.0\.0\.0:(\d+)/)
      if (match) {
        ports.push(parseInt(match[1], 10))
      }
    })
  })

  return ports
}

/**
 * Find available port starting from a base port
 */
export function findAvailablePort(basePort: number, usedPorts: number[]): number {
  let port = basePort
  while (usedPorts.includes(port)) {
    port++
  }
  return port
}

/**
 * Read and parse docker-compose.yml file
 */
export function readComposeFile(filePath: string): ComposeConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Docker Compose file not found: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, "utf-8")
  return yaml.parse(content) as ComposeConfig
}

/**
 * Write docker-compose.yml file
 */
export function writeComposeFile(filePath: string, config: ComposeConfig): void {
  const content = yaml.stringify(config)
  fs.writeFileSync(filePath, content, "utf-8")
}

/**
 * Adjust ports in compose configuration to avoid conflicts
 */
export function adjustPortsInCompose(config: ComposeConfig, usedPorts: number[]): ComposeConfig {
  const newConfig = JSON.parse(JSON.stringify(config)) // Deep clone

  Object.keys(newConfig.services).forEach((serviceName) => {
    const service = newConfig.services[serviceName]
    if (service.ports) {
      service.ports = service.ports.map((portMapping: string) => {
        const match = portMapping.match(/^(\d+):(\d+)$/)
        if (match) {
          const [, hostPort, containerPort] = match
          const newHostPort = findAvailablePort(parseInt(hostPort, 10), usedPorts)
          usedPorts.push(newHostPort)
          return `${newHostPort}:${containerPort}`
        }
        return portMapping
      })
    }
  })

  return newConfig
}
