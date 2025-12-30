#!/usr/bin/env npx tsx
/**
 * Claude Hooks CLI
 *
 * Generate Claude-powered hooks from markdown definitions.
 *
 * Usage:
 *   claude-hooks generate <files...> [-o <output-dir>]
 *   claude-hooks settings <hooks...>
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateHook, generateSettingsEntry } from './generator/hook-generator.js';
import { parseMarkdownFile, validateHookDefinition } from './parser/md-parser.js';

import * as readline from 'readline';

const VERSION = '1.0.0';

// Get the directory where claude-hooks is installed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Export for use in generated hooks
export const CLAUDE_HOOKS_DIR = process.env.CLAUDE_HOOKS_DIR || PROJECT_ROOT;

// Config file path
const CONFIG_PATH = path.join(process.env.HOME || '~', '.claude', 'claude-hooks-config.json');

interface ClaudeHooksConfig {
  hooksDir: string;      // Where markdown definitions are stored
  generatedDir: string;  // Where generated TypeScript hooks go
}

function loadConfig(): ClaudeHooksConfig | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Config doesn't exist or is invalid
  }
  return null;
}

function saveConfig(config: ClaudeHooksConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function getHooksDir(): string {
  const config = loadConfig();
  if (config?.hooksDir) {
    return config.hooksDir;
  }
  return path.join(CLAUDE_HOOKS_DIR, 'hooks');
}

function getGeneratedDir(): string {
  const config = loadConfig();
  if (config?.generatedDir) {
    return config.generatedDir;
  }
  return path.join(CLAUDE_HOOKS_DIR, 'generated');
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printHelp(): void {
  console.log(`
Claude Hooks v${VERSION}
Generate Claude-powered hooks from markdown definitions.

Usage:
  claude-hooks setup                              First-time setup (choose storage location)
  claude-hooks generate <files...> [-o <output>]  Generate hooks from markdown
  claude-hooks install <file> [-o <output>]       Generate and install a hook
  claude-hooks settings <hooks...>                Generate settings.json entries
  claude-hooks validate <files...>                Validate markdown definitions
  claude-hooks list                               List installed hooks
  claude-hooks config                             Show current configuration
  claude-hooks path                               Show installation path
  claude-hooks --help                             Show this help
  claude-hooks --version                          Show version

Examples:
  claude-hooks setup                    # First-time setup
  claude-hooks generate hooks/*.md -o generated/
  claude-hooks install hooks/security-check.md
  claude-hooks validate hooks/security-check.md

Learn more: https://github.com/anthropics/claude-hooks
`);
}

function printVersion(): void {
  console.log(`claude-hooks v${VERSION}`);
}

interface ParsedArgs {
  command: string;
  files: string[];
  output: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: '',
    files: [],
    output: './generated',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--version' || arg === '-v') {
      printVersion();
      process.exit(0);
    }

    if (arg === '-o' || arg === '--output') {
      parsed.output = args[++i] || './generated';
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else if (!parsed.command) {
      parsed.command = arg;
    } else {
      parsed.files.push(arg);
    }

    i++;
  }

  return parsed;
}

function expandGlob(pattern: string): string[] {
  // Simple glob expansion - just return the pattern if it's a direct file
  if (!pattern.includes('*')) {
    return [pattern];
  }

  // For actual glob patterns, we'd need to use a glob library
  // For now, just check if the directory exists and list .md files
  const dir = path.dirname(pattern);
  const ext = pattern.includes('.md') ? '.md' : '.ts';

  if (fs.existsSync(dir)) {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .map(f => path.join(dir, f));
  }

  return [pattern];
}

function resolveFiles(patterns: string[]): string[] {
  const files: string[] = [];
  for (const pattern of patterns) {
    files.push(...expandGlob(pattern));
  }
  return files;
}

async function commandGenerate(files: string[], output: string): Promise<void> {
  if (files.length === 0) {
    console.error('Error: No input files specified');
    console.error('Usage: claude-hooks generate <files...> [-o <output>]');
    process.exit(1);
  }

  // Use configured directory if no explicit output specified
  const outputDir = output === './generated' ? getGeneratedDir() : output;

  const resolvedFiles = resolveFiles(files);
  console.log(`Generating ${resolvedFiles.length} hook(s)...`);

  let success = 0;
  let failed = 0;

  for (const file of resolvedFiles) {
    try {
      const result = generateHook(file, outputDir);
      console.log(`  ✓ ${path.basename(file)} → ${path.basename(result.outputPath)}`);
      success++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${path.basename(file)}: ${msg}`);
      failed++;
    }
  }

  console.log(`\nGenerated: ${success}, Failed: ${failed}`);

  if (success > 0) {
    console.log(`\nOutput directory: ${path.resolve(outputDir)}`);
    console.log(`\nTo use these hooks, add them to your .claude/settings.json:`);
    console.log(`  claude-hooks settings ${outputDir}/*.ts`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

async function commandSettings(files: string[]): Promise<void> {
  if (files.length === 0) {
    console.error('Error: No hook files specified');
    console.error('Usage: claude-hooks settings <hooks...>');
    process.exit(1);
  }

  // Group hooks by lifecycle event
  const hooksByEvent: Record<string, object[]> = {};

  const resolvedFiles = resolveFiles(files);

  for (const file of resolvedFiles) {
    // Try to find the corresponding .md file to get the definition
    const mdFile = file.replace(/\.ts$/, '.md').replace('/generated/', '/hooks/');
    let definition;

    if (fs.existsSync(mdFile)) {
      definition = parseMarkdownFile(mdFile);
    } else {
      // Parse event from filename
      const basename = path.basename(file, '.ts');
      definition = {
        name: basename,
        trigger: {
          event: 'PostToolUse' as const,
          tools: ['Edit', 'Write'],
        },
        prompt: '',
        options: { failMode: 'open' as const, maxTurns: 1 },
      };
    }

    const entry = generateSettingsEntry(definition, file);
    const event = definition.trigger.event;

    if (!hooksByEvent[event]) {
      hooksByEvent[event] = [];
    }
    hooksByEvent[event].push(entry);
  }

  // Generate settings.json structure
  const settings = {
    hooks: hooksByEvent,
  };

  console.log('Add to your .claude/settings.json:\n');
  console.log(JSON.stringify(settings, null, 2));
}

async function commandValidate(files: string[]): Promise<void> {
  if (files.length === 0) {
    console.error('Error: No input files specified');
    console.error('Usage: claude-hooks validate <files...>');
    process.exit(1);
  }

  const resolvedFiles = resolveFiles(files);
  let allValid = true;

  for (const file of resolvedFiles) {
    try {
      const definition = parseMarkdownFile(file);
      const result = validateHookDefinition(definition);

      if (result.valid) {
        console.log(`✓ ${path.basename(file)}: Valid`);
        console.log(`  Name: ${definition.name}`);
        console.log(`  Event: ${definition.trigger.event}`);
        if (definition.trigger.tools) {
          console.log(`  Tools: ${definition.trigger.tools.join(', ')}`);
        }
      } else {
        console.error(`✗ ${path.basename(file)}: Invalid`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        allValid = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${path.basename(file)}: ${msg}`);
      allValid = false;
    }
  }

  if (!allValid) {
    process.exit(1);
  }
}

const SETTINGS_PATH = path.join(process.env.HOME || '~', '.claude', 'settings.json');

interface ClaudeSettings {
  hooks?: {
    [event: string]: Array<{
      matcher?: string;
      hooks: Array<{
        type: string;
        command: string;
        timeout?: number;
      }>;
    }>;
  };
  [key: string]: unknown;
}

function loadSettings(): ClaudeSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const content = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Warning: Could not read settings: ${(error as Error).message}`);
  }
  return {};
}

function saveSettings(settings: ClaudeSettings): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

async function commandInstall(files: string[], output: string): Promise<void> {
  if (files.length === 0) {
    console.error('Error: No input file specified');
    console.error('Usage: claude-hooks install <file> [-o <output>]');
    process.exit(1);
  }

  const file = files[0];
  console.log(`Installing hook from ${path.basename(file)}...`);

  // Use configured directory if no explicit output specified
  const outputDir = output === './generated' ? getGeneratedDir() : output;

  // Step 1: Generate the hook
  let hookPath: string;
  let definition;
  try {
    const result = generateHook(file, outputDir);
    hookPath = path.resolve(result.outputPath);
    definition = result.definition;
    console.log(`  ✓ Generated ${path.basename(hookPath)}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Generation failed: ${msg}`);
    process.exit(1);
  }

  // Step 2: Update settings.json
  try {
    const settings = loadSettings();

    // Initialize hooks structure if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const event = definition.trigger.event;
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Create the hook entry (no timeout - let Claude Code use default)
    const hookEntry = {
      matcher: definition.trigger.tools?.join('|'),
      hooks: [{
        type: 'command' as const,
        command: `npx tsx ${hookPath}`,
      }],
    };

    // Check if this hook already exists (by command path)
    const existingIndex = settings.hooks[event].findIndex(
      (h) => h.hooks.some((hh) => hh.command.includes(path.basename(hookPath)))
    );

    if (existingIndex >= 0) {
      // Update existing
      settings.hooks[event][existingIndex] = hookEntry;
      console.log(`  ✓ Updated existing hook in settings.json`);
    } else {
      // Add new
      settings.hooks[event].push(hookEntry);
      console.log(`  ✓ Added hook to settings.json`);
    }

    saveSettings(settings);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to update settings: ${msg}`);
    process.exit(1);
  }

  // Step 3: Confirm
  console.log(`\n✓ Hook '${definition.name}' installed successfully!`);
  console.log(`  Event: ${definition.trigger.event}`);
  if (definition.trigger.tools) {
    console.log(`  Tools: ${definition.trigger.tools.join(', ')}`);
  }
  if (definition.trigger.files) {
    console.log(`  Files: ${definition.trigger.files.join(', ')}`);
  }
  console.log(`\nThe hook is now active and will run on matching operations.`);
}

async function commandList(): Promise<void> {
  const settings = loadSettings();

  if (!settings.hooks || Object.keys(settings.hooks).length === 0) {
    console.log('No hooks installed.');
    return;
  }

  console.log('Installed hooks:\n');

  for (const [event, hooks] of Object.entries(settings.hooks)) {
    console.log(`${event}:`);
    for (const hook of hooks) {
      const matcher = hook.matcher ? ` (${hook.matcher})` : '';
      for (const h of hook.hooks) {
        if (h.type === 'command') {
          // Extract hook name from command
          const match = h.command.match(/([^/]+)\.ts$/);
          const name = match ? match[1] : h.command;
          console.log(`  - ${name}${matcher}`);
        }
      }
    }
  }
}

async function commandSetup(): Promise<void> {
  console.log('Setting up Claude Hooks...\n');

  // Check if already configured
  const existingConfig = loadConfig();
  let hooksDir: string;
  let generatedDir: string;

  if (existingConfig) {
    console.log(`Found existing configuration:`);
    console.log(`  Hooks directory: ${existingConfig.hooksDir}`);
    console.log(`  Generated directory: ${existingConfig.generatedDir}\n`);

    const reconfigure = await askQuestion('Reconfigure storage locations? [y/N] ');
    if (reconfigure.toLowerCase() !== 'y') {
      hooksDir = existingConfig.hooksDir;
      generatedDir = existingConfig.generatedDir;
    } else {
      const dirs = await askStorageLocation();
      hooksDir = dirs.hooksDir;
      generatedDir = dirs.generatedDir;
    }
  } else {
    const dirs = await askStorageLocation();
    hooksDir = dirs.hooksDir;
    generatedDir = dirs.generatedDir;
  }

  // Save config
  saveConfig({ hooksDir, generatedDir });
  console.log(`  ✓ Saved configuration to ${CONFIG_PATH}`);

  // Create directories if they don't exist
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
    console.log(`  ✓ Created hooks directory: ${hooksDir}`);
  }
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
    console.log(`  ✓ Created generated directory: ${generatedDir}`);
  }

  // Install /create-hook command
  const commandsDir = path.join(process.env.HOME || '~', '.claude', 'commands');
  const commandPath = path.join(commandsDir, 'create-hook.md');

  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  // Generate the create-hook command with correct paths
  const createHookCommand = generateCreateHookCommand(hooksDir, generatedDir);
  fs.writeFileSync(commandPath, createHookCommand, 'utf-8');
  console.log(`  ✓ Installed /create-hook command`);

  // Print next steps
  console.log(`
Setup complete!

Configuration:
  Hook definitions: ${hooksDir}
  Generated hooks:  ${generatedDir}

Next steps:
  1. Restart Claude Code to load the new command
  2. Type /create-hook to create your first hook
  3. Or manually create hooks in: ${hooksDir}

Example usage:
  /create-hook              # Interactive hook creation
  claude-hooks list         # List installed hooks
  claude-hooks install <file.md>  # Install a hook from markdown
`);
}

async function askStorageLocation(): Promise<{ hooksDir: string; generatedDir: string }> {
  const globalHooksDir = path.join(process.env.HOME || '~', '.claude', 'hooks');
  const globalGeneratedDir = path.join(process.env.HOME || '~', '.claude', 'hooks', 'generated');
  const projectHooksDir = path.join(CLAUDE_HOOKS_DIR, 'hooks');
  const projectGeneratedDir = path.join(CLAUDE_HOOKS_DIR, 'generated');

  console.log('Where would you like to store your hooks?\n');
  console.log('  [1] Global (Recommended)');
  console.log(`      ${globalHooksDir}`);
  console.log('      Hooks persist independently of this project\n');
  console.log('  [2] Project-local');
  console.log(`      ${projectHooksDir}`);
  console.log('      Hooks are stored in this claude-hooks installation\n');

  const choice = await askQuestion('Choose [1/2] (default: 1): ');

  if (choice === '2') {
    console.log(`\n  Using project-local storage`);
    return { hooksDir: projectHooksDir, generatedDir: projectGeneratedDir };
  } else {
    console.log(`\n  Using global storage`);
    return { hooksDir: globalHooksDir, generatedDir: globalGeneratedDir };
  }
}

function commandPath(): void {
  console.log(CLAUDE_HOOKS_DIR);
}

function commandConfig(): void {
  const config = loadConfig();

  if (!config) {
    console.log('No configuration found. Run "claude-hooks setup" to configure.\n');
    console.log('Current defaults:');
    console.log(`  Hooks directory:     ${getHooksDir()}`);
    console.log(`  Generated directory: ${getGeneratedDir()}`);
    return;
  }

  console.log('Current configuration:\n');
  console.log(`  Config file:         ${CONFIG_PATH}`);
  console.log(`  Hooks directory:     ${config.hooksDir}`);
  console.log(`  Generated directory: ${config.generatedDir}`);
  console.log(`  CLI installation:    ${CLAUDE_HOOKS_DIR}`);
  console.log(`\nTo change these settings, run: claude-hooks setup`);
}

function generateCreateHookCommand(hooksDir: string, generatedDir: string): string {
  return `---
description: Create a new Claude-powered validation hook from a natural language description
allowed-tools: Write, Edit, Bash(npx:*), Bash(cd:*), Read, Glob
---

# Create a Claude-Powered Hook

You are helping the user create a custom validation hook for Claude Code. These hooks use Claude to validate code changes in real-time.

## Workflow

### 1. Understand the Hook

Ask the user these questions explicitly (don't infer or assume):

1. **Purpose**: "What would you like your hook to validate?"
2. **Files**: "Which file types should this apply to?" (e.g., *.ts, *.js, all files)
3. **Action**: "Should this hook BLOCK the operation when issues are found, or just WARN?" (This is required - always ask)
4. **Trigger**: When to run? (default: PostToolUse on Edit/Write - can mention this default)

**Important**: Always explicitly ask about blocking vs warning. Never infer this from the type of check.

### 2. Create the Markdown Definition

Generate a hook name from the purpose (kebab-case, e.g., \`no-console-logs\`, \`detect-secrets\`).

Write the markdown file to:
\`${hooksDir}/<hook-name>.md\`

Use this exact format:

\`\`\`markdown
# Hook: <hook-name>

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: <file-patterns, comma-separated>
- Skip: **/*.test.ts, **/*.spec.ts, node_modules/**

## Prompt
<Clear validation instructions based on user's description>

<Specific things to check for, as a numbered or bulleted list>

If critical issues are found, block the change and explain why.
For minor concerns, allow but mention them in the reason.

## Options
- Fail Mode: <closed for block, open for warn>
- Max Turns: 1
\`\`\`

### 3. Generate the Hook

Run this command to compile the markdown into an executable TypeScript hook:

\`\`\`bash
npx tsx ${CLAUDE_HOOKS_DIR}/src/cli.ts generate ${hooksDir}/<hook-name>.md -o ${generatedDir}/
\`\`\`

### 4. Install the Hook

Read the current settings from \`~/.claude/settings.json\`.

The hook entry format depends on the lifecycle event. For PostToolUse hooks:

\`\`\`json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "command": "npx tsx ${generatedDir}/<hook-name>.ts"
  }]
}
\`\`\`

Add this to the \`hooks.PostToolUse\` array in settings.json. If \`hooks.PostToolUse\` doesn't exist, create it.

Use the Edit tool to update the settings file, being careful to:
- Preserve existing hooks
- Add the new hook to the appropriate array
- Maintain valid JSON formatting

### 5. Confirm Success

Tell the user:
- The hook name and what it validates
- That it's now active on Edit/Write operations
- Example: "Your 'detect-secrets' hook is now active! It will check all .ts/.js files for hardcoded secrets when you edit them."

## Important Guidelines

- **Always ask** whether the hook should block or warn - never assume
- Always use **absolute paths** for the generated hook command
- **Merge** with existing hooks, never overwrite the entire hooks section
- Keep prompts **concise but specific** - Claude will use these to make decisions
- The hook runs inside Claude Code, so it uses the existing Claude session (no API key needed)
- If user says "block" → set \`Fail Mode: closed\`
- If user says "warn" → set \`Fail Mode: open\`

## Hook Prompt Tips

Good hook prompts are:
- Specific about what to look for
- Clear about when to block vs. warn
- Focused on a single concern

Example good prompt:
\`\`\`
Check this TypeScript code for hardcoded secrets:
1. API keys (strings starting with sk-, pk-, api_, etc.)
2. Passwords in variable assignments
3. AWS/GCP/Azure credentials
4. JWT tokens or bearer tokens

Block if any secrets are found. Explain which line contains the secret.
\`\`\`

Example poor prompt:
\`\`\`
Check if the code is good.
\`\`\`
`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'setup':
      await commandSetup();
      break;

    case 'generate':
      await commandGenerate(args.files, args.output);
      break;

    case 'install':
      await commandInstall(args.files, args.output);
      break;

    case 'settings':
      await commandSettings(args.files);
      break;

    case 'validate':
      await commandValidate(args.files);
      break;

    case 'list':
      await commandList();
      break;

    case 'config':
      commandConfig();
      break;

    case 'path':
      commandPath();
      break;

    case '':
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      console.error('Run "claude-hooks --help" for usage information.');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
