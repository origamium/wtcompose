#!/usr/bin/env node

import { Command } from "commander"
import { cloneCommand } from "./commands/clone.js"
import { createCommand } from "./commands/create.js"
import { removeCommand } from "./commands/remove.js"
import { statusCommand } from "./commands/status.js"

const program = new Command()

program
  .name("wtcompose")
  .description("Git worktree management with Docker Compose environment isolation")
  .version("1.0.0")

// Add main commands
program.addCommand(createCommand())
program.addCommand(cloneCommand())
program.addCommand(statusCommand())
program.addCommand(removeCommand())

// Keep existing commands for backward compatibility
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
    console.log("WTCompose - Git worktree management with Docker Compose environment isolation")
    console.log("\nThis tool helps you create isolated development environments by:")
    console.log("- Creating git worktrees for different branches")
    console.log("- Copying and adjusting Docker Compose configurations")
    console.log("- Avoiding port conflicts between environments")
    console.log("- Managing container and volume lifecycles")
    console.log("\nTech stack:")
    console.log("- TypeScript for type safety")
    console.log("- Commander.js for CLI framework")
    console.log("- Biome for linting and formatting")
    console.log("- Docker & Docker Compose for containerization")
  })

program.parse()
