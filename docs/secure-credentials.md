# Secure Credential Management

This document explains how to properly handle sensitive information like API tokens in Task Master.

## Handling Sensitive API Tokens

### Do Not Store API Tokens in Configuration Files

API tokens, passwords, and other sensitive credentials should **never** be stored directly in configuration files like `.taskmasterconfig` that are committed to version control. Doing so creates serious security risks as these tokens can be exposed publicly.

### Using Environment Variables

Instead, use environment variables to store sensitive information:

1. Create a `.env` file in your project root:
   ```
   # Jira API Token
   JIRA_API_TOKEN=your_actual_token_here
   
   # Other API tokens as needed
   ANTHROPIC_API_KEY=your_token_here
   PERPLEXITY_API_KEY=your_token_here
   # etc.
   ```

2. Ensure your `.env` file is listed in `.gitignore` to prevent it from being committed to version control.

3. In your `.taskmasterconfig` file, use placeholder values:
   ```json
   "ticketing": {
     "system": "jira",
     "integrationEnabled": true,
     "jiraProjectKey": "YOUR_PROJECT",
     "jiraBaseUrl": "https://your-instance.atlassian.net",
     "jiraEmail": "your.email@example.com",
     "jiraApiToken": "<USE_ENV_VARIABLE_JIRA_API_TOKEN>"
   }
   ```

### For MCP/Cursor Integration

When using MCP with Cursor:

1. Add the necessary API keys in the `env` section of your `.cursor/mcp.json` file.

2. Avoid committing the `mcp.json` file if it contains sensitive information.

## Security Best Practices

- Regularly rotate your API tokens
- Use tokens with minimal necessary permissions
- Never share tokens in chat, emails, or public forums
- Consider using a secrets manager for team environments

## If You Accidentally Commit a Token

If you accidentally commit a sensitive token:

1. Immediately revoke/regenerate the token on the service provider's website
2. Remove the token from the repository history (using tools like BFG Repo Cleaner or git-filter-repo)
3. Push the cleaned history to remote repositories

Remember: Once a token has been committed and pushed to a public repository, it should be considered compromised and should be revoked immediately. 