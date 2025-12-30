/**
 * Claude Agent SDK Client
 *
 * Simple wrapper around the Claude Agent SDK for hook validation.
 * Uses the existing Claude Code session - no API key needed.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookOptions } from '../types.js';

/**
 * System prompt for hook validation
 */
const SYSTEM_PROMPT = `You are a code validation hook for Claude Code.

Your job is to review code changes and provide a decision:
- If the code is acceptable, respond with: DECISION: ALLOW
- If the code has issues that should block the change, respond with: DECISION: BLOCK
- Provide a brief reason for your decision

Format your response as:
DECISION: ALLOW or BLOCK
REASON: <brief explanation>

Be concise and focus on the specific validation criteria provided.`;

/**
 * Call Claude with a validation prompt
 */
export async function callClaude(
  prompt: string,
  options: HookOptions
): Promise<string> {
  const textParts: string[] = [];

  try {
    for await (const message of query({
      prompt,
      options: {
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: options.maxTurns,
        // Disable all tools - we only want text analysis
        disallowedTools: [
          'Read',
          'Write',
          'Edit',
          'MultiEdit',
          'Bash',
          'Glob',
          'Grep',
          'WebFetch',
          'WebSearch',
          'TodoRead',
          'TodoWrite',
          'Task',
          'NotebookEdit',
        ],
      },
    })) {
      // Handle assistant messages - extract text from content blocks
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              textParts.push(block.text);
            }
          }
        }
      }
      // Handle result messages - get the final result string
      else if (
        message.type === 'result' &&
        'subtype' in message &&
        message.subtype === 'success'
      ) {
        if ('result' in message && typeof message.result === 'string') {
          return message.result;
        }
      }
    }

    // Return collected text if no explicit result
    if (textParts.length > 0) {
      return textParts.join('\n');
    }

    throw new Error('No response from Claude Agent SDK');
  } catch (error) {
    // Re-throw with more context
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude SDK call failed: ${message}`);
  }
}

/**
 * Parse Claude's response to extract decision and reason
 */
export function parseClaudeResponse(response: string): {
  decision: 'allow' | 'block';
  reason: string;
} {
  const upper = response.toUpperCase();

  // Look for explicit DECISION: BLOCK or DECISION: ALLOW
  let decision: 'allow' | 'block' = 'allow';
  if (upper.includes('DECISION: BLOCK') || upper.includes('DECISION:BLOCK')) {
    decision = 'block';
  } else if (
    upper.includes('DECISION: ALLOW') ||
    upper.includes('DECISION:ALLOW')
  ) {
    decision = 'allow';
  } else if (upper.includes('BLOCK')) {
    // Fallback: if "BLOCK" appears prominently
    decision = 'block';
  }

  // Extract reason
  let reason = '';
  const reasonMatch = response.match(/REASON:\s*(.+)/i);
  if (reasonMatch) {
    reason = reasonMatch[1].trim();
  } else {
    // Use first non-empty line as reason
    const lines = response.split('\n').filter((l) => l.trim());
    reason = lines[0] || 'Validation completed';
  }

  return { decision, reason };
}
