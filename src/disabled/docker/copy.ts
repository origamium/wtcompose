import * as path from "node:path"
import { execCommand } from "../utils/docker.js"

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
}

export interface VolumeInfo {
  name: string
  driver: string
  mountpoint: string
}

export interface NetworkInfo {
  id: string
  name: string
  driver: string
}

/**
 * Copy Docker containers, volumes, and networks for a new worktree
 */
export async function copyDockerResources(
  sourceProject: string,
  targetProject: string,
  options: {
    copyContainers?: boolean
    copyVolumes?: boolean
    copyNetworks?: boolean
  } = {}
): Promise<void> {
  const {
    copyContainers = true,
    copyVolumes = true,
    copyNetworks = true
  } = options

  console.log(`🐳 Copying Docker resources from ${sourceProject} to ${targetProject}...`)

  if (copyVolumes) {
    await copyVolumes(sourceProject, targetProject)
  }

  if (copyNetworks) {
    await copyNetworks(sourceProject, targetProject)
  }

  if (copyContainers) {
    console.log("ℹ️  Container configurations will be applied when running docker-compose up")
  }
}

/**
 * Copy Docker volumes
 */
async function copyVolumes(sourceProject: string, targetProject: string): Promise<void> {
  try {
    console.log("📦 Copying Docker volumes...")
    
    // Find volumes related to source project
    const sourceVolumes = await findProjectVolumes(sourceProject)
    
    if (sourceVolumes.length === 0) {
      console.log("ℹ️  No volumes found for source project")
      return
    }

    console.log(`Found ${sourceVolumes.length} volumes to copy`)

    for (const volume of sourceVolumes) {
      await copyVolume(volume, sourceProject, targetProject)
    }

    console.log("✅ Volume copying completed")
  } catch (error: any) {
    console.log(`⚠️  Volume copying failed: ${error.message}`)
  }
}

/**
 * Copy Docker networks
 */
async function copyNetworks(sourceProject: string, targetProject: string): Promise<void> {
  try {
    console.log("🌐 Copying Docker networks...")
    
    // Find networks related to source project
    const sourceNetworks = await findProjectNetworks(sourceProject)
    
    if (sourceNetworks.length === 0) {
      console.log("ℹ️  No custom networks found for source project")
      return
    }

    console.log(`Found ${sourceNetworks.length} networks to copy`)

    for (const network of sourceNetworks) {
      await copyNetwork(network, sourceProject, targetProject)
    }

    console.log("✅ Network copying completed")
  } catch (error: any) {
    console.log(`⚠️  Network copying failed: ${error.message}`)
  }
}

/**
 * Find volumes related to a project
 */
