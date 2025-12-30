# Claude Hooks

Create custom validation hooks for [Claude Code](https://claude.ai/claude-code) using natural language. Define what you want to check in markdown, and let Claude validate your code changes in real-time.

## What is this?

Claude Hooks lets you create AI-powered validation hooks that run automatically when you edit files in Claude Code. Instead of writing complex linting rules, you describe what you want to check in plain English, and Claude handles the validation.

**Example**: Create a hook that blocks commits containing `console.log` statements:

```markdown
# Hook: no-console-logs

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.js

## Prompt
Check for console.log statements. Block if any are found.

## Options
- Fail Mode: closed
```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/claude-hooks.git
cd claude-hooks

# Run setup
./setup.sh
```

The setup script will:
1. Install dependencies
2. Build the project
3. Ask where you want to store hooks (global or project-local)
4. Install the `/create-hook` command for Claude Code

**Storage options:**
- **Global (Recommended)**: `~/.claude/hooks/` - Hooks persist independently of where you cloned this project
- **Project-local**: `<project>/hooks/` - Hooks are stored within this claude-hooks installation

## Usage

### Interactive Mode (Recommended)

After setup, restart Claude Code and type:

```
/create-hook
```

Claude will ask you:
1. What you want to validate
2. Which files it should apply to
3. Whether to block or just warn

Then it automatically creates and installs the hook.

### Manual Mode

1. Create a markdown file in your hooks directory (run `npx tsx src/cli.ts config` to see the location):

```markdown
# Hook: detect-secrets

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.js, **/*.env

## Prompt
Check for hardcoded secrets:
- API keys (sk-, pk-, api_)
- Passwords in assignments
- AWS/GCP credentials

Block if secrets are found.

## Options
- Fail Mode: closed
```

2. Install the hook:

```bash
npx tsx src/cli.ts install hooks/detect-secrets.md
```

## Hook Format

```markdown
# Hook: <name>

## Trigger
- Event: PostToolUse          # When to run (PostToolUse, PreToolUse)
- Tools: Edit, Write          # Which tools trigger it
- Files: **/*.ts, **/*.js     # File patterns to check
- Skip: node_modules/**       # Patterns to skip

## Prompt
<Your validation instructions in plain English>

## Options
- Fail Mode: closed           # closed = block, open = warn only
- Max Turns: 1                # Usually 1 for simple checks
```

## CLI Commands

```bash
# First-time setup (choose storage location)
npx tsx src/cli.ts setup

# Create and install a hook
npx tsx src/cli.ts install hooks/my-hook.md

# Generate without installing
npx tsx src/cli.ts generate hooks/*.md -o generated/

# Validate a hook definition
npx tsx src/cli.ts validate hooks/my-hook.md

# List installed hooks
npx tsx src/cli.ts list

# Show current configuration
npx tsx src/cli.ts config

# Show installation path
npx tsx src/cli.ts path
```

## How It Works

1. **Define** - Write what you want to check in markdown
2. **Generate** - The CLI compiles it into an executable TypeScript hook
3. **Install** - The hook is added to your Claude Code settings
4. **Validate** - On every Edit/Write, Claude reviews your changes

The generated hooks use the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) to call Claude from within Claude Code. No API key needed - it uses your existing Claude Code session.

## Example Hooks

### Security Check
```markdown
# Hook: security-check

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.tsx, **/*.js

## Prompt
Check for security vulnerabilities:
1. Hardcoded secrets or API keys
2. SQL injection risks
3. XSS vulnerabilities
4. Unsafe eval() usage

Block if critical issues found.

## Options
- Fail Mode: closed
```

### Code Quality
```markdown
# Hook: code-quality

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts

## Prompt
Check for code quality issues:
1. Functions over 50 lines
2. Deeply nested callbacks (>3 levels)
3. Missing error handling in async functions

Warn but don't block.

## Options
- Fail Mode: open
```

## Requirements

- Node.js 18+
- Claude Code CLI

## License

MIT
