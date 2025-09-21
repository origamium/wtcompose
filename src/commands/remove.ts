import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import { execCommand, getDockerVolumes, getRunningContainers } from "../utils/docker.js"
import {
  branchExists,
  getCurrentBranch,
  getWorktreePath,
  isGitRepository,
  removeWorktree,
} from "../utils/git.js"

export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a worktree and its Docker environment")
    .argument("<branch-name>", "Name of the branch/worktree to remove")
    .option("--keep-volumes", "Keep Docker volumes when removing")
    .option("--keep-containers", "Keep Docker containers when removing")
    .option("--force", "Force removal without confirmation")
    .action(async (branchName: string, options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        // Check if trying to remove current branch
        const currentBranch = getCurrentBranch()
        if (branchName === currentBranch) {
          console.error("Error: Cannot remove the currently active worktree")
          console.error("Switch to a different worktree first")
          process.exit(1)
        }

        // Check if branch exists
        if (!branchExists(branchName)) {
          console.error(`Error: Branch '${branchName}' does not exist`)
          process.exit(1)
        }

        const worktreePath = getWorktreePath(branchName)
        if (!worktreePath) {
          console.error(`Error: No worktree found for branch '${branchName}'`)
          process.exit(1)
        }

        // Check if worktree path exists
        if (!fs.existsSync(worktreePath)) {
          console.error(`Error: Worktree path does not exist: ${worktreePath}`)
          process.exit(1)
        }

        // Show what will be removed
        console.log(`📁 Worktree to remove: ${branchName}`)
        console.log(`📂 Path: ${worktreePath}`)

        const dockerResources = await analyzeDockerResources(worktreePath, branchName)

        if (dockerResources.containers.length > 0) {
          console.log(`🐳 Containers to stop: ${dockerResources.containers.length}`)
          dockerResources.containers.forEach((c) => console.log(`   - ${c.name}`))
        }

        if (dockerResources.volumes.length > 0) {
          console.log(
            `🗂️  Volumes to ${options.keepVolumes ? "keep" : "remove"}: ${dockerResources.volumes.length}`
          )
          dockerResources.volumes.forEach((v) => console.log(`   - ${v.name}`))
        }

        // Confirm removal unless --force is specified
        if (!options.force) {
          const readline = await import("node:readline")
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              "\nAre you sure you want to remove this worktree and its Docker environment? (y/N): ",
              resolve
            )
          })

          rl.close()

          if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
            console.log("Removal cancelled")
            process.exit(0)
          }
        }

        console.log(`\nRemoving worktree '${branchName}'...`)

        // Stop and remove Docker resources
        await cleanupDockerEnvironment(worktreePath, branchName, dockerResources, options)

        // Remove git worktree
        removeWorktree(worktreePath)
        console.log(`✓ Git worktree removed`)

        console.log(`\n✅ Worktree '${branchName}' removed successfully!`)
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
      }
    })
}

interface DockerResources {
  containers: Array<{ id: string; name: string }>
  volumes: Array<{ name: string }>
  networks: Array<{ name: string }>
}

async function analyzeDockerResources(
  worktreePath: string,
  branchName: string
): Promise<DockerResources> {
  const projectName = path
    .basename(worktreePath)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()

  // Find related containers
  const allContainers = getRunningContainers()
  const relatedContainers = allContainers.filter(
    (container) =>
      container.name.includes(projectName) ||
      container.name.includes(branchName) ||
      container.name.includes("wtcompose")
  )

  // Find related volumes
  const allVolumes = getDockerVolumes()
  const relatedVolumes = allVolumes.filter(
    (volume) =>
      volume.name.includes(projectName) ||
      volume.name.includes(branchName) ||
      volume.name.includes("wtcompose")
  )

  return {
    containers: relatedContainers.map((c) => ({ id: c.id, name: c.name })),
    volumes: relatedVolumes.map((v) => ({ name: v.name })),
    networks: [], // Networks are typically handled by docker-compose
  }
}

async function cleanupDockerEnvironment(
  worktreePath: string,
  _branchName: string,
  resources: DockerResources,
  options: any
): Promise<void> {
  console.log("🧹 Cleaning up Docker environment...")

  // Stop and remove containers
  if (resources.containers.length > 0 && !options.keepContainers) {
    console.log("🐳 Stopping containers...")

    for (const container of resources.containers) {
      try {
        execCommand(`docker stop ${container.id}`)
        execCommand(`docker rm ${container.id}`)
        console.log(`✓ Container removed: ${container.name}`)
      } catch (error) {
        console.log(`⚠️  Failed to remove container ${container.name}: ${error}`)
      }
    }
  }

  // Try to run docker-compose down if compose file exists
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]

  let composeFile: string | null = null
  for (const file of composeFiles) {
    const filePath = path.join(worktreePath, file)
    if (fs.existsSync(filePath)) {
      composeFile = filePath
      break
    }
  }

  if (composeFile) {
    try {
      console.log("📋 Running docker-compose down...")
      execCommand(`docker-compose -f ${composeFile} down${options.keepVolumes ? "" : " -v"}`)
      console.log(`✓ Docker Compose environment cleaned up`)
    } catch (error) {
      console.log(`⚠️  Failed to run docker-compose down: ${error}`)
    }
  }

  // Remove volumes if requested
  if (resources.volumes.length > 0 && !options.keepVolumes) {
    console.log("🗂️  Removing volumes...")

    for (const volume of resources.volumes) {
      try {
        execCommand(`docker volume rm ${volume.name}`)
        console.log(`✓ Volume removed: ${volume.name}`)
      } catch (error) {
        console.log(`⚠️  Failed to remove volume ${volume.name}: ${error}`)
      }
    }
  }

  // Clean up orphaned networks
  try {
    execCommand("docker network prune -f")
    console.log(`✓ Orphaned networks cleaned up`)
  } catch (error) {
    console.log(`⚠️  Failed to clean up networks: ${error}`)
  }
}
