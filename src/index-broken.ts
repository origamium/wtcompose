#!/usr/bin/env node

import { Command } from "commander"
// import { wtCreateCommand } from "./commands/wt-create.js"
// import { wtRemoveCommand } from "./commands/wt-remove.js"
import { statusCommand } from "./commands/status.js"

const program = new Command()

program
  .name("wturbo")
  .description("Git worktree management with Docker Compose environment isolation")
  .version("1.0.0")

// Add the main wturbo command that handles -b flag
program
  .option("-b, --branch <name>", "Create worktree for branch")
  .option("--build", "Run docker-compose up with --build flag")
  .option("--remove", "Remove worktree and Docker environment")
  .action(async (options) => {
    if (!options.branch) {
      program.help()
      return
    }

    if (options.remove) {
      console.log(`🗑️  Remove functionality will be implemented for branch: ${options.branch}`)
    } else {
      console.log(`🚀 Create functionality will be implemented for branch: ${options.branch}${options.build ? " with build" : ""}`)
    }
  })

// TODO: Add subcommands for more explicit usage
// program.addCommand(wtCreateCommand())
// program.addCommand(wtRemoveCommand())
program.addCommand(statusCommand())

// Keep backward compatibility commands
program
  .command("hello")
  .description("Say hello")
  .option("-n, --name <name>", "name to greet", "World")
  .action((options) => {
    console.log(`Hello, ${options.name}!`)
  })

program
  .command("info")
  .description("Show information about the CLI")
  .action(() => {
    console.log("WTurbo - Git worktree management with Docker Compose environment isolation")
    console.log("
This tool helps you create isolated development environments by:")
    console.log("- Creating git worktrees for different branches")
    console.log("- Copying and adjusting Docker Compose configurations")
    console.log("- Copying existing containers, volumes, and networks for fast setup")
    console.log("- Automatically adjusting ports and environment variables")
    console.log("- Managing container and volume lifecycles")
    console.log("
Usage:")
    console.log("  wturbo -b <branch>          Create worktree with Docker environment")
    console.log("  wturbo -b <branch> --build  Create worktree and build containers") 
    console.log("  wturbo -b <branch> --remove Remove worktree and Docker environment")
    console.log("
Tech stack:")
    console.log("- TypeScript for type safety")
    console.log("- Commander.js for CLI framework")
    console.log("- Simple-git for Git operations")
    console.log("- Biome for linting and formatting")
    console.log("- Docker & Docker Compose for containerization")
  })

program.parse()
