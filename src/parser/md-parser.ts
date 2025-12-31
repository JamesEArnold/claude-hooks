/**
 * Markdown Parser for Hook Definitions
 *
 * Parses markdown files with a simple format:
 * - # Hook: <name>
 * - ## Trigger (event, tools, files, skip)
 * - ## Prompt (validation instructions)
 * - ## Options (failMode, maxTurns)
 */

import * as fs from 'fs';
import type {
  HookDefinition,
  HookTrigger,
  HookOptions,
  LifecycleEvent,
  FailMode,
  RouterConfig,
} from '../types.js';
import { DEFAULT_OPTIONS, DEFAULT_TRIGGER } from '../types.js';

// Valid lifecycle events
const VALID_EVENTS: LifecycleEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'UserPromptSubmit',
  'SessionStart',
];

/**
 * Parse a markdown file into a hook definition
 */
export function parseMarkdownFile(filePath: string): HookDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdown(content);
}

/**
 * Parse markdown content into a hook definition
 */
export function parseMarkdown(content: string): HookDefinition {
  const name = parseName(content);
  const sections = extractSections(content);

  // Check if ## Router section exists in the content (even if empty)
  const hasRouterSection = /^##\s+router\s*$/im.test(content);

  const trigger = parseTrigger(sections.trigger);
  const prompt = parsePrompt(sections.prompt);
  const options = parseOptions(sections.options);
  const router = parseRouter(sections.router, hasRouterSection);
  const description = parseDescription(sections.description);
  const tags = parseTags(sections.tags);

  const definition: HookDefinition = { name, trigger, prompt, options };

  // Add optional fields if present
  if (description) {
    definition.description = description;
  }
  if (tags.length > 0) {
    definition.tags = tags;
  }
  if (router) {
    definition.router = router;
  }
  return definition;
}

/**
 * Extract hook name from markdown header
 */
function parseName(content: string): string {
  const match = content.match(/^#\s+Hook:\s*(.+)$/m);
  if (!match) {
    throw new Error('Missing hook name. Expected: # Hook: <name>');
  }
  return match[1].trim();
}

/**
 * Extract sections from markdown content
 */
function extractSections(content: string): {
  trigger?: string;
  prompt?: string;
  options?: string;
  router?: string;
  description?: string;
  tags?: string;
} {
  const sections: {
    trigger?: string;
    prompt?: string;
    options?: string;
    router?: string;
    description?: string;
    tags?: string;
  } = {};
  const lines = content.split('\n');

  let currentSection: 'trigger' | 'prompt' | 'options' | 'router' | 'description' | 'tags' | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Check for section headers
    if (trimmed.startsWith('## trigger')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'trigger';
      currentContent = [];
    } else if (trimmed.startsWith('## prompt')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'prompt';
      currentContent = [];
    } else if (trimmed.startsWith('## options')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'options';
      currentContent = [];
    } else if (trimmed.startsWith('## router')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'router';
      currentContent = [];
    } else if (trimmed.startsWith('## description')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'description';
      currentContent = [];
    } else if (trimmed.startsWith('## tags')) {
      saveSection(sections, currentSection, currentContent);
      currentSection = 'tags';
      currentContent = [];
    } else if (trimmed.startsWith('#')) {
      // Skip other headers (like the main hook name)
      continue;
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save final section
  saveSection(sections, currentSection, currentContent);

  return sections;
}

function saveSection(
  sections: { trigger?: string; prompt?: string; options?: string; router?: string; description?: string; tags?: string },
  section: 'trigger' | 'prompt' | 'options' | 'router' | 'description' | 'tags' | null,
  content: string[]
): void {
  if (section && content.length > 0) {
    sections[section] = content.join('\n').trim();
  }
}

/**
 * Parse the Trigger section
 */
function parseTrigger(content?: string): HookTrigger {
  const trigger: HookTrigger = {
    event: DEFAULT_TRIGGER.event!,
    tools: DEFAULT_TRIGGER.tools,
    skip: DEFAULT_TRIGGER.skip,
  };

  if (!content) {
    return trigger;
  }

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith('- event:')) {
      const value = extractValue(line, '- event:');
      const event = normalizeEvent(value);
      if (event) {
        trigger.event = event;
      }
    } else if (lower.startsWith('- tools:')) {
      const value = extractValue(line, '- tools:');
      trigger.tools = parseList(value);
    } else if (lower.startsWith('- files:')) {
      const value = extractValue(line, '- files:');
      trigger.files = parseList(value);
    } else if (lower.startsWith('- skip:')) {
      const value = extractValue(line, '- skip:');
      trigger.skip = parseList(value);
    }
  }

  return trigger;
}

