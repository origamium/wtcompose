#!/bin/sh
# Start script for full-featured project
echo "=== START COMMAND EXECUTED ==="
echo "Working directory: $(pwd)"
echo "Timestamp: $(date)"

# Create marker file to verify execution
touch .start-executed

# Simulate some startup tasks
echo "Checking environment..."
if [ -f ".env" ]; then
  echo "  .env found"
fi
if [ -f ".env.local" ]; then
  echo "  .env.local found"
fi

echo "Start command completed successfully"
