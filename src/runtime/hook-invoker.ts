/**
 * Hook Invoker Utility
 *
 * Allows hooks to programmatically invoke other hooks.
 * Used by router hooks to call specialized validator hooks.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { HookInput, HookOutput } from '../types.js';

/**
 * Result of invoking a hook
 */
export interface HookInvocationResult {
  hookName: string;
  output: HookOutput;
  success: boolean;
  error?: string;
  executionTimeMs: number;
}

/**
 * Invoke a single hook by name
 *
 * @param hookName - Name of the hook (e.g., 'validate-security')
 * @param input - The hook input to pass
 * @param generatedDir - Directory containing generated hook .ts files
 * @returns Promise resolving to the hook's output
 */
export async function invokeHook(
  hookName: string,
  input: HookInput,
  generatedDir: string
): Promise<HookInvocationResult> {
  const startTime = Date.now();
  const hookPath = path.join(generatedDir, `${hookName}.ts`);

  // Check if hook exists
  if (!fs.existsSync(hookPath)) {
    return {
      hookName,
      output: {},
      success: false,
      error: `Hook file not found: ${hookPath}`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(generatedDir),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send input to hook via stdin
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.on('close', (code) => {
      const executionTimeMs = Date.now() - startTime;

      // Try to parse output
      let output: HookOutput = {};
      try {
        // Look for JSON in stdout (hook may also print other messages)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          output = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // If no valid JSON output, treat as allow
      }

      // Non-zero exit code means block (if hook uses process.exit(1) for blocking)
      if (code !== 0 && !output.decision) {
        output.decision = 'block';
      }

      resolve({
        hookName,
        output,
        success: code === 0,
        error: stderr || undefined,
        executionTimeMs,
      });
    });

    child.on('error', (err) => {
      resolve({
        hookName,
        output: {},
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Invoke multiple hooks in parallel
 *
 * @param hookNames - Array of hook names to invoke
 * @param input - The hook input to pass to all hooks
 * @param generatedDir - Directory containing generated hook .ts files
 * @returns Promise resolving to array of results
 */
export async function invokeHooksParallel(
  hookNames: string[],
  input: HookInput,
  generatedDir: string
): Promise<HookInvocationResult[]> {
  const promises = hookNames.map((name) => invokeHook(name, input, generatedDir));
  return Promise.all(promises);
}

/**
 * Aggregate results from multiple hooks
 *
 * @param results - Array of hook invocation results
 * @returns Aggregated HookOutput (blocks if any hook blocks)
 */
export function aggregateResults(results: HookInvocationResult[]): HookOutput {
  const reasons: string[] = [];
  let shouldBlock = false;

  for (const result of results) {
    if (result.output.decision === 'block') {
      shouldBlock = true;
    }
    if (result.output.reason) {
      reasons.push(result.output.reason);
    }
  }

  return {
    decision: shouldBlock ? 'block' : undefined,
    reason: reasons.length > 0 ? reasons.join('\n\n') : undefined,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `Ran ${results.length} validator(s): ${results.map(r => r.hookName).join(', ')}`,
    },
  };
}

/**
 * Parse Claude's response to get list of hooks to run
 * Expects a JSON array like ["validate-security", "validate-yagni"]
 *
 * @param response - Claude's response text
 * @returns Array of hook names, or empty array if parsing fails
 */
export function parseHookList(response: string): string[] {
  try {
    // Try to find a JSON array in the response
    const match = response.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
    }
  } catch {
    // Parsing failed
  }
  return [];
}