async function findProjectVolumes(projectName: string): Promise<VolumeInfo[]> {
  try {
    const output = execCommand(`docker volume ls --format "{{.Name}}:{{.Driver}}"`)
    const volumes: VolumeInfo[] = []

    if (output) {
      const lines = output.split("
").filter(line => line.trim())
      
      for (const line of lines) {
        const [name, driver] = line.split(":")
        
        // Match volumes that contain the project name
        if (name.includes(projectName)) {
          // Get detailed volume information
          try {
            const inspectOutput = execCommand(`docker volume inspect ${name}`)
            const volumeData = JSON.parse(inspectOutput)[0]
            
            volumes.push({
              name,
              driver: driver || "local",
              mountpoint: volumeData.Mountpoint || ""
            })
          } catch (error) {
            console.log(`⚠️  Could not inspect volume ${name}: ${error}`)
          }
        }
      }
    }

    return volumes
  } catch (error) {
    console.log(`⚠️  Failed to list volumes: ${error}`)
    return []
  }
}

/**
 * Find networks related to a project
 */
async function findProjectNetworks(projectName: string): Promise<NetworkInfo[]> {
  try {
    const output = execCommand(`docker network ls --format "{{.ID}}:{{.Name}}:{{.Driver}}"`)
    const networks: NetworkInfo[] = []

    if (output) {
      const lines = output.split("
").filter(line => line.trim())
      
      for (const line of lines) {
        const [id, name, driver] = line.split(":")
        
        // Skip default networks
        if (["bridge", "host", "none"].includes(name)) {
          continue
        }
        
        // Match networks that contain the project name
        if (name.includes(projectName)) {
          networks.push({
            id,
            name,
            driver: driver || "bridge"
          })
        }
      }
    }

    return networks
  } catch (error) {
    console.log(`⚠️  Failed to list networks: ${error}`)
    return []
  }
}

/**
 * Copy a single volume
 */
async function copyVolume(
  sourceVolume: VolumeInfo, 
  sourceProject: string, 
  targetProject: string
): Promise<void> {
  try {
    const targetVolumeName = sourceVolume.name.replace(
      new RegExp(sourceProject, "g"), 
      targetProject
    )

    // Create target volume
    execCommand(`docker volume create ${targetVolumeName}`)
    console.log(`📁 Created volume: ${targetVolumeName}`)

    // Copy data from source to target using a temporary container
    const copyCommand = [
      "docker", "run", "--rm",
      "-v", `${sourceVolume.name}:/source:ro`,
      "-v", `${targetVolumeName}:/target`,
      "alpine",
      "sh", "-c", "cp -a /source/. /target/ 2>/dev/null || true"
    ].join(" ")

    execCommand(copyCommand)
    console.log(`✅ Copied data: ${sourceVolume.name} → ${targetVolumeName}`)
  } catch (error: any) {
    console.log(`⚠️  Failed to copy volume ${sourceVolume.name}: ${error.message}`)
  }
}

/**
 * Copy a single network
 */
async function copyNetwork(
  sourceNetwork: NetworkInfo, 
  sourceProject: string, 
  targetProject: string
): Promise<void> {
  try {
    const targetNetworkName = sourceNetwork.name.replace(
      new RegExp(sourceProject, "g"), 
      targetProject
    )

    // Get network configuration
    const inspectOutput = execCommand(`docker network inspect ${sourceNetwork.name}`)
    const networkData = JSON.parse(inspectOutput)[0]

    // Create target network with similar configuration
    const createArgs = [
      "docker", "network", "create",
      "--driver", sourceNetwork.driver
    ]

    // Add subnet if specified
    if (networkData.IPAM && networkData.IPAM.Config && networkData.IPAM.Config[0]) {
      const config = networkData.IPAM.Config[0]
      if (config.Subnet) {
        // Modify subnet to avoid conflicts
        const subnet = adjustSubnet(config.Subnet)
        createArgs.push("--subnet", subnet)
      }
    }

    createArgs.push(targetNetworkName)

    execCommand(createArgs.join(" "))
    console.log(`🌐 Created network: ${targetNetworkName}`)
  } catch (error: any) {
    console.log(`⚠️  Failed to copy network ${sourceNetwork.name}: ${error.message}`)
  }
}

/**
 * Adjust subnet to avoid conflicts
 */
function adjustSubnet(originalSubnet: string): string {
  // Simple subnet adjustment - increment the third octet
  const match = originalSubnet.match(/^(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)\\/(\\d+)$/)
  if (match) {
    const [, a, b, c, d, mask] = match
    const newC = (parseInt(c, 10) + 1) % 256
    return `${a}.${b}.${newC}.${d}/${mask}`
  }
  return originalSubnet
}

/**
 * Generate project name from worktree path
 */
export function generateProjectName(worktreePath: string): string {
  return path
    .basename(worktreePath)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

/**
 * Check if Docker is available and running
 */
export function checkDockerAvailable(): boolean {
  try {
    execCommand("docker info")
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get running containers for a project
 */
export function getProjectContainers(projectName: string): ContainerInfo[] {
  try {
    const output = execCommand(
      `docker ps --format "{{.ID}}:{{.Names}}:{{.Image}}:{{.Status}}:{{.Ports}}"`
    )
    
    const containers: ContainerInfo[] = []
    
    if (output) {
      const lines = output.split("
").filter(line => line.trim())
      
      for (const line of lines) {
        const [id, names, image, status, ports] = line.split(":")
        
        if (names.includes(projectName)) {
          containers.push({
            id,
            name: names,
            image,
            status,
            ports: ports ? ports.split(",").map(p => p.trim()) : []
          })
        }
      }
    }
    
    return containers
  } catch (error) {
    return []
  }
}