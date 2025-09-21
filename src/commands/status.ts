import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import { getDockerVolumes, getRunningContainers, readComposeFile } from "../utils/docker.js"
import { getCurrentBranch, getGitRoot, isGitRepository, listWorktrees } from "../utils/git.js"

export function statusCommand(): Command {
  return new Command("status")
    .description("Show status of worktrees and their Docker environments")
    .option("-a, --all", "Show all worktrees, not just current")
    .option("--docker-only", "Show only Docker-related information")
    .action(async (options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        if (!options.dockerOnly) {
          await showWorktreeStatus(options.all)
        }

        await showDockerStatus()
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
      }
    })
}

async function showWorktreeStatus(showAll: boolean): Promise<void> {
  console.log("📁 Git Worktrees Status\n")

  const worktrees = listWorktrees()
  const currentBranch = getCurrentBranch()

  if (worktrees.length === 0) {
    console.log("No worktrees found")
    return
  }

  const filteredWorktrees = showAll
    ? worktrees
    : worktrees.filter((w) => w.branch === currentBranch)

  for (const worktree of filteredWorktrees) {
    const isMain = worktree.path === getGitRoot()
    const isCurrent = worktree.branch === currentBranch

    console.log(`${isCurrent ? "→" : " "} ${worktree.branch}${isMain ? " (main)" : ""}`)
    console.log(`   📂 ${worktree.path}`)

    // Check for Docker Compose file
    const composeFiles = [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ]

    let hasCompose = false
    let composeFile = ""

    for (const file of composeFiles) {
      const filePath = path.join(worktree.path, file)
      if (fs.existsSync(filePath)) {
        hasCompose = true
        composeFile = file
        break
      }
    }

    if (hasCompose) {
      console.log(`   🐳 Docker: ${composeFile}`)

      try {
        const config = readComposeFile(path.join(worktree.path, composeFile))
        const serviceCount = Object.keys(config.services || {}).length
        console.log(`   📦 Services: ${serviceCount}`)
      } catch (_error) {
        console.log(`   ⚠️  Error reading compose file`)
      }
    } else {
      console.log(`   🐳 Docker: No compose file`)
    }

    // Check for environment files
    const envFiles = [".env", ".env.local"]
    const existingEnvFiles = envFiles.filter((file) =>
      fs.existsSync(path.join(worktree.path, file))
    )

    if (existingEnvFiles.length > 0) {
      console.log(`   🔧 Environment: ${existingEnvFiles.join(", ")}`)
    }

    console.log()
  }
}

async function showDockerStatus(): Promise<void> {
  console.log("🐳 Docker Environment Status\n")

  // Show running containers
  const containers = getRunningContainers()
  console.log(`📦 Running Containers: ${containers.length}`)

  if (containers.length > 0) {
    console.log()
    containers.forEach((container) => {
      const isWtcompose =
        container.name.includes("wtcompose") ||
        Object.keys(process.env).some(
          (key) => key.startsWith("WTCOMPOSE") && container.name.includes(process.env[key] || "")
        )

      console.log(`${isWtcompose ? "🌿" : "📦"} ${container.name}`)
      console.log(`   🏷️  Image: ${container.image}`)
      console.log(`   🔗 Status: ${container.status}`)

      if (container.ports.length > 0) {
        console.log(`   🔌 Ports: ${container.ports.join(", ")}`)
      }

      console.log()
    })
  }

  // Show volumes
  const volumes = getDockerVolumes()
  const wtcomposeVolumes = volumes.filter(
    (v) =>
      v.name.includes("wtcompose") ||
      v.name.match(/.*-.*wtcompose.*/) ||
      v.name.includes("worktree")
  )

  console.log(`🗂️  Total Volumes: ${volumes.length}`)
  if (wtcomposeVolumes.length > 0) {
    console.log(`🌿 WTCompose Volumes: ${wtcomposeVolumes.length}`)
    console.log()

    wtcomposeVolumes.forEach((volume) => {
      console.log(`   📁 ${volume.name}`)
      console.log(`      Driver: ${volume.driver}`)
    })
    console.log()
  }

  // Show Docker system info
  try {
    const { execCommand } = await import("../utils/docker.js")
    const dockerVersion = execCommand("docker --version")
    const composeVersion = execCommand("docker-compose --version").split(" ")[2] || "unknown"

    console.log("🔧 Docker Information")
    console.log(`   ${dockerVersion}`)
    console.log(`   Docker Compose: ${composeVersion}`)
  } catch (_error) {
    console.log("⚠️  Could not retrieve Docker version information")
  }
}
