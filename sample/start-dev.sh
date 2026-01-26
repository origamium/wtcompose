#!/bin/zsh
# Start development environment script
# This script runs after worktree creation

echo "🚀 Starting development environment setup..."

# Install Node.js dependencies if package.json exists
if [ -f "next-app/package.json" ]; then
  echo "📦 Installing Node.js dependencies..."
  cd next-app
  npm install
  cd ..
fi

# Start Docker Compose services
if [ -f "docker-compose.yml" ]; then
  echo "🐳 Starting Docker Compose services..."
  docker compose up -d
fi

echo "✅ Development environment setup complete!"
echo ""
echo "Services:"
echo "  - Next.js: http://localhost:${APP_PORT:-3000}"
echo "  - PostgreSQL: localhost:${DB_PORT:-5432}"
