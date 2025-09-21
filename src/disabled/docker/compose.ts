import * as fs from "fs-extra"
import * as path from "node:path"
import * as yaml from "yaml"
import { DockerComposeConfig } from "../config/types.js"
import { execCommand } from "../utils/docker.js"

/**
 * Run docker-compose command in specified directory
 */
export function runDockerCompose(
  command: string,
  composeFile: string,
  options: {
    detached?: boolean
    build?: boolean
    projectName?: string
  } = {}
): void {
  const {
    detached = false,
    build = false,
    projectName
  } = options

  const composeDir = path.dirname(composeFile)
  const composeFileName = path.basename(composeFile)

  const args = ["docker-compose"]
  
  // Add project name if specified
  if (projectName) {
    args.push("-p", projectName)
  }
  
  // Add compose file
  args.push("-f", composeFileName)
  
  // Add command
  args.push(command)
  
  // Add flags
  if (detached && command === "up") {
    args.push("-d")
  }
  
  if (build && command === "up") {
    args.push("--build")
  }

  const fullCommand = args.join(" ")
  console.log(`🐳 Running: ${fullCommand}`)
  
  try {
    execCommand(fullCommand, { cwd: composeDir })
  } catch (error: any) {
    throw new Error(`Docker Compose command failed: ${error.message}`)
  }
}

/**
 * Start services using docker-compose
 */
export function startServices(
  composeFile: string,
  options: {
    build?: boolean
    projectName?: string
  } = {}
): void {
  runDockerCompose("up", composeFile, {
    detached: true,
    ...options
  })
}

/**
 * Stop services using docker-compose
 */
export function stopServices(
  composeFile: string,
  options: {
    projectName?: string
    removeVolumes?: boolean
  } = {}
): void {
  const command = options.removeVolumes ? "down -v" : "down"
  runDockerCompose(command, composeFile, {
    projectName: options.projectName
  })
}

/**
 * Build services using docker-compose
 */
export function buildServices(
  composeFile: string,
  options: {
    projectName?: string
    noCache?: boolean
  } = {}
): void {
  const command = options.noCache ? "build --no-cache" : "build"
  runDockerCompose(command, composeFile, {
    projectName: options.projectName
  })
}

/**
 * Get service status
 */
export function getServiceStatus(
  composeFile: string,
  projectName?: string
): Array<{
  service: string
  status: string
  ports: string[]
}> {
  try {
    const composeDir = path.dirname(composeFile)
    const composeFileName = path.basename(composeFile)
    
    const args = ["docker-compose"]
    
    if (projectName) {
      args.push("-p", projectName)
    }
    
    args.push("-f", composeFileName, "ps", "--format", "json")
    
    const output = execCommand(args.join(" "), { cwd: composeDir })
    
    if (!output.trim()) {
      return []
    }

    // Parse JSON output (each line is a separate JSON object)
    const services = output
      .split("\\n")
      .filter(line => line.trim())
      .map(line => {
        try {
          const data = JSON.parse(line)
          return {
            service: data.Service || data.Name || "unknown",
            status: data.State || "unknown",
            ports: data.Publishers ? data.Publishers.map((p: any) => 
              `${p.PublishedPort || ""}:${p.TargetPort || ""}`) : []
          }
        } catch (error) {
          console.log(`⚠️  Failed to parse service status: ${line}`)
          return null
        }
      })
      .filter(Boolean)

    return services as Array<{
      service: string
      status: string
      ports: string[]
    }>
  } catch (error) {
    console.log(`⚠️  Failed to get service status: ${error}`)
    return []
  }
}

/**
 * Check if docker-compose file is valid
 */
export function validateComposeFile(composeFile: string): boolean {
  try {
    const composeDir = path.dirname(composeFile)
    const composeFileName = path.basename(composeFile)
    
    execCommand(`docker-compose -f ${composeFileName} config -q`, { cwd: composeDir })
    return true
  } catch (error) {
    return false
  }
}

/**
 * Update docker-compose file with new project name
 */
export function updateComposeProject(
  composeFile: string,
  projectName: string
): void {
  try {
    const config = yaml.parse(fs.readFileSync(composeFile, "utf-8")) as DockerComposeConfig
    
    // Update container names to include project prefix
    if (config.services) {
      Object.keys(config.services).forEach(serviceName => {
        const service = config.services[serviceName]
        
        // Update container name if not explicitly set
        if (!service.container_name) {
          service.container_name = `${projectName}_${serviceName}_1`
        }
        
        // Update environment variables
        if (!service.environment) {
          service.environment = {}
        }
        
        if (Array.isArray(service.environment)) {
          service.environment.push(`COMPOSE_PROJECT_NAME=${projectName}`)
        } else {
          service.environment.COMPOSE_PROJECT_NAME = projectName
        }
      })
    }
    
    // Update volume names to include project prefix
    if (config.volumes) {
      const newVolumes: Record<string, any> = {}
      
      Object.entries(config.volumes).forEach(([volumeName, volumeConfig]) => {
        const newVolumeName = volumeName.startsWith(projectName) 
          ? volumeName 
          : `${projectName}_${volumeName}`
        newVolumes[newVolumeName] = volumeConfig
      })
      
      config.volumes = newVolumes
      
      // Update volume references in services
      if (config.services) {
        Object.values(config.services).forEach(service => {
          if (service.volumes) {
            service.volumes = service.volumes.map((volume: string) => {
              // Handle named volumes (not bind mounts)
              if (!volume.includes(":") || !volume.startsWith("/") && !volume.startsWith(".")) {
                const [volumeName, ...rest] = volume.split(":")
                const newVolumeName = volumeName.startsWith(projectName)
                  ? volumeName
                  : `${projectName}_${volumeName}`
                return [newVolumeName, ...rest].join(":")
              }
              return volume
            })
          }
        })
      }
    }
    
    // Update network names to include project prefix
    if (config.networks) {
      const newNetworks: Record<string, any> = {}
      
      Object.entries(config.networks).forEach(([networkName, networkConfig]) => {
        const newNetworkName = networkName.startsWith(projectName)
          ? networkName
          : `${projectName}_${networkName}`
        newNetworks[newNetworkName] = networkConfig
      })
      
      config.networks = newNetworks
      
      // Update network references in services
      if (config.services) {
        Object.values(config.services).forEach(service => {
          if (service.networks) {
            if (Array.isArray(service.networks)) {
              service.networks = service.networks.map((network: string) => {
                return network.startsWith(projectName) ? network : `${projectName}_${network}`
              })
            } else {
              const newNetworks: Record<string, any> = {}
              Object.entries(service.networks).forEach(([networkName, networkConfig]) => {
                const newNetworkName = networkName.startsWith(projectName)
                  ? networkName
                  : `${projectName}_${networkName}`
                newNetworks[newNetworkName] = networkConfig
              })
              service.networks = newNetworks
            }
          }
        })
      }
    }
    
    // Write updated config back to file
    fs.writeFileSync(composeFile, yaml.stringify(config))
    
  } catch (error: any) {
    throw new Error(`Failed to update compose project: ${error.message}`)
  }
}

/**
 * Get compose file version
 */
export function getComposeVersion(composeFile: string): string {
  try {
    const config = yaml.parse(fs.readFileSync(composeFile, "utf-8")) as DockerComposeConfig
    return config.version || "3.8"
  } catch (error) {
    return "3.8"
  }
}