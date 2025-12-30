/**
 * Claude Hooks - Main Entry Point
 *
 * Generate Claude-powered hooks from markdown definitions.
 */

// Types
export type {
  LifecycleEvent,
  FailMode,
  HookTrigger,
  HookOptions,
  HookDefinition,
  PreToolUseInput,
  PostToolUseInput,
  StopInput,
  UserPromptSubmitInput,
  HookInput,
  HookDecision,
  HookOutput,
} from './types.js';

export { DEFAULT_OPTIONS, DEFAULT_TRIGGER } from './types.js';

// Parser
export {
  parseMarkdown,
  parseMarkdownFile,
  validateHookDefinition,
} from './parser/md-parser.js';

// Generator
export {
  generateHook,
  generateHooks,
  generateSettingsEntry,
} from './generator/hook-generator.js';

// Claude client (for runtime use)
export { callClaude, parseClaudeResponse } from './runtime/claude-client.js';
