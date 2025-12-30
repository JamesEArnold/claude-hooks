#!/usr/bin/env npx tsx
/**
 * Generated Claude Hook: security-check
 * Source: security-check.md
 * Generated: 2025-12-30T19:36:33.291Z
 *
 * This hook uses Claude Agent SDK for validation.
 * No API key required - uses existing Claude Code session.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Configuration (from markdown)
// ============================================================================

const HOOK_NAME = "security-check";

const TRIGGER: {
  event: string;
  tools?: string[];
  files?: string[];
  skip?: string[];
} = {
  "event": "PostToolUse",
  "tools": [
    "Edit",
    "Write"
  ],
  "skip": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "node_modules/**"
  ],
  "files": [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js"
  ]
};

const OPTIONS = {
  "failMode": "closed",
  "maxTurns": 1
};

const VALIDATION_PROMPT = `Review this code for security vulnerabilities:

1. **Hardcoded Secrets**: Check for API keys, passwords, tokens, or credentials
2. **SQL Injection**: Look for string concatenation in SQL queries
3. **XSS Vulnerabilities**: Check for unsanitized user input in HTML output
4. **Command Injection**: Look for unsanitized input in shell commands
5. **Path Traversal**: Check for unsanitized file paths

If you find critical security issues, block the change and explain why.
For minor concerns, allow but mention them in the reason.`;

// ============================================================================
// Claude Integration
// ============================================================================

const SYSTEM_PROMPT = `You are a code validation hook for Claude Code.

Your job is to review code changes and provide a decision:
- If the code is acceptable, respond with: DECISION: ALLOW
- If the code has issues that should block the change, respond with: DECISION: BLOCK
- Provide a brief reason for your decision

Format your response as:
DECISION: ALLOW or BLOCK
REASON: <brief explanation>

Be concise and focus on the specific validation criteria provided.`;

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
    return textParts.join('\n');
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
  const reasonMatch = response.match(/REASON:\s*(.+)/i);
  if (reasonMatch) {
    reason = reasonMatch[1].trim();
  } else {
    const lines = response.split('\n').filter(l => l.trim());
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
  decision?: 'allow' | 'block' | 'allowAndPause';
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
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
  return patterns.some(pattern => {
    // Convert glob to regex (simple implementation)
    const regex = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\./g, '\\.')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filePath);
  });
}

function buildPrompt(input: HookInput): string {
  let context = '';

  // Add file content if available
  const toolInput = input.tool_input as { file_path?: string; content?: string; new_string?: string };
  if (toolInput?.file_path) {
    context += `File: ${toolInput.file_path}\n\n`;
  }
  if (toolInput?.content) {
    context += `Content:\n\`\`\`\n${toolInput.content}\n\`\`\`\n\n`;
  }
  if (toolInput?.new_string) {
    context += `New content:\n\`\`\`\n${toolInput.new_string}\n\`\`\`\n\n`;
  }

  // Add tool result if available (PostToolUse)
  if (input.tool_result) {
    context += `Tool result: ${JSON.stringify(input.tool_result).slice(0, 500)}\n\n`;
  }

  return `${VALIDATION_PROMPT}\n\n${context}`;
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
        reason: `[${HOOK_NAME}] Skipped - trigger conditions not met`
      }));
      return;
    }

    // Build prompt and call Claude
    const prompt = buildPrompt(input);
    const response = await callClaude(prompt);
    const { decision, reason } = parseResponse(response);

    // Build output
    const output: HookOutput = {
      reason: `[${HOOK_NAME}] ${reason}`,
      hookSpecificOutput: {
        hookName: HOOK_NAME,
        claudeResponse: response.slice(0, 500)
      }
    };

    if (decision === 'block') {
      output.decision = 'block';
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    // Fail based on configured mode
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (OPTIONS.failMode === 'closed') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[${HOOK_NAME}] Error (fail-closed): ${errorMsg}`
      }));
    } else {
      // Fail open - allow the operation
      console.log(JSON.stringify({
        reason: `[${HOOK_NAME}] Error (fail-open): ${errorMsg}`
      }));
    }
  }
}

main();
