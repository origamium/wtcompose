# wturbo

**Switch between multiple branch environments in an instant**

A CLI tool that uses Git worktree to create and manage independent working directories for each branch.

[日本語](README_ja.md)

## Use Cases

- You're working on the main branch and an urgent bug fix comes in
- You want to develop multiple feature branches in parallel
- You need to quickly check out another branch for PR review
- You want `.env` and other gitignored files copied to a new working environment

## Quick Start

### 1. Install

```bash
npm install -g wturbo
```

### 2. Create a Configuration File

Create `wturbo.yaml` in your project root:

```yaml
base_branch: main

# Copy gitignored files to new worktrees
copy_files:
  - .env
  - .env.local

# Create symlinks for large directories instead of copying
link_files:
  - node_modules
```

### 3. Use It

```bash
# Create a worktree for a new branch
wturbo create feature/awesome-feature

# Move to the working directory
cd ../worktree-feature-awesome-feature

# Remove the worktree when done
wturbo remove feature/awesome-feature
```

## Commands

### `wturbo create <branch>`

Creates a new worktree.

```bash
wturbo create feature/new-feature
wturbo create bugfix/urgent-fix
```

**What it does:**
1. Creates a working directory for the branch using `git worktree add` (branches from `base_branch`)
2. Copies files specified in `copy_files`
3. Creates symlinks for files/directories specified in `link_files` (takes priority over `copy_files`)
4. Copies environment variable files specified in `env.file` (adjusts ports etc. if `env.adjust` is configured)
5. If `docker_compose_file` is configured and exists, copies it to the worktree with automatic port conflict resolution
6. Runs `start_command` (if configured)

**Options:**
- `-p, --path <path>` - Specify worktree location (default: creates `worktree-<branch-name>` in the parent directory)
- `--no-create-branch` - Use an existing branch (don't create a new one)

### `wturbo remove <branch>`

Removes a worktree.

```bash
wturbo remove feature/new-feature
```

**What it does:**
1. If `docker_compose_file` exists in the worktree, runs `docker compose down` (unless `end_command` is set)
2. Runs `end_command` (if configured)
3. Removes the worktree using `git worktree remove`

**Options:**
- `-f, --force` - Force removal even with uncommitted changes

### `wturbo status`

Displays a list of current worktrees.

```bash
wturbo status
```

Example output:
```
🌿 Git Worktrees (3 total)
  → main: /Users/me/project
    feature/auth: /Users/me/worktree-feature-auth
    bugfix/login: /Users/me/worktree-bugfix-login
```

## Configuration File

Place the configuration file at one of the following paths (in order of priority):

- `wturbo.yaml`
- `wturbo.yml`
- `.wturbo.yaml`
- `.wturbo.yml`
- `.wturbo/config.yaml`
- `.wturbo/config.yml`

### Base Branch

```yaml
base_branch: main
```

### File Copying

Copy gitignored files and configuration files to new worktrees:

```yaml
copy_files:
  - .env
  - .env.local
  - .claude          # directories are also supported
  - config/local.json
```

### Symbolic Links

Create symlinks to reference the original repository for heavy directories (like `node_modules`) instead of copying:

```yaml
link_files:
  - node_modules
  - .cache
```

> If the same path appears in both `copy_files` and `link_files`, `link_files` takes priority.

### Script Execution

Run scripts on worktree creation and removal:

```yaml
# Run after creation (e.g., installing dependencies)
start_command: ./scripts/setup.sh

# Run before removal (e.g., cleanup)
end_command: ./scripts/cleanup.sh
```

### Full Configuration Example

```yaml
base_branch: main
docker_compose_file: ./docker-compose.yml  # omit to skip Docker checks

copy_files:
  - .env
  - .env.local
  - .secrets
  - config/

link_files:
  - node_modules
  - .cache

start_command: npm install && npm run db:migrate
end_command: docker compose down

env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1    # finds next free port starting from original+1
    DB_PORT: 1
```

## Configuration Reference

| Field | Type | Description |
|-------|------|-------------|
| `base_branch` | string | Base branch name (default: `main`) |
| `docker_compose_file` | string | Path to Docker Compose file (omit or empty string to skip Docker checks) |
| `copy_files` | string[] | Files/directories to copy |
| `link_files` | string[] | Files/directories to symlink (takes priority over `copy_files`) |
| `start_command` | string | Command to run after worktree creation |
| `end_command` | string | Command to run before worktree removal |
| `env.file` | string[] | List of environment variable files |
| `env.adjust` | object | Environment variable adjustments (number: find next free port from original+1, string: replace, null: remove) |

## Requirements

- Node.js 18+
- Git

## License

MIT
