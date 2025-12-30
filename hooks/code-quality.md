# Hook: code-quality

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.tsx
- Skip: **/*.test.ts, **/*.spec.ts, **/*.d.ts, node_modules/**

## Prompt
Review this TypeScript code for quality issues:

1. **Type Safety**: Check for `any` types that should be more specific
2. **Error Handling**: Ensure errors are properly caught and handled
3. **Code Clarity**: Look for confusing logic or overly complex code
4. **Best Practices**: Check for common TypeScript anti-patterns

Only block for serious issues that will likely cause bugs.
Allow with warnings for style or minor concerns.

## Options
- Fail Mode: open
- Max Turns: 1
