# Code Style and Conventions for WTCompose

## TypeScript Configuration
- **Target**: ES2022
- **Module**: ESNext with Node resolution
- **Strict mode**: Enabled
- **Source maps**: Enabled for debugging
- **Declarations**: Generated for type information

## Biome Configuration (Linting & Formatting)
- **Indent**: 2 spaces (no tabs)
- **Line width**: 100 characters
- **Line ending**: LF (Unix style)
- **Quote style**: Double quotes
- **Semicolons**: As needed (automatic insertion)
- **Trailing commas**: ES5 style
- **Arrow parentheses**: Always include
- **Bracket spacing**: Enabled

## Code Conventions
- Use ES modules (`import`/`export`) instead of CommonJS
- Prefer `const` over `let` when possible
- Use TypeScript's strict type checking
- Follow Commander.js patterns for CLI commands
- Use meaningful command descriptions and help text

## File Organization
- Source code in `src/` directory
- Main entry point: `src/index.ts`
- Compiled output in `dist/` directory
- Follow TypeScript project structure conventions

## Import Style
- Use ES module syntax: `import { Command } from "commander"`
- Prefer named imports when possible
- Use default imports for single exports