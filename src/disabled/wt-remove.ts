import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import { loadConfig } from "../config/loader.js"
import { generateProjectName, getProjectContainers } from "../docker/copy.js"
import { stopServices } from "../docker/compose.js"
import { execCommand, getDockerVolumes } from "../utils/docker.js"
import {
  branchExists,
  getCurrentBranch,
  getGitRoot,
  getWorktreePath,
  isGitRepository,
  removeWorktreeAsync,
} from "../utils/git.js"

export function wtRemoveCommand(): Command {
  return new Command("remove")
    .description("Remove a worktree and its Docker environment (wturbo -b <branch> --remove)")
    .argument("<branch-name>", "Name of the branch/worktree to remove")
    .option("--keep-volumes", "Keep Docker volumes when removing")
    .option("--keep-containers", "Keep Docker containers when removing") 
    .option("--force", "Force removal without confirmation")
    .option("--build", "Compatibility flag (ignored in remove)")
    .action(async (branchName: string, options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        const gitRoot = getGitRoot()
        const config = loadConfig(gitRoot)

        console.log(`🗑️  Removing worktree '${branchName}' with WTurbo...`)

        // Validate inputs
        await validateRemovalInputs(branchName)

        const worktreePath = await getWorktreePath(branchName)
        if (!worktreePath) {
          throw new Error(`No worktree found for branch '${branchName}'`)
        }

        // Analyze what will be removed
        const removalPlan = await analyzeRemovalPlan(worktreePath, branchName, config)
        
        // Show removal plan
        displayRemovalPlan(removalPlan, options)

        // Confirm removal unless --force is specified
        if (!options.force) {
          const confirmed = await confirmRemoval()
          if (!confirmed) {
            console.log("❌ Removal cancelled")
            process.exit(0)
          }
        }

        // Execute removal
        await executeRemoval(worktreePath, branchName, config, removalPlan, options)

        console.log(`\n✅ Worktree '${branchName}' removed successfully!`)
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`)
        process.exit(1)
      }
    })
}

async function validateRemovalInputs(branchName: string): Promise<void> {
  // Check if trying to remove current branch
  const currentBranch = getCurrentBranch()
  if (branchName === currentBranch) {
    throw new Error("Cannot remove the currently active worktree. Switch to a different worktree first")
  }

  // Check if branch exists
  if (!(await branchExists(branchName))) {
    throw new Error(`Branch '${branchName}' does not exist`)
  }
}

interface RemovalPlan {
  worktreePath: string
  projectName: string
  containers: Array<{ id: string; name: string; image: string }>
  volumes: Array<{ name: string; driver: string }>
  networks: Array<{ name: string; driver: string }>
  composeFile: string | null
  envFiles: string[]
}

async function analyzeRemovalPlan(
  worktreePath: string,
  branchName: string,
  config: any
): Promise<RemovalPlan> {
  const projectName = generateProjectName(worktreePath)

  // Check if worktree path exists
  if (!fs.existsSync(worktreePath)) {
    console.log(`⚠️  Worktree path does not exist: ${worktreePath}`)
  }

  // Find related containers
  const containers = getProjectContainers(projectName)

  // Find related volumes
  const allVolumes = getDockerVolumes()
  const relatedVolumes = allVolumes.filter(volume =>
    volume.name.includes(projectName) ||
    volume.name.includes(branchName) ||
    volume.name.includes("wturbo")
  )

  // Find related networks
  const networks = await findProjectNetworks(projectName)

  // Find compose file
  const composeFile = findComposeFile(worktreePath, config)

  // Find environment files
  const envFiles = findEnvironmentFiles(worktreePath, config)

  return {
    worktreePath,
    projectName,
    containers: containers.map(c => ({ id: c.id, name: c.name, image: c.image })),
    volumes: relatedVolumes.map(v => ({ name: v.name, driver: v.driver })),
    networks,
    composeFile,
    envFiles
  }
}

async function findProjectNetworks(projectName: string): Promise<Array<{ name: string; driver: string }>> {
  try {
    const output = execCommand(`docker network ls --format "{{.Name}}:{{.Driver}}"`)
    const networks: Array<{ name: string; driver: string }> = []

    if (output) {
      const lines = output.split("\\n").filter(line => line.trim())
      
      for (const line of lines) {
        const [name, driver] = line.split(":")
        
        // Skip default networks
        if (["bridge", "host", "none"].includes(name)) {
          continue
        }
        
        // Match networks that contain the project name
        if (name.includes(projectName)) {
          networks.push({ name, driver: driver || "bridge" })
        }
      }
    }

    return networks
  } catch (error) {
    return []
  }
}

function findComposeFile(worktreePath: string, config: any): string | null {
  if (!fs.existsSync(worktreePath)) {
    return null
  }

  const composeFileName = path.basename(config.docker_compose_file || "docker-compose.yaml")
  const composeFile = path.join(worktreePath, composeFileName)
  
  return fs.existsSync(composeFile) ? composeFile : null
}

function findEnvironmentFiles(worktreePath: string, config: any): string[] {
  if (!fs.existsSync(worktreePath)) {
    return []
  }

  const envFiles: string[] = []

  // Check configured env files
  if (config.env && config.env.file) {
    config.env.file.forEach((envFile: string) => {
      const fullPath = path.join(worktreePath, envFile)
      if (fs.existsSync(fullPath)) {
        envFiles.push(fullPath)
      }
    })
  }

  // Check for .env.wturbo
  const wtEnvFile = path.join(worktreePath, ".env.wturbo")
  if (fs.existsSync(wtEnvFile)) {
    envFiles.push(wtEnvFile)
  }

  return envFiles
}

function displayRemovalPlan(plan: RemovalPlan, options: any): void {
  console.log(`\n📋 Removal Plan for '${path.basename(plan.worktreePath)}'`)
  console.log(`📁 Worktree path: ${plan.worktreePath}`)

  if (plan.containers.length > 0) {
    console.log(`🐳 Containers to ${options.keepContainers ? "keep" : "stop and remove"}: ${plan.containers.length}`)
    plan.containers.forEach(container => {
      console.log(`   - ${container.name} (${container.image})`)
    })
  }

  if (plan.volumes.length > 0) {
    console.log(`💾 Volumes to ${options.keepVolumes ? "keep" : "remove"}: ${plan.volumes.length}`)
    plan.volumes.forEach(volume => {
      console.log(`   - ${volume.name}`)
    })
  }

  if (plan.networks.length > 0) {
    console.log(`🌐 Networks to remove: ${plan.networks.length}`)
    plan.networks.forEach(network => {
      console.log(`   - ${network.name}`)
    })
  }

  if (plan.composeFile) {
    console.log(`📄 Docker Compose file: ${path.basename(plan.composeFile)}`)
  }

  if (plan.envFiles.length > 0) {
    console.log(`🔧 Environment files: ${plan.envFiles.length}`)
    plan.envFiles.forEach(file => {
      console.log(`   - ${path.basename(file)}`)
    })
  }
}

async function confirmRemoval(): Promise<boolean> {
  const readline = await import("node:readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question(
      "\\n❓ Are you sure you want to remove this worktree and its Docker environment? (y/N): ",
      resolve
    )
  })

  rl.close()
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes"
}

async function executeRemoval(
  worktreePath: string,
  branchName: string,
  config: any,
  plan: RemovalPlan,
  options: any
): Promise<void> {
  console.log(`\\n🗑️  Executing removal...`)

  // Stop Docker Compose services first
  if (plan.composeFile) {
    try {
      console.log("⏹️  Stopping Docker Compose services...")
      stopServices(plan.composeFile, {
        projectName: plan.projectName,
        removeVolumes: !options.keepVolumes
      })
      console.log("✅ Docker Compose services stopped")
    } catch (error) {
      console.log(`⚠️  Failed to stop Docker Compose services: ${error}`)
    }
  }

  // Remove containers
  if (plan.containers.length > 0 && !options.keepContainers) {
    console.log("🐳 Removing containers...")
    for (const container of plan.containers) {
      try {
        execCommand(`docker stop ${container.id}`)
        execCommand(`docker rm ${container.id}`)
        console.log(`✅ Container removed: ${container.name}`)
      } catch (error) {
        console.log(`⚠️  Failed to remove container ${container.name}: ${error}`)
      }
    }
  }

  // Remove volumes
  if (plan.volumes.length > 0 && !options.keepVolumes) {
    console.log("💾 Removing volumes...")
    for (const volume of plan.volumes) {
      try {
        execCommand(`docker volume rm ${volume.name}`)
        console.log(`✅ Volume removed: ${volume.name}`)
      } catch (error) {
        console.log(`⚠️  Failed to remove volume ${volume.name}: ${error}`)
      }
    }
  }

  // Remove networks
  if (plan.networks.length > 0) {
    console.log("🌐 Removing networks...")
    for (const network of plan.networks) {
      try {
        execCommand(`docker network rm ${network.name}`)
        console.log(`✅ Network removed: ${network.name}`)
      } catch (error) {
        console.log(`⚠️  Failed to remove network ${network.name}: ${error}`)
      }
    }
  }

  // Remove git worktree
  try {
    console.log("📁 Removing git worktree...")
    await removeWorktreeAsync(worktreePath)
    console.log("✅ Git worktree removed")
  } catch (error: any) {
    throw new Error(`Failed to remove git worktree: ${error.message}`)
  }

  // Clean up orphaned resources
  try {
    console.log("🧹 Cleaning up orphaned Docker resources...")
    execCommand("docker system prune -f")
    console.log("✅ Orphaned resources cleaned up")
  } catch (error) {
    console.log(`⚠️  Failed to clean up orphaned resources: ${error}`)
  }
}