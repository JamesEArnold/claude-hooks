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
import { generateHook, generateSettingsEntry } from './generator/hook-generator.js';
import { parseMarkdownFile, validateHookDefinition } from './parser/md-parser.js';

const VERSION = '1.0.0';

function printHelp(): void {
  console.log(`
Claude Hooks v${VERSION}
Generate Claude-powered hooks from markdown definitions.

Usage:
  claude-hooks generate <files...> [-o <output>]  Generate hooks from markdown
  claude-hooks install <file> [-o <output>]       Generate and install a hook
  claude-hooks settings <hooks...>                Generate settings.json entries
  claude-hooks validate <files...>                Validate markdown definitions
  claude-hooks list                               List installed hooks
  claude-hooks --help                             Show this help
  claude-hooks --version                          Show version

Examples:
  claude-hooks generate hooks/*.md -o generated/
  claude-hooks install hooks/security-check.md
  claude-hooks settings generated/*.ts
  claude-hooks validate hooks/security-check.md

Learn more: https://github.com/your-repo/claude-hooks
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

  const resolvedFiles = resolveFiles(files);
  console.log(`Generating ${resolvedFiles.length} hook(s)...`);

  let success = 0;
  let failed = 0;

  for (const file of resolvedFiles) {
    try {
      const result = generateHook(file, output);
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
    console.log(`\nOutput directory: ${path.resolve(output)}`);
    console.log(`\nTo use these hooks, add them to your .claude/settings.json:`);
    console.log(`  claude-hooks settings ${output}/*.ts`);
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

  // Step 1: Generate the hook
  let hookPath: string;
  let definition;
  try {
    const result = generateHook(file, output);
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
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
