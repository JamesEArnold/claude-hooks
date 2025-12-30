# Hook: no-console-logs

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.tsx, **/*.js, **/*.jsx
- Skip: **/*.test.ts, **/*.spec.ts, node_modules/**

## Prompt
Check this code for console.log statements.

Look for:
1. `console.log(...)` calls
2. `console.log` passed as a callback or reference

If any console.log statements are found, block the change and specify which line(s) contain them.
Allow console.warn, console.error, and console.info - only block console.log specifically.

## Options
- Fail Mode: closed
- Max Turns: 1
