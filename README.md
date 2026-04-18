# wturbo

**Switch between multiple branch environments in an instant**

A CLI tool that uses Git worktree to create and manage independent working directories for each branch — with automatic environment file adjustment, Docker Compose port isolation, and symlink support for heavy directories.

[日本語](README_ja.md)

## Use Cases

- You're working on the main branch and an urgent bug fix comes in
- You want to develop multiple feature branches in parallel
- You need to quickly check out another branch for PR review
- You want `.env` and other gitignored files copied to a new working environment
- You need Docker Compose services running on different ports per branch

## How It Works

```
project/                        ← main worktree (your original repo)
├── wturbo.yaml
├── .env
├── docker-compose.yml
├── node_modules/
└── src/

worktree-feature-auth/          ← created by wturbo
├── .env                        ← copied & port-adjusted
├── docker-compose.yml          ← copied & port-adjusted
├── node_modules -> ../project/node_modules  ← symlinked
└── src/                        ← git worktree (shared .git)
```

When you run `wturbo create`, it:
1. Creates a Git worktree (a separate working directory sharing the same `.git`)
2. Copies gitignored files you specify (`.env`, configs, secrets)
3. Creates symlinks for heavy directories (`node_modules`, `.cache`)
4. Adjusts ports in `.env` files to avoid conflicts
5. Copies Docker Compose files with automatic port remapping
6. Runs your setup script (if configured)

## Quick Start

### 1. Install

```bash
npm install -g wturbo
```

Or use without installing:

```bash
npx wturbo create feature/awesome-feature
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

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Specify worktree location (default: `worktree-<branch-name>` in the parent directory) |
| `--no-create-branch` | Use an existing branch (don't create a new one) |
| `--no-docker` | Skip Docker Compose setup entirely |
| `--no-env` | Skip environment file processing (`.env` copy/adjust) |
| `--no-copy` | Skip file copying (`copy_files`) |
| `--no-link` | Skip symlink creation (`link_files`) |
| `--no-start` | Skip `start_command` execution |
| `--dry-run` | Show what would be done without making any changes |

**Examples:**

```bash
# Create worktree without Docker setup (faster, no Docker needed)
wturbo create feature/quick-fix --no-docker

# Create worktree without running the start script
wturbo create feature/wip --no-start

# Create a minimal worktree (just git worktree, no file operations)
wturbo create feature/minimal --no-docker --no-env --no-copy --no-link --no-start

# Preview what would happen
wturbo create feature/test --dry-run

# Use a specific path
wturbo create feature/auth -p /tmp/auth-worktree

# Use an existing branch
wturbo create release/v2.0 --no-create-branch
```

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

| Option | Description |
|--------|-------------|
| `-f, --force` | Force removal even with uncommitted changes |
| `--no-docker` | Skip Docker Compose teardown (`docker compose down`) |
| `--no-end` | Skip `end_command` execution |

**Examples:**

```bash
# Remove without stopping Docker services (when Docker isn't running)
wturbo remove feature/old-branch --no-docker

# Force removal with uncommitted changes, skip cleanup
wturbo remove feature/abandoned -f --no-end
```

### `wturbo ls` (alias: `list`)

Lightweight, scriptable listing of worktrees — similar to Unix `ls`. Use this when you just want to see what worktrees exist, without the Docker noise from `status`.

```bash
wturbo ls
wturbo list      # same thing
```

**Options:**

| Option | Description |
|--------|-------------|
| `-l, --long` | Long format with short commit hash, age, dirty state, and subject |
| `--json` | Machine-readable JSON output (combine with `-l` for enriched fields) |
| `-p, --paths` | Print only absolute paths, one per line (for `$(wturbo ls -p \| fzf)` style usage) |

**Output examples:**

Default (compact, 1 git call):
```
→ main            /Users/me/proj                          [main]
  feature/api     /Users/me/proj-worktrees/feature-api
  feature/ui      /Users/me/proj-worktrees/feature-ui     [locked]
  hotfix/crash    /Users/me/proj-worktrees/hotfix-crash   [prunable]
  (detached)      /Users/me/proj-worktrees/detached-xyz
```

Long (`-l`, runs `git log`/`git status` per worktree in parallel):
```
  BRANCH          COMMIT   AGE        D  PATH                                   TAGS / SUBJECT
→ main            a1b2c3d  2h ago     *  /Users/me/proj                         [main] Add foo
  feature/api     9f8e7d6  3d ago        /Users/me/proj-worktrees/feature-api   WIP refactor
