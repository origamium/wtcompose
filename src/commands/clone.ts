import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import {
  adjustPortsInCompose,
  execCommand,
  getRunningContainers,
  getUsedPorts,
  readComposeFile,
  writeComposeFile,
} from "../utils/docker.js"
import {
  branchExists,
  createWorktree,
  getGitRoot,
  getWorktreePath,
  isGitRepository,
} from "../utils/git.js"

export function cloneCommand(): Command {
  return new Command("clone")
    .description("Clone an existing worktree with its Docker environment")
    .argument("<source-branch>", "Source branch/worktree to clone from")
    .argument("<target-branch>", "Target branch name for the new worktree")
    .option("-p, --path <path>", "Custom path for the new worktree")
    .option("--no-containers", "Skip container duplication")
    .option("--no-volumes", "Skip volume duplication")
    .action(async (sourceBranch: string, targetBranch: string, options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        const gitRoot = getGitRoot()

        // Check if source branch exists and get its worktree path
        if (!branchExists(sourceBranch)) {
          console.error(`Error: Source branch '${sourceBranch}' does not exist`)
          process.exit(1)
        }

        const sourceWorktreePath = getWorktreePath(sourceBranch)
        if (!sourceWorktreePath) {
          console.error(`Error: No worktree found for branch '${sourceBranch}'`)
          process.exit(1)
        }

        // Check if target branch already exists
        if (branchExists(targetBranch)) {
          console.error(`Error: Target branch '${targetBranch}' already exists`)
          process.exit(1)
        }

        const targetWorktreePath =
          options.path || path.join(gitRoot, "..", `${path.basename(gitRoot)}-${targetBranch}`)

        // Check if target worktree path already exists
        if (fs.existsSync(targetWorktreePath)) {
          console.error(`Error: Path '${targetWorktreePath}' already exists`)
          process.exit(1)
        }

        console.log(`Cloning worktree from '${sourceBranch}' to '${targetBranch}'...`)

        // Create new worktree from source branch
        createWorktree(targetBranch, targetWorktreePath)
        console.log(`✓ Git worktree created at: ${targetWorktreePath}`)

        // Clone Docker environment
        await cloneDockerEnvironment(
          sourceWorktreePath,
          targetWorktreePath,
          sourceBranch,
          targetBranch,
          options
        )

        console.log(`\n✅ Worktree '${targetBranch}' cloned successfully!`)
        console.log(`📁 Source: ${sourceWorktreePath}`)
        console.log(`📁 Target: ${targetWorktreePath}`)
        console.log(`\nTo start working:`)
        console.log(`  cd ${targetWorktreePath}`)
        console.log(`  docker-compose up -d`)
      } catch (error: any) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
      }
    })
}

async function cloneDockerEnvironment(
  sourceDir: string,
  targetDir: string,
  sourceBranch: string,
  targetBranch: string,
  options: any
): Promise<void> {
  console.log("Cloning Docker environment...")

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

    // Update environment variables for the new worktree
    Object.keys(adjustedConfig.services).forEach((serviceName) => {
      const service = adjustedConfig.services[serviceName]
      if (!service.environment) {
        service.environment = {}
      }
      service.environment.WTCOMPOSE_BRANCH = targetBranch
      service.environment.WTCOMPOSE_WORKTREE = "true"
    })

    // Write the adjusted compose file to the new worktree
    const targetComposeFile = path.join(targetDir, path.basename(sourceComposeFile))
    writeComposeFile(targetComposeFile, adjustedConfig)
    console.log(`✓ Docker Compose configuration cloned and adjusted`)

    // Copy environment files
    await copyEnvironmentFiles(sourceDir, targetDir, targetBranch)

    // Clone volumes if requested
    if (!options.volumes) {
      await cloneVolumes(sourceDir, targetDir, sourceBranch, targetBranch)
    }

    // Clone containers if requested
    if (!options.containers) {
      await cloneContainers(sourceDir, targetDir, sourceBranch, targetBranch)
    }
  } catch (error: any) {
    console.error(`Failed to clone Docker environment: ${error.message}`)
    throw error
  }
}

async function copyEnvironmentFiles(
  sourceDir: string,
  targetDir: string,
  targetBranch: string
): Promise<void> {
  // Copy .env file if it exists
  const sourceEnvFile = path.join(sourceDir, ".env")
  if (fs.existsSync(sourceEnvFile)) {
    const targetEnvFile = path.join(targetDir, ".env")
    fs.copyFileSync(sourceEnvFile, targetEnvFile)
    console.log(`✓ Environment file copied`)
  }

  // Create .env.local for worktree-specific variables
  const envLocalContent = `# Worktree-specific environment variables
WTCOMPOSE_BRANCH=${targetBranch}
WTCOMPOSE_WORKTREE=true
COMPOSE_PROJECT_NAME=${path
    .basename(targetDir)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()}
`
  fs.writeFileSync(path.join(targetDir, ".env.local"), envLocalContent)
  console.log(`✓ Worktree-specific environment file created`)
}

async function cloneVolumes(
  sourceDir: string,
  targetDir: string,
  _sourceBranch: string,
  _targetBranch: string
): Promise<void> {
  console.log("🗂️  Cloning Docker volumes...")

  try {
    // Get the project name from source directory
    const sourceProjectName = path
      .basename(sourceDir)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
    const targetProjectName = path
      .basename(targetDir)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()

    // List volumes that match the source project pattern
    const volumeOutput = execCommand(
      `docker volume ls --filter name=${sourceProjectName} --format "{{.Name}}"`
    )

    if (volumeOutput) {
      const volumes = volumeOutput.split("\n").filter((v) => v.trim())

      for (const volume of volumes) {
        const newVolumeName = volume.replace(sourceProjectName, targetProjectName)

        try {
          // Create new volume
          execCommand(`docker volume create ${newVolumeName}`)

          // Copy data from source to target volume using a temporary container
          execCommand(
            `docker run --rm -v ${volume}:/source -v ${newVolumeName}:/target alpine sh -c "cp -a /source/. /target/"`
          )

          console.log(`✓ Volume cloned: ${volume} → ${newVolumeName}`)
        } catch (error) {
          console.log(`⚠️  Failed to clone volume ${volume}: ${error}`)
        }
      }
    }
  } catch (error) {
    console.log(`⚠️  Volume cloning failed: ${error}`)
  }
}

async function cloneContainers(
  sourceDir: string,
  _targetDir: string,
  sourceBranch: string,
  _targetBranch: string
): Promise<void> {
  console.log("🐳 Preparing container environment...")

  // Note: We don't actually clone running containers, but we ensure the new environment
  // will have the same configuration when started with docker-compose up

  try {
    const sourceProjectName = path
      .basename(sourceDir)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
    const containers = getRunningContainers().filter(
      (c) => c.name.includes(sourceProjectName) || c.name.includes(sourceBranch)
    )

    if (containers.length > 0) {
      console.log(`📦 Found ${containers.length} containers related to source environment`)
      console.log("ℹ️  New containers will be created when you run 'docker-compose up -d'")

      containers.forEach((container) => {
        console.log(`   - ${container.name} (${container.image})`)
      })
    }
  } catch (error) {
    console.log(`⚠️  Container analysis failed: ${error}`)
  }
}
