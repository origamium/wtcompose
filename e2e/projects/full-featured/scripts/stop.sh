#!/bin/sh
# Stop script for full-featured project
echo "=== STOP COMMAND EXECUTED ==="
echo "Working directory: $(pwd)"
echo "Timestamp: $(date)"

# Create marker file to verify execution
touch .stop-executed

echo "Stop command completed successfully"
