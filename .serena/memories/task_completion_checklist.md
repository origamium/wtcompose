# Task Completion Checklist for WTCompose

## Before Committing Changes
Run these commands in sequence to ensure code quality:

### 1. Type Checking
```bash
npm run typecheck
```
- Ensures no TypeScript compilation errors
- Must pass without errors before proceeding

### 2. Code Quality
```bash
npm run check
```
- Runs Biome linting and formatting with --write
- Automatically fixes formatting issues
- Must resolve all linting errors

### 3. Build Verification
```bash
npm run build
```
- Compiles TypeScript to JavaScript
- Verifies the project builds successfully
- Generates declaration files and source maps

### 4. Functional Testing
- Test CLI commands manually:
  ```bash
  node dist/index.js --help
  node dist/index.js hello
  node dist/index.js info
  ```
- Verify any new commands work as expected

## Alternative Commands
- `npm run format` - Format only (without linting)
- `npm run lint` - Lint only (without formatting)
- `npm run dev` - Quick development testing

## Git Workflow
- Commit only after all checks pass
- Use descriptive commit messages
- Consider the impact on the CLI user experience