```
Tags: `[main]` marks the main repository worktree, `[locked]` for `git worktree lock`, `[prunable]` when the worktree dir is gone, `[bare]` for bare repos. The `→` in column 0 marks the worktree containing your current working directory (works even in detached-HEAD state).

Paths-only (`-p`, for shell pipelines):
```bash
# Jump to another worktree via fzf:
cd "$(wturbo ls -p | fzf)"
```

JSON (`--json`):
```bash
wturbo ls --json | jq '.[] | select(.isMain == false) | .path'
```

### `wturbo status`

Displays a list of current worktrees and their Docker environments.

```bash
wturbo status
```

**Options:**

| Option | Description |
|--------|-------------|
| `-a, --all` | Show all worktrees, not just the current one |
| `--docker-only` | Show only Docker-related information |

Example output:
```
📁 Git Worktrees Status

→ main (main)
   📂 /Users/me/project
   🐳 Docker: docker-compose.yml
   📦 Services: 3
   🔧 Environment: .env, .env.local

  feature/auth
   📂 /Users/me/worktree-feature-auth
   🐳 Docker: docker-compose.yml
   📦 Services: 3
   🔧 Environment: .env, .env.local
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

### Environment Variable Adjustment

Automatically adjust port numbers in `.env` files to prevent conflicts between worktrees:

```yaml
env:
  file:
    - .env
    - .env.local
  adjust:
    APP_PORT: 1        # find next free port starting from original+1
    DB_PORT: 1         # find next free port starting from original+1
    API_KEY: "new-key" # replace with a fixed string
    DEBUG_PORT: null    # remove the variable entirely
```

The `adjust` field supports three types of values:
- **number** (`1`): Finds the next free port starting from the original value + the number. Scans other worktree `.env` files and running containers to avoid collisions.
- **string** (`"new-key"`): Replaces the value with the given string.
- **null**: Removes the variable from the file.

### Docker Compose Integration

When `docker_compose_file` is configured, wturbo automatically:
- Copies the Compose file to each new worktree
- Remaps ports to avoid conflicts with running containers
- Runs `docker compose down` before removing a worktree

```yaml
docker_compose_file: ./docker-compose.yml
```

Set to an empty string or omit entirely to disable Docker integration:

```yaml
docker_compose_file: ""   # explicitly disable
# or simply omit the field
```

### Full Configuration Example

```yaml
base_branch: main
docker_compose_file: ./docker-compose.yml

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base_branch` | string | `"main"` | Base branch name for new worktree branches |
| `docker_compose_file` | string | `""` | Path to Docker Compose file (omit or empty to skip Docker) |
| `copy_files` | string[] | `[]` | Files/directories to copy to new worktrees |
| `link_files` | string[] | `[]` | Files/directories to symlink (takes priority over `copy_files`) |
| `start_command` | string | — | Command to run after worktree creation |
| `end_command` | string | — | Command to run before worktree removal |
| `env.file` | string[] | `["./.env"]` | Environment variable files to process |
| `env.adjust` | object | `{}` | Adjustments: number = find free port, string = replace, null = remove |

## CLI Options Summary

### Global behavior

All `--no-*` flags use Commander.js negation syntax. For example, `--no-docker` sets `docker` to `false`.

### `create` options

```
-p, --path <path>     Custom worktree location
--no-create-branch    Use existing branch
--no-docker           Skip Docker Compose setup
--no-env              Skip .env file processing
--no-copy             Skip copy_files
--no-link             Skip link_files (symlinks)
--no-start            Skip start_command
--dry-run             Preview without changes
```

### `remove` options

```
-f, --force           Force removal
--no-docker           Skip docker compose down
--no-end              Skip end_command
```

### `status` options

```
-a, --all             Show all worktrees
--docker-only         Show only Docker info
```

### `ls` options

```
-l, --long            Long format with commit hash, age, dirty, subject
--json                JSON output (combine with -l for enriched fields)
-p, --paths           Absolute paths only, one per line
```

## Requirements

- Node.js 18+
- Git
- Docker (optional — only needed if `docker_compose_file` is configured)

## Troubleshooting

### "Not in a git repository"

Run wturbo from inside a Git repository. The tool detects the Git root automatically.

### Port conflicts

If port adjustment isn't working as expected, wturbo scans:
1. Other worktree `.env` files for ports in use
2. Running Docker containers for occupied ports

Use `wturbo status -a` to see what ports are currently assigned across worktrees.

### Docker not available

If Docker isn't installed or the daemon isn't running, wturbo gracefully skips Docker operations. Use `--no-docker` to suppress Docker-related warnings entirely.

### Worktree already exists

If `git worktree add` fails because the branch already exists as a worktree, use `wturbo status` to check existing worktrees, then `wturbo remove` the old one first.

## License

MIT
