# WTCompose Project Overview

## Project Purpose
WTCompose is a TypeScript CLI tool designed to extend git worktree functionality for Docker Compose environments. The tool aims to create complete isolated development environments when using git worktrees by:
- Copying existing Docker Compose configurations
- Duplicating running Docker containers and volumes
- Adjusting port numbers to prevent conflicts
- Creating fully separate environments for each worktree

## Current State
The project is in early development with basic CLI scaffolding using Commander.js. The current implementation only has basic "hello" and "info" commands as placeholders.

## Tech Stack
- **Language**: TypeScript (ES2022, ESNext modules)
- **CLI Framework**: Commander.js v14.0.1
- **Build Tool**: TypeScript compiler (tsc)
- **Development**: tsx for development server
- **Linting/Formatting**: Biome v2.2.4
- **Runtime**: Node.js

## Project Structure
```
wtcompose/
├── src/
│   └── index.ts          # Main CLI entry point
├── dist/                 # Compiled JavaScript output
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
├── biome.json           # Biome linting/formatting config
└── .editorconfig        # Editor configuration
```

## Entry Point
The main CLI executable is built as `dist/index.js` with the command name `wtcompose`.