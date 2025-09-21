# Suggested Commands for WTCompose Development

## Development Commands
- `npm run dev` - Run the CLI in development mode using tsx
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm start` - Run the compiled CLI from dist/index.js

## Code Quality Commands
- `npm run lint` - Lint source code using Biome
- `npm run format` - Format source code using Biome (with --write)
- `npm run check` - Run Biome check with --write (combines linting and formatting)
- `npm run typecheck` - Type check without emitting files

## Testing
- `npm test` - Currently not implemented (returns error)

## CLI Usage
- `node dist/index.js` or `wtcompose` (after npm install -g)
- `wtcompose hello` - Basic hello command
- `wtcompose hello -n <name>` - Hello command with custom name
- `wtcompose info` - Show CLI information

## System Commands (Darwin/macOS)
- Standard Unix commands: `ls`, `cd`, `grep`, `find`, `git`
- Package management: `npm`, `brew`
- Docker commands: `docker`, `docker-compose` or `docker compose`

## Task Completion Checklist
When completing a task, run these commands in order:
1. `npm run typecheck` - Ensure no TypeScript errors
2. `npm run check` - Format and lint code
3. `npm run build` - Compile the project
4. Test the CLI manually if changes affect functionality