import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import {
  adjustPortsInCompose,
  getUsedPorts,
  readComposeFile,
  writeComposeFile,
} from "../utils/docker.js"
import { branchExists, createWorktree, getGitRoot, isGitRepository } from "../utils/git.js"

export function createCommand(): Command {
  return new Command("create")
    .description("Create a new worktree with isolated Docker environment")
    .argument("<branch-name>", "Name of the branch/worktree to create")
    .option("-p, --path <path>", "Custom path for the worktree")
    .option("--no-docker", "Skip Docker environment setup")
    .action(async (branchName: string, options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        const gitRoot = getGitRoot()
        const worktreePath =
          options.path || path.join(gitRoot, "..", `${path.basename(gitRoot)}-${branchName}`)

        // Check if branch already exists
        if (branchExists(branchName)) {
          console.error(`Error: Branch '${branchName}' already exists`)
          process.exit(1)
        }

        // Check if worktree path already exists
        if (fs.existsSync(worktreePath)) {
          console.error(`Error: Path '${worktreePath}' already exists`)
          process.exit(1)
        }

        console.log(`Creating worktree for branch '${branchName}'...`)

        // Create git worktree
        createWorktree(branchName, worktreePath)
        console.log(`✓ Git worktree created at: ${worktreePath}`)

        if (!options.docker) {
          // Setup Docker environment
          await setupDockerEnvironment(gitRoot, worktreePath, branchName)
        }

        console.log(`\n✅ Worktree '${branchName}' created successfully!`)
        console.log(`📁 Path: ${worktreePath}`)
        console.log(`\nTo start working:`)
        console.log(`  cd ${worktreePath}`)
        if (!options.docker) {
          console.log(`  docker-compose up -d`)
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
      }
    })
}

async function setupDockerEnvironment(
  sourceDir: string,
  targetDir: string,
  branchName: string
): Promise<void> {
  console.log("Setting up Docker environment...")

  // Look for docker-compose files in source directory
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]

  let sourceComposeFile: string | null = null
  for (const file of composeFiles) {
    const filePath = path.join(sourceDir, file)
    if (fs.existsSync(filePath)) {
      sourceComposeFile = filePath
      break
    }
  }

  if (!sourceComposeFile) {
    console.log("⚠️  No docker-compose file found in source directory")
    return
  }

  console.log(`📋 Found Docker Compose file: ${path.basename(sourceComposeFile)}`)

  try {
    // Read and parse the compose file
    const composeConfig = readComposeFile(sourceComposeFile)

    // Get currently used ports to avoid conflicts
    const usedPorts = getUsedPorts()
    console.log(`📊 Currently used ports: ${usedPorts.join(", ") || "none"}`)

    // Adjust ports in the compose configuration
    const adjustedConfig = adjustPortsInCompose(composeConfig, usedPorts)

    // Add project name prefix to avoid container name conflicts
    if (!adjustedConfig.services) {
      adjustedConfig.services = {}
    }

    // Add environment variable to distinguish this environment
    Object.keys(adjustedConfig.services).forEach((serviceName) => {
      const service = adjustedConfig.services[serviceName]
      if (!service.environment) {
        service.environment = {}
      }
      service.environment.WTCOMPOSE_BRANCH = branchName
      service.environment.WTCOMPOSE_WORKTREE = "true"
    })

    // Write the adjusted compose file to the new worktree
    const targetComposeFile = path.join(targetDir, path.basename(sourceComposeFile))
    writeComposeFile(targetComposeFile, adjustedConfig)
    console.log(`✓ Docker Compose configuration copied and adjusted`)

    // Copy .env file if it exists
    const sourceEnvFile = path.join(sourceDir, ".env")
    if (fs.existsSync(sourceEnvFile)) {
      const targetEnvFile = path.join(targetDir, ".env")
      fs.copyFileSync(sourceEnvFile, targetEnvFile)
      console.log(`✓ Environment file copied`)
    }

    // Create .env.local for worktree-specific variables
    const envLocalContent = `# Worktree-specific environment variables
WTCOMPOSE_BRANCH=${branchName}
WTCOMPOSE_WORKTREE=true
COMPOSE_PROJECT_NAME=${path
      .basename(targetDir)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()}
`
    fs.writeFileSync(path.join(targetDir, ".env.local"), envLocalContent)
    console.log(`✓ Worktree-specific environment file created`)
  } catch (error: any) {
    console.error(`Failed to setup Docker environment: ${error.message}`)
    throw error
  }
}
