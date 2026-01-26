#!/bin/zsh
# Stop development environment script
# This script runs before worktree removal

echo "🛑 Stopping development environment..."

# Stop Docker Compose services
if [ -f "docker-compose.yml" ]; then
  echo "🐳 Stopping Docker Compose services..."
  docker compose down
fi

echo "✅ Development environment stopped!"
