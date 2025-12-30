#!/bin/bash

# Claude Hooks Setup Script
# This script installs dependencies, builds the project, and sets up the /create-hook command

set -e

echo "╔════════════════════════════════════════╗"
echo "║       Claude Hooks Setup               ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# Run the setup command
echo ""
npx tsx src/cli.ts setup

echo ""
echo "╔════════════════════════════════════════╗"
echo "║       Setup Complete!                  ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Quick Start:"
echo "  1. Restart Claude Code (or start a new session)"
echo "  2. Type: /create-hook"
echo "  3. Describe what you want to validate"
echo ""
echo "Manual hook creation:"
echo "  1. Create a .md file in: $SCRIPT_DIR/hooks/"
echo "  2. Run: npx tsx src/cli.ts install hooks/your-hook.md"
echo ""
echo "For more info, see README.md"
