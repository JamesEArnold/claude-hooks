# Hook: security-check

## Trigger
- Event: PostToolUse
- Tools: Edit, Write
- Files: **/*.ts, **/*.tsx, **/*.js
- Skip: **/*.test.ts, **/*.spec.ts, node_modules/**

## Prompt
Review this code for security vulnerabilities:

1. **Hardcoded Secrets**: Check for API keys, passwords, tokens, or credentials
2. **SQL Injection**: Look for string concatenation in SQL queries
3. **XSS Vulnerabilities**: Check for unsanitized user input in HTML output
4. **Command Injection**: Look for unsanitized input in shell commands
5. **Path Traversal**: Check for unsanitized file paths

If you find critical security issues, block the change and explain why.
For minor concerns, allow but mention them in the reason.

## Options
- Fail Mode: closed
- Max Turns: 1