/**
 * Parse the Prompt section
 */
function parsePrompt(content?: string): string {
  if (!content || content.trim().length === 0) {
    throw new Error('Missing prompt section. Expected: ## Prompt');
  }
  return content.trim();
}

/**
 * Parse the Description section
 * Returns the first paragraph, trimmed
 */
function parseDescription(content?: string): string | undefined {
  if (content && content.trim().length > 0) {
    // Return first paragraph (up to first blank line)
    return content.trim().split('\n\n')[0].trim();
  }
  // Return undefined - caller can provide default if needed
  return undefined;
}

/**
 * Parse the Tags section
 * Returns comma-separated list as lowercase array
 */
function parseTags(content?: string): string[] {
  if (!content) {
    return [];
  }
  return content
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Parse the Options section
 */
function parseOptions(content?: string): HookOptions {
  const options: HookOptions = { ...DEFAULT_OPTIONS };

  if (!content) {
    return options;
  }

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith('- fail mode:')) {
      const value = extractValue(line, '- fail mode:').toLowerCase();
      if (value === 'open' || value === 'closed') {
        options.failMode = value as FailMode;
      }
    } else if (lower.startsWith('- max turns:')) {
      const value = parseInt(extractValue(line, '- max turns:'), 10);
      if (!isNaN(value) && value > 0) {
        options.maxTurns = value;
      }
    }
  }

  return options;
}

/**
 * Parse the Router section
 * Returns RouterConfig if ## Router section exists (even if empty)
 * Empty callableHooks means "discover all hooks dynamically"
 */
function parseRouter(content?: string, sectionExists?: boolean): RouterConfig | undefined {
  // If router section doesn't exist in the markdown, this is not a router hook
  if (content === undefined && !sectionExists) {
    return undefined;
  }

  // Router section exists - this is a router hook
  // Parse callable hooks if specified (optional allowlist)
  let callableHooks: string[] = [];

  if (content) {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower.startsWith('- callable:')) {
        const value = extractValue(line, '- callable:');
        callableHooks = parseList(value);
      }
    }
  }

  // Return RouterConfig with callableHooks (may be empty for full discovery)
  return { callableHooks };
}

/**
 * Extract value after a prefix (case-insensitive)
 */
function extractValue(line: string, prefix: string): string {
  // Find the prefix case-insensitively
  const lowerLine = line.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();
  const index = lowerLine.indexOf(lowerPrefix);

  if (index === -1) {
    return '';
  }

  return line.slice(index + prefix.length).trim();
}

/**
 * Parse a comma-separated list
 */
function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Normalize event name to proper case
 */
function normalizeEvent(value: string): LifecycleEvent | null {
  const lower = value.toLowerCase();
  for (const event of VALID_EVENTS) {
    if (event.toLowerCase() === lower) {
      return event;
    }
  }
  return null;
}

/**
 * Validate a hook definition
 */
export function validateHookDefinition(
  def: HookDefinition
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!def.name || def.name.trim().length === 0) {
    errors.push('Hook name is required');
  }

  if (!VALID_EVENTS.includes(def.trigger.event)) {
    errors.push(
      `Invalid event: ${def.trigger.event}. Valid: ${VALID_EVENTS.join(', ')}`
    );
  }

  if (!def.prompt || def.prompt.trim().length === 0) {
    errors.push('Prompt is required');
  }

  if (def.prompt.length > 5000) {
    errors.push('Prompt too long (max 5000 characters)');
  }

  if (def.options.maxTurns < 1 || def.options.maxTurns > 10) {
    errors.push('Max turns must be between 1 and 10');
  }

  return { valid: errors.length === 0, errors };
}
