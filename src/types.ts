/**
 * Minimal type definitions for Claude-powered hooks
 */

// ============================================================================
// Hook Definition Types
// ============================================================================

/**
 * Lifecycle events supported by Claude Code hooks
 */
export type LifecycleEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'UserPromptSubmit'
  | 'SessionStart';

/**
 * How the hook handles errors
 * - 'open': Allow operation to continue on hook errors (fail-safe)
 * - 'closed': Block operation on hook errors (fail-secure)
 */
export type FailMode = 'open' | 'closed';

/**
 * Trigger conditions for when the hook should run
 */
export interface HookTrigger {
  /** Which lifecycle event triggers this hook */
  event: LifecycleEvent;
  /** Which Claude tools trigger this hook (for PreToolUse/PostToolUse) */
  tools?: string[];
  /** File patterns to match (glob patterns) */
  files?: string[];
  /** File patterns to skip (glob patterns) */
  skip?: string[];
}

/**
 * Hook configuration options
 */
export interface HookOptions {
  /** How to handle errors - 'open' allows, 'closed' blocks */
  failMode: FailMode;
  /** Maximum turns for Claude (usually 1 for simple checks) */
  maxTurns: number;
}

/**
 * Complete hook definition parsed from markdown
 */
export interface HookDefinition {
  /** Hook name (from markdown header) */
  name: string;
  /** Trigger conditions */
  trigger: HookTrigger;
  /** The validation prompt to send to Claude */
  prompt: string;
  /** Hook options */
  options: HookOptions;
}

// ============================================================================
// Claude Code Hook Protocol Types
// ============================================================================

/**
 * Input received from Claude Code for PreToolUse hooks
 */
export interface PreToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/**
 * Input received from Claude Code for PostToolUse hooks
 */
export interface PostToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_result: unknown;
}

/**
 * Input received from Claude Code for Stop hooks
 */
export interface StopInput {
  reason: 'user_cancelled' | 'max_iterations' | 'task_completed';
}

/**
 * Input received from Claude Code for UserPromptSubmit hooks
 */
export interface UserPromptSubmitInput {
  prompt: string;
}

/**
 * Union type for all possible hook inputs
 */
export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | StopInput
  | UserPromptSubmitInput;

/**
 * Hook decision - what action to take
 */
export type HookDecision = 'allow' | 'block' | 'allowAndPause';

/**
 * Output format for Claude Code hooks
 */
export interface HookOutput {
  /** Decision: undefined = allow, 'block' = block, 'allowAndPause' = allow but pause */
  decision?: HookDecision;
  /** Reason for the decision (shown to user) */
  reason?: string;
  /** Additional hook-specific output */
  hookSpecificOutput?: {
    additionalContext?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_OPTIONS: HookOptions = {
  failMode: 'open',
  maxTurns: 1,
};

export const DEFAULT_TRIGGER: Partial<HookTrigger> = {
  event: 'PostToolUse',
  tools: ['Edit', 'Write'],
  skip: ['node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
};
