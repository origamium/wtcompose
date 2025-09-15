#!/usr/bin/env node

import { Command } from "commander"

const program = new Command()

program
  .name("wtcompose")
  .description("CLI tool built with TypeScript and Commander.js")
  .version("1.0.0")

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
    console.log("This is a TypeScript CLI tool built with:")
    console.log("- TypeScript for type safety")
    console.log("- Commander.js for CLI framework")
    console.log("- Biome for linting and formatting")
  })

program.parse()
