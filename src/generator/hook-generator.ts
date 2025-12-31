/**
 * Hook Generator
 *
 * Generates executable TypeScript hooks from markdown definitions.
 * Generated hooks are standalone scripts that work with Claude Code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdownFile, validateHookDefinition } from '../parser/md-parser.js';
import type { HookDefinition, HookMetadata } from '../types.js';

/**
 * Generate metadata JSON file for runtime discovery
 */
function generateMetadataFile(
  definition: HookDefinition,
  outputDir: string
): string {
  const hookSlug = slugify(definition.name);
  const metadata: HookMetadata = {
    name: hookSlug,
    description: definition.description || `Validation hook: ${definition.name}`,
    tags: definition.tags || [],
    event: definition.trigger.event,
    tools: definition.trigger.tools,
    files: definition.trigger.files,
    skip: definition.trigger.skip,
  };

  const metadataPath = path.join(outputDir, `${hookSlug}.meta.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return metadataPath;
}

/**
 * Generate a hook from a markdown file
 */
export function generateHook(
  mdFilePath: string,
  outputDir: string
): { outputPath: string; metadataPath: string; definition: HookDefinition } {
  // Parse the markdown file
  const definition = parseMarkdownFile(mdFilePath);

  // Validate
  const validation = validateHookDefinition(definition);
  if (!validation.valid) {
    throw new Error(`Invalid hook definition: ${validation.errors.join(', ')}`);
  }

  // Generate the hook code
  const hookCode = generateHookCode(definition, mdFilePath);

  // Write to output file
  const outputFileName = `${slugify(definition.name)}.ts`;
  const outputPath = path.join(outputDir, outputFileName);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write the hook file
  fs.writeFileSync(outputPath, hookCode, 'utf-8');

  // Generate metadata file for runtime discovery
  const metadataPath = generateMetadataFile(definition, outputDir);

  return { outputPath, metadataPath, definition };
}

/**
 * Generate multiple hooks from markdown files
 */
export function generateHooks(
  mdFilePaths: string[],
  outputDir: string
): Array<{ outputPath: string; metadataPath?: string; definition: HookDefinition; error?: string }> {
  const results: Array<{
    outputPath: string;
    metadataPath?: string;
    definition: HookDefinition;
    error?: string;
  }> = [];

  for (const mdPath of mdFilePaths) {
    try {
      const result = generateHook(mdPath, outputDir);
      results.push(result);
    } catch (error) {
      results.push({
        outputPath: '',
        definition: { name: mdPath } as HookDefinition,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Generate TypeScript code for a hook
 */
function generateHookCode(definition: HookDefinition, sourcePath: string): string {
  // If this is a router hook, generate router-specific code
  if (definition.router) {
    return generateRouterHookCode(definition, sourcePath);
  }

  // Otherwise, generate standard hook code
  return generateStandardHookCode(definition, sourcePath);
}

/**
 * Generate TypeScript code for a standard (non-router) hook
 */
function generateStandardHookCode(definition: HookDefinition, sourcePath: string): string {
  const trigger = JSON.stringify(definition.trigger, null, 2);
  const options = JSON.stringify(definition.options, null, 2);
  const prompt = escapeTemplateString(definition.prompt);

  return `#!/usr/bin/env npx tsx
/**
 * Generated Claude Hook: ${definition.name}
 * Source: ${path.basename(sourcePath)}
 * Generated: ${new Date().toISOString()}
 *
 * This hook uses Claude Agent SDK for validation.
 * No API key required - uses existing Claude Code session.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Configuration (from markdown)
// ============================================================================

const HOOK_NAME = ${JSON.stringify(definition.name)};

const TRIGGER: {
  event: string;
  tools?: string[];
  files?: string[];
  skip?: string[];
} = ${trigger};

const OPTIONS = ${options};

const VALIDATION_PROMPT = \`${prompt}\`;

// ============================================================================
// Claude Integration
// ============================================================================

const SYSTEM_PROMPT = \`You are a code validation hook for Claude Code.

Your job is to review code changes and provide a decision:
- If the code is acceptable, respond with: DECISION: ALLOW
- If the code has issues that should block the change, respond with: DECISION: BLOCK
- Provide a brief reason for your decision

Format your response as:
DECISION: ALLOW or BLOCK
REASON: <brief explanation>

Be concise and focus on the specific validation criteria provided.\`;

async function callClaude(prompt: string): Promise<string> {
  const textParts: string[] = [];

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: OPTIONS.maxTurns,
      disallowedTools: [
        'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep',
        'WebFetch', 'WebSearch', 'TodoRead', 'TodoWrite', 'Task', 'NotebookEdit'
      ],
    },
  })) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text);
          }
        }
      }
    } else if (message.type === 'result' && 'subtype' in message && message.subtype === 'success') {
      if ('result' in message && typeof message.result === 'string') {
        return message.result;
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join('\\n');
  }

  throw new Error('No response from Claude');
}

function parseResponse(response: string): { decision: 'allow' | 'block'; reason: string } {
  const upper = response.toUpperCase();
  let decision: 'allow' | 'block' = 'allow';

  if (upper.includes('DECISION: BLOCK') || upper.includes('DECISION:BLOCK')) {
    decision = 'block';
  } else if (upper.includes('BLOCK') && !upper.includes('ALLOW')) {
    decision = 'block';
  }

  let reason = '';
  const reasonMatch = response.match(/REASON:\\s*(.+)/i);
  if (reasonMatch) {
    reason = reasonMatch[1].trim();
  } else {
    const lines = response.split('\\n').filter(l => l.trim());
    reason = lines[0] || 'Validation completed';
  }

  return { decision, reason };
}

// ============================================================================
// Hook Logic
// ============================================================================

interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  prompt?: string;
  reason?: string;
}

interface HookOutput {
  decision?: 'block';
  reason?: string;
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
  };
}

function shouldTrigger(input: HookInput): boolean {
  // Check tool name for PreToolUse/PostToolUse
  if (TRIGGER.tools && TRIGGER.tools.length > 0) {
    if (!input.tool_name || !TRIGGER.tools.includes(input.tool_name)) {
      return false;
    }
  }

  // Check file patterns if tool_input has file_path
  const filePath = (input.tool_input as { file_path?: string })?.file_path;
  if (filePath) {
    // Check skip patterns first
    if (TRIGGER.skip && matchesAnyPattern(filePath, TRIGGER.skip)) {
      return false;
    }

    // Check include patterns
    if (TRIGGER.files && TRIGGER.files.length > 0) {
      if (!matchesAnyPattern(filePath, TRIGGER.files)) {
        return false;
      }
    }
  }

  return true;
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  // Get just the filename for simple patterns, full path for glob patterns
  const fileName = filePath.split('/').pop() || filePath;

  return patterns.some(pattern => {
    // Convert glob to regex
    let regex = pattern
      .replace(/\\./g, '\\\\.')
      .replace(/\\*\\*/g, '{{GLOBSTAR}}')
      .replace(/\\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\\?/g, '.');

    // If pattern starts with **/, match against full path without requiring start anchor
    if (pattern.startsWith('**/')) {
      return new RegExp(\`\${regex}$\`).test(filePath);
    }

    // For simple patterns like *.js, match against filename
    if (!pattern.includes('/')) {
      return new RegExp(\`^\${regex}$\`).test(fileName);
    }

    // For other patterns, try to match the end of the path
    return new RegExp(\`\${regex}$\`).test(filePath);
  });
}

function buildPrompt(input: HookInput): string {
  let context = '';

  // Add file content if available
  const toolInput = input.tool_input as { file_path?: string; content?: string; new_string?: string };
  if (toolInput?.file_path) {
    context += \`File: \${toolInput.file_path}\\n\\n\`;
  }
  if (toolInput?.content) {
    context += \`Content:\\n\\\`\\\`\\\`\\n\${toolInput.content}\\n\\\`\\\`\\\`\\n\\n\`;
  }
  if (toolInput?.new_string) {
    context += \`New content:\\n\\\`\\\`\\\`\\n\${toolInput.new_string}\\n\\\`\\\`\\\`\\n\\n\`;
  }

  // Add tool result if available (PostToolUse)
  if (input.tool_result) {
    context += \`Tool result: \${JSON.stringify(input.tool_result).slice(0, 500)}\\n\\n\`;
  }

  return \`\${VALIDATION_PROMPT}\\n\\n\${context}\`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  try {
    // Read input from stdin
    const inputStr = await readStdin();

    if (!inputStr.trim()) {
      console.log('{}');
      return;
    }

    let input: HookInput;
    try {
      input = JSON.parse(inputStr);
    } catch {
      console.log('{}');
      return;
    }

    // Check if hook should trigger
    if (!shouldTrigger(input)) {
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] Skipped - trigger conditions not met\`
      }));
      return;
    }

    // Build prompt and call Claude
    const prompt = buildPrompt(input);
    const response = await callClaude(prompt);
    const { decision, reason } = parseResponse(response);

    // Build output matching Claude Code's expected schema
    const output: HookOutput = {
      decision: decision === 'block' ? 'block' : undefined,
      reason: \`[\${HOOK_NAME}] \${reason}\`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: \`Hook: \${HOOK_NAME}. Claude response: \${response.slice(0, 300)}\`
      }
    };

    // Remove undefined decision for cleaner output
    if (!output.decision) {
      delete output.decision;
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    // Fail based on configured mode
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (OPTIONS.failMode === 'closed') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: \`[\${HOOK_NAME}] Error (fail-closed): \${errorMsg}\`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: \`Hook error: \${errorMsg}\`
        }
      }));
    } else {
      // Fail open - allow the operation
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] Error (fail-open): \${errorMsg}\`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: \`Hook error (allowed): \${errorMsg}\`
        }
      }));
    }
  }
}

main();
`;
}

/**
 * Generate TypeScript code for a router hook
 * Router hooks dynamically discover available hooks and call Claude to decide which to run
 */
function generateRouterHookCode(definition: HookDefinition, sourcePath: string): string {
  const trigger = JSON.stringify(definition.trigger, null, 2);
  const options = JSON.stringify(definition.options, null, 2);
  const basePrompt = escapeTemplateString(definition.prompt);
  // Optional allowlist - if specified, only these hooks can be called
  const allowlist = definition.router?.callableHooks?.length
    ? JSON.stringify(definition.router.callableHooks)
    : 'null';

  return `#!/usr/bin/env npx tsx
/**
 * Generated Claude Router Hook: ${definition.name}
 * Source: ${path.basename(sourcePath)}
 * Generated: ${new Date().toISOString()}
 *
 * This is a ROUTER hook with DYNAMIC hook discovery.
 * It scans for .meta.json files to discover available validators.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Configuration (from markdown)
// ============================================================================

const HOOK_NAME = ${JSON.stringify(definition.name)};

const TRIGGER: {
  event: string;
  tools?: string[];
  files?: string[];
  skip?: string[];
} = ${trigger};

const OPTIONS = ${options};

// Base routing prompt (hook descriptions are added dynamically)
const BASE_ROUTING_PROMPT = \`${basePrompt}\`;

// Optional allowlist of hooks (null = discover all)
const HOOK_ALLOWLIST: string[] | null = ${allowlist};

// Generated hooks directory (same directory as this file)
const GENERATED_DIR = path.dirname(new URL(import.meta.url).pathname);

// ============================================================================
// Dynamic Hook Discovery
// ============================================================================

interface HookMetadata {
  name: string;
  description: string;
  tags: string[];
  event: string;
  tools?: string[];
  files?: string[];
  skip?: string[];
}

let cachedHooks: HookMetadata[] | null = null;

function discoverHooks(): HookMetadata[] {
  if (cachedHooks !== null) {
    return cachedHooks;
  }

  const hooks: HookMetadata[] = [];

  try {
    const files = fs.readdirSync(GENERATED_DIR);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));

    for (const metaFile of metaFiles) {
      try {
        const content = fs.readFileSync(path.join(GENERATED_DIR, metaFile), 'utf-8');
        const metadata: HookMetadata = JSON.parse(content);

        // Skip router hooks themselves
        if (metadata.name === HOOK_NAME || metadata.name.includes('router')) {
          continue;
        }

        // If allowlist is specified, only include listed hooks
        if (HOOK_ALLOWLIST !== null && !HOOK_ALLOWLIST.includes(metadata.name)) {
          continue;
        }

        hooks.push(metadata);
      } catch {
        // Skip invalid metadata files
      }
    }
  } catch {
    // Directory read failed
  }

  cachedHooks = hooks;
  return hooks;
}

function buildDynamicRoutingPrompt(hooks: HookMetadata[]): string {
  if (hooks.length === 0) {
    return BASE_ROUTING_PROMPT;
  }

  const hookDescriptions = hooks
    .map(h => {
      const tags = h.tags.length > 0 ? \` [tags: \${h.tags.join(', ')}]\` : '';
      return \`- \${h.name}: \${h.description}\${tags}\`;
    })
    .join('\\n');

  return \`\${BASE_ROUTING_PROMPT}

Available validators:
\${hookDescriptions}

Return ONLY a JSON array of validator names from the list above. No explanation needed.\`;
}

// ============================================================================
// Hook Invocation
// ============================================================================

interface HookOutput {
  decision?: 'block';
  reason?: string;
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
  };
}

interface HookInvocationResult {
  hookName: string;
  output: HookOutput;
  success: boolean;
  error?: string;
}

async function invokeHook(hookName: string, input: unknown): Promise<HookInvocationResult> {
  const hookPath = path.join(GENERATED_DIR, \`\${hookName}.ts\`);

  if (!fs.existsSync(hookPath)) {
    return {
      hookName,
      output: {},
      success: false,
      error: \`Hook file not found: \${hookPath}\`,
    };
  }

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: GENERATED_DIR,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.on('close', (code: number | null) => {
      let output: HookOutput = {};
      try {
        const jsonMatch = stdout.match(/\\{[\\s\\S]*\\}/);
        if (jsonMatch) {
          output = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // If no valid JSON output, treat as allow
      }

      if (code !== 0 && !output.decision) {
        output.decision = 'block';
      }

      resolve({
        hookName,
        output,
        success: code === 0,
        error: stderr || undefined,
      });
    });

    child.on('error', (err: Error) => {
      resolve({
        hookName,
        output: {},
        success: false,
        error: err.message,
      });
    });
  });
}

async function invokeHooksParallel(hookNames: string[], input: unknown): Promise<HookInvocationResult[]> {
  const promises = hookNames.map((name) => invokeHook(name, input));
  return Promise.all(promises);
}

// ============================================================================
// Claude Integration (for routing decisions)
// ============================================================================

const SYSTEM_PROMPT = \`You are a code quality router. Your job is to analyze code and decide which validators should run.

Return ONLY a JSON array of validator names. No other text.
Example: ["validate-security", "validate-yagni"]

If no validators apply, return an empty array: []\`;

async function callClaude(prompt: string): Promise<string> {
  const textParts: string[] = [];

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 1,
      disallowedTools: [
        'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep',
        'WebFetch', 'WebSearch', 'TodoRead', 'TodoWrite', 'Task', 'NotebookEdit'
      ],
    },
  })) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text);
          }
        }
      }
    } else if (message.type === 'result' && 'subtype' in message && message.subtype === 'success') {
      if ('result' in message && typeof message.result === 'string') {
        return message.result;
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join('\\n');
  }

  throw new Error('No response from Claude');
}

function parseHookList(response: string, validHookNames: string[]): string[] {
  try {
    const match = response.match(/\\[[\\s\\S]*?\\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        // Filter to only discovered hooks
        return parsed.filter(name => validHookNames.includes(name));
      }
    }
  } catch {
    // Parsing failed
  }
  return [];
}

// ============================================================================
// Hook Logic
// ============================================================================

interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  prompt?: string;
  reason?: string;
}

function shouldTrigger(input: HookInput): boolean {
  if (TRIGGER.tools && TRIGGER.tools.length > 0) {
    if (!input.tool_name || !TRIGGER.tools.includes(input.tool_name)) {
      return false;
    }
  }

  const filePath = (input.tool_input as { file_path?: string })?.file_path;
  if (filePath) {
    if (TRIGGER.skip && matchesAnyPattern(filePath, TRIGGER.skip)) {
      return false;
    }
    if (TRIGGER.files && TRIGGER.files.length > 0) {
      if (!matchesAnyPattern(filePath, TRIGGER.files)) {
        return false;
      }
    }
  }

  return true;
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const fileName = filePath.split('/').pop() || filePath;

  return patterns.some(pattern => {
    let regex = pattern
      .replace(/\\./g, '\\\\.')
      .replace(/\\*\\*/g, '{{GLOBSTAR}}')
      .replace(/\\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\\?/g, '.');

    if (pattern.startsWith('**/')) {
      return new RegExp(\`\${regex}$\`).test(filePath);
    }
    if (!pattern.includes('/')) {
      return new RegExp(\`^\${regex}$\`).test(fileName);
    }
    return new RegExp(\`\${regex}$\`).test(filePath);
  });
}

function buildContextPrompt(input: HookInput, dynamicPrompt: string): string {
  let context = '';

  const toolInput = input.tool_input as { file_path?: string; content?: string; new_string?: string };
  if (toolInput?.file_path) {
    context += \`File: \${toolInput.file_path}\\n\\n\`;
  }
  if (toolInput?.content) {
    context += \`Content:\\n\\\`\\\`\\\`\\n\${toolInput.content}\\n\\\`\\\`\\\`\\n\\n\`;
  }
  if (toolInput?.new_string) {
    context += \`New content:\\n\\\`\\\`\\\`\\n\${toolInput.new_string}\\n\\\`\\\`\\\`\\n\\n\`;
  }

  return \`\${dynamicPrompt}\\n\\n\${context}\`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  try {
    const inputStr = await readStdin();

    if (!inputStr.trim()) {
      console.log('{}');
      return;
    }

    let input: HookInput;
    try {
      input = JSON.parse(inputStr);
    } catch {
      console.log('{}');
      return;
    }

    if (!shouldTrigger(input)) {
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] Skipped - trigger conditions not met\`
      }));
      return;
    }

    // Step 1: Discover available hooks
    const discoveredHooks = discoverHooks();
    const validHookNames = discoveredHooks.map(h => h.name);

    if (discoveredHooks.length === 0) {
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] No validators discovered in \${GENERATED_DIR}\`
      }));
      return;
    }

    // Step 2: Build dynamic routing prompt with discovered hook descriptions
    const dynamicPrompt = buildDynamicRoutingPrompt(discoveredHooks);
    const fullPrompt = buildContextPrompt(input, dynamicPrompt);

    // Step 3: Call Claude to get list of hooks to run
    const routingResponse = await callClaude(fullPrompt);
    const hooksToRun = parseHookList(routingResponse, validHookNames);

    if (hooksToRun.length === 0) {
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] No validators needed for this file\`
      }));
      return;
    }

    // Step 4: Invoke the selected hooks in parallel
    const results = await invokeHooksParallel(hooksToRun, input);

    // Step 5: Aggregate results
    const reasons: string[] = [];
    let shouldBlock = false;

    for (const result of results) {
      if (result.output.decision === 'block') {
        shouldBlock = true;
      }
      if (result.output.reason) {
        reasons.push(result.output.reason);
      }
      if (result.error) {
        reasons.push(\`[\${result.hookName}] Error: \${result.error}\`);
      }
    }

    const output: HookOutput = {
      decision: shouldBlock ? 'block' : undefined,
      reason: reasons.length > 0
        ? \`[\${HOOK_NAME}] Ran \${hooksToRun.join(', ')}:\\n\\n\${reasons.join('\\n\\n')}\`
        : \`[\${HOOK_NAME}] All validators passed\`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: \`Router discovered \${discoveredHooks.length} hooks, invoked: \${hooksToRun.join(', ')}\`
      }
    };

    if (!output.decision) {
      delete output.decision;
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (OPTIONS.failMode === 'closed') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: \`[\${HOOK_NAME}] Router error (fail-closed): \${errorMsg}\`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: \`Router error: \${errorMsg}\`
        }
      }));
    } else {
      console.log(JSON.stringify({
        reason: \`[\${HOOK_NAME}] Router error (fail-open): \${errorMsg}\`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: \`Router error (allowed): \${errorMsg}\`
        }
      }));
    }
  }
}

main();
`;
}

/**
 * Convert name to URL-friendly slug
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Escape backticks and ${} in template strings
 */
function escapeTemplateString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Generate Claude Code settings.json hook entry
 */
export function generateSettingsEntry(definition: HookDefinition, hookPath: string): object {
  const entry: {
    matcher?: string;
    hooks: Array<{ type: string; command: string }>;
  } = {
    hooks: [
      {
        type: 'command',
        command: `npx tsx ${hookPath}`,
      },
    ],
  };

  // Add matcher for tool-based hooks
  if (definition.trigger.tools && definition.trigger.tools.length > 0) {
    entry.matcher = definition.trigger.tools.join('|');
  }

  return entry;
}
