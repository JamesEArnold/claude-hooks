#!/bin/bash

# Claude Hooks Setup Script
# This script installs dependencies, builds the project, and sets up hooks
#
# Auto-detects mode based on where you run it from:
#   - From claude-hooks directory: Global setup (first-time configuration)
#   - From any other directory: Initialize hooks in that project
#
# Manual override:
#   ./setup.sh --global  # Force global setup
#   ./setup.sh --project # Force project initialization

set -e

# Get directories
ORIGINAL_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
PROJECT_MODE=false
for arg in "$@"; do
  case $arg in
    --project)
      PROJECT_MODE=true
      shift
      ;;
    --global)
      PROJECT_MODE=false
      shift
      ;;
  esac
done

# Auto-detect: if running from a different directory, assume project mode
if [ "$ORIGINAL_DIR" != "$SCRIPT_DIR" ]; then
  PROJECT_MODE=true
fi

echo "╔════════════════════════════════════════╗"
echo "║       Claude Hooks Setup               ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Change to script directory for npm operations
cd "$SCRIPT_DIR"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "   Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. You have $(node -v)"
    exit 1
fi
echo "✓ Node.js $(node -v) detected"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --silent
echo "✓ Dependencies installed"

# Build the project
echo ""
echo "Building project..."
npm run build --silent
echo "✓ Project built"

# Run either init (project mode) or setup (global mode)
echo ""
if [ "$PROJECT_MODE" = true ]; then
    # Return to original directory for project init
    cd "$ORIGINAL_DIR"
    echo "Initializing hooks for project: $ORIGINAL_DIR"
    echo ""
    npx tsx "$SCRIPT_DIR/src/cli.ts" init
else
    # Global setup
    npx tsx src/cli.ts setup
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║       Setup Complete!                  ║"
echo "╚════════════════════════════════════════╝"
echo ""

if [ "$PROJECT_MODE" = true ]; then
    echo "Project initialized with claude-hooks!"
    echo ""
    echo "Next steps:"
    echo "  1. Restart Claude Code (or start a new session) in this project"
    echo "  2. Edit any file to see hooks in action"
    echo "  3. Use /create-hook to add project-specific validators"
else
    echo "Quick Start:"
    echo "  1. Restart Claude Code (or start a new session)"
    echo "  2. Type: /create-hook"
    echo "  3. Describe what you want to validate"
    echo ""
    echo "To initialize hooks in a specific project:"
    echo "  cd /path/to/your/project"
    echo "  $SCRIPT_DIR/setup.sh --project"
    echo ""
    echo "Manual hook creation:"
    echo "  1. Create a .md file in: $SCRIPT_DIR/hooks/"
    echo "  2. Run: npx tsx src/cli.ts install hooks/your-hook.md"
fi
echo ""
echo "For more info, see README.md"
