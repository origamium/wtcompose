import * as path from "node:path"
import { Command } from "commander"
import * as fs from "fs-extra"
import { loadConfig } from "../config/loader.js"
import { checkDockerAvailable, copyDockerResources, generateProjectName } from "../docker/copy.js"
import { startServices, updateComposeProject } from "../docker/compose.js"
import { processEnvironmentFiles } from "../env/adjuster.js"
import { writeEnvFile } from "../env/processor.js"
import {
  branchExists,
  createWorktreeAsync,
  getCurrentBranch,
  getGitRoot,
  isGitRepository,
} from "../utils/git.js"

export function wtCreateCommand(): Command {
  return new Command("create")
    .description("Create a new worktree with isolated Docker environment (wturbo -b)")
    .argument("<branch-name>", "Name of the branch/worktree to create")
    .option("-p, --path <path>", "Custom path for the worktree")
    .option("--build", "Run docker-compose up with --build flag")
    .option("--no-docker", "Skip Docker environment setup")
    .option("--no-copy", "Skip copying existing Docker resources")
    .action(async (branchName: string, options) => {
      try {
        // Validate git repository
        if (!isGitRepository()) {
          console.error("Error: Not in a git repository")
          process.exit(1)
        }

        // Check Docker availability
        if (!options.docker && !checkDockerAvailable()) {
          console.error("Error: Docker is not available or running")
          console.error("Please start Docker or use --no-docker flag")
          process.exit(1)
        }

        const gitRoot = getGitRoot()
        const config = loadConfig(gitRoot)

        console.log(`🚀 Creating worktree '${branchName}' with WTurbo...`)

        // Determine worktree path
        const worktreePath = options.path || path.join(gitRoot, "..", `${path.basename(gitRoot)}-${branchName}`)

        // Validate inputs
        await validateInputs(branchName, worktreePath, config)

        // Create git worktree
        await createWorktreeAsync(branchName, worktreePath)
        console.log(`✅ Git worktree created at: ${worktreePath}`)

        if (options.docker) {
          // Setup Docker environment
          await setupWTurboDockerEnvironment(
            gitRoot,
            worktreePath,
            branchName,
            config,
            {
              build: options.build,
              copyResources: options.copy
            }
          )
        }

        console.log(`\n🎉 Worktree '${branchName}' created successfully!`)
        console.log(`📁 Path: ${worktreePath}`)
        console.log(`\nTo start working:`)
        console.log(`  cd ${worktreePath}`)
        if (options.docker && !options.build) {
          console.log(`  docker-compose up -d`)
        }
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`)
        process.exit(1)
      }
    })
}

async function validateInputs(
  branchName: string,
  worktreePath: string,
  config: any
): Promise<void> {
  // Check if branch already exists
  if (await branchExists(branchName)) {
    throw new Error(`Branch '${branchName}' already exists`)
  }

  // Check if worktree path already exists
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Path '${worktreePath}' already exists`)
  }

  // Check if trying to create branch with same name as current
  const currentBranch = getCurrentBranch()
  if (branchName === currentBranch) {
    throw new Error(`Cannot create worktree with same name as current branch '${currentBranch}'`)
  }

  // Validate Docker Compose file exists
  const composeFile = path.resolve(path.dirname(config.docker_compose_file || "./docker-compose.yaml"))
  if (!fs.existsSync(composeFile)) {
    console.log(`⚠️  Docker Compose file not found: ${config.docker_compose_file}`)
  }
}

async function setupWTurboDockerEnvironment(
  sourceDir: string,
  targetDir: string,
  branchName: string,
  config: any,
  options: {
    build?: boolean
    copyResources?: boolean
  }
): Promise<void> {
  console.log("🐳 Setting up WTurbo Docker environment...")

  const sourceProjectName = generateProjectName(sourceDir)
  const targetProjectName = generateProjectName(targetDir)

  try {
    // Copy Docker Compose file and adjust it
    await copyAndAdjustComposeFile(sourceDir, targetDir, config, targetProjectName)

    // Process environment files
    if (config.env && config.env.file && config.env.file.length > 0) {
      await processEnvironmentVariables(sourceDir, targetDir, config, branchName)
    }

    // Copy Docker resources (containers, volumes, networks)
    if (options.copyResources) {
      await copyDockerResources(sourceProjectName, targetProjectName, {
        copyContainers: false, // Containers will be recreated
        copyVolumes: true,
        copyNetworks: true
      })
    }

    // Start services if build flag is specified
    if (options.build) {
      const composeFile = getComposeFilePath(targetDir, config)
      if (composeFile) {
        console.log("🏗️  Building and starting services...")
        startServices(composeFile, {
          build: true,
          projectName: targetProjectName
        })
        console.log("✅ Services started successfully")
      }
    }

  } catch (error: any) {
    throw new Error(`Failed to setup Docker environment: ${error.message}`)
  }
}

async function copyAndAdjustComposeFile(
  sourceDir: string,
  targetDir: string,
  config: any,
  projectName: string
): Promise<void> {
  const sourceComposeFile = path.resolve(sourceDir, config.docker_compose_file)
  const targetComposeFile = path.join(targetDir, path.basename(config.docker_compose_file))

  if (!fs.existsSync(sourceComposeFile)) {
    console.log("⚠️  No docker-compose file found, skipping Docker setup")
    return
  }

  console.log(`📋 Copying Docker Compose file: ${path.basename(sourceComposeFile)}`)

  // Copy compose file
  fs.copyFileSync(sourceComposeFile, targetComposeFile)

  // Update with project-specific settings
  updateComposeProject(targetComposeFile, projectName)

  console.log(`✅ Docker Compose configuration prepared`)
}

async function processEnvironmentVariables(
  sourceDir: string,
  targetDir: string,
  config: any,
  branchName: string
): Promise<void> {
  console.log("🔧 Processing environment variables...")

  try {
    // Resolve source environment file paths
    const sourceEnvFiles = config.env.file.map((file: string) => 
      path.resolve(sourceDir, file)
    )

    // Process environment files with adjustments
    const processedFiles = await processEnvironmentFiles(sourceEnvFiles, config.env.adjust || {})

    // Write adjusted files to target directory
    for (const [sourceFilePath, entries] of Object.entries(processedFiles)) {
      const relativePath = path.relative(sourceDir, sourceFilePath)
      const targetFilePath = path.join(targetDir, relativePath)

      // Ensure target directory exists
      fs.ensureDirSync(path.dirname(targetFilePath))

      // Write adjusted environment file
      writeEnvFile(targetFilePath, entries as any[])
      console.log(`✅ Environment file processed: ${relativePath}`)
    }

    // Create .env.wturbo with worktree-specific variables
    const wtEnvFile = path.join(targetDir, ".env.wturbo")
    const wtEnvContent = `# WTurbo worktree-specific environment variables
WTURBO_BRANCH=${branchName}
WTURBO_WORKTREE=true
WTURBO_PROJECT=${generateProjectName(targetDir)}
COMPOSE_PROJECT_NAME=${generateProjectName(targetDir)}
`
    fs.writeFileSync(wtEnvFile, wtEnvContent)
    console.log(`✅ WTurbo environment file created: .env.wturbo`)

  } catch (error: any) {
    throw new Error(`Environment processing failed: ${error.message}`)
  }
}

function getComposeFilePath(targetDir: string, config: any): string | null {
  const composeFile = path.join(targetDir, path.basename(config.docker_compose_file))
  return fs.existsSync(composeFile) ? composeFile : null
}