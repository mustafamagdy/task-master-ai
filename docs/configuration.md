# Configuration

Taskmaster uses two primary methods for configuration:

1.  **`.taskmasterconfig` File (Project Root - Recommended for most settings)**

    - This JSON file stores most configuration settings, including AI model selections, parameters, logging levels, and project defaults.
    - **Location:** This file is created in the root directory of your project when you run the `task-master models --setup` interactive setup. You typically do this during the initialization sequence. Do not manually edit this file beyond adjusting Temperature and Max Tokens depending on your model.
    - **Management:** Use the `task-master models --setup` command (or `models` MCP tool) to interactively create and manage this file. You can also set specific models directly using `task-master models --set-<role>=<model_id>`, adding `--ollama` or `--openrouter` flags for custom models. Manual editing is possible but not recommended unless you understand the structure.
    - **Example Structure:**
      ```json
      {
      	"models": {
      		"main": {
      			"provider": "anthropic",
      			"modelId": "claude-3-7-sonnet-20250219",
      			"maxTokens": 64000,
      			"temperature": 0.2,
      			"baseUrl": "https://api.anthropic.com/v1"
      		},
      		"research": {
      			"provider": "perplexity",
      			"modelId": "sonar-pro",
      			"maxTokens": 8700,
      			"temperature": 0.1,
      			"baseUrl": "https://api.perplexity.ai/v1"
      		},
      		"fallback": {
      			"provider": "anthropic",
      			"modelId": "claude-3-5-sonnet",
      			"maxTokens": 64000,
      			"temperature": 0.2
      		}
      	},
      	"global": {
      		"logLevel": "info",
      		"debug": false,
      		"defaultSubtasks": 5,
      		"defaultPriority": "medium",
      		"projectName": "Your Project Name",
      		"ollamaBaseUrl": "http://localhost:11434/api",
      		"azureOpenaiBaseUrl": "https://your-endpoint.openai.azure.com/"
      	},
      	"ticketing": {
      	  "system": "none",
      	  "integrationEnabled": false,
      	  "jiraProjectKey": "YOUR_PROJECT_KEY",
      	  "jiraBaseUrl": "https://your-jira-instance.atlassian.net",
      	  "jiraEmail": "your-email@example.com",
      	  "jiraApiToken": "YOUR_JIRA_API_TOKEN",
      	  "githubToken": "YOUR_GITHUB_PAT",
      	  "githubOwner": "your-github-username-or-org",
      	  "githubRepository": "your-repo-name",
      	  "githubProjectNumber": "your-project-number",
      	  "azureOrganization": "https://dev.azure.com/YourOrgName",
      	  "azurePersonalAccessToken": "YOUR_AZURE_DEVOPS_PAT",
      	  "azureProjectName": "YourAzureDevOpsProjectName"
      	}
      }
      ```

2.  **Environment Variables (`.env` file or MCP `env` block - For API Keys Only)**
    - Used **exclusively** for sensitive API keys and specific endpoint URLs.
    - **Location:**
      - For CLI usage: Create a `.env` file in your project root.
      - For MCP/Cursor usage: Configure keys in the `env` section of your `.cursor/mcp.json` file.
    - **Required API Keys (Depending on configured providers):**
      - `ANTHROPIC_API_KEY`: Your Anthropic API key.
      - `PERPLEXITY_API_KEY`: Your Perplexity API key.
      - `OPENAI_API_KEY`: Your OpenAI API key.
      - `GOOGLE_API_KEY`: Your Google API key.
      - `MISTRAL_API_KEY`: Your Mistral API key.
      - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key (also requires `AZURE_OPENAI_ENDPOINT`).
      - `OPENROUTER_API_KEY`: Your OpenRouter API key.
      - `XAI_API_KEY`: Your X-AI API key.
    - **Optional Endpoint Overrides:**
      - **Per-role `baseUrl` in `.taskmasterconfig`:** You can add a `baseUrl` property to any model role (`main`, `research`, `fallback`) to override the default API endpoint for that provider. If omitted, the provider's standard endpoint is used.
      - `AZURE_OPENAI_ENDPOINT`: Required if using Azure OpenAI key (can also be set as `baseUrl` for the Azure model role).
      - `OLLAMA_BASE_URL`: Override the default Ollama API URL (Default: `http://localhost:11434/api`).

**Important:** Settings like model ID selections (`main`, `research`, `fallback`), `maxTokens`, `temperature`, `logLevel`, `defaultSubtasks`, `defaultPriority`, and `projectName` are **managed in `.taskmasterconfig`**, not environment variables.

## Example `.env` File (for API Keys)

```
# Required API keys for providers configured in .taskmasterconfig
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
PERPLEXITY_API_KEY=pplx-your-key-here
# OPENAI_API_KEY=sk-your-key-here
# GOOGLE_API_KEY=AIzaSy...
# etc.

# Optional Endpoint Overrides
# AZURE_OPENAI_ENDPOINT=https://your-azure-endpoint.openai.azure.com/
# OLLAMA_BASE_URL=http://custom-ollama-host:11434/api
```

## Ticketing System Integration

Taskmaster can integrate with Jira, GitHub Issues, and Azure DevOps Boards to create and synchronize tasks as tickets/issues/work items. This is configured via the `ticketing` object within the `.taskmasterconfig` file.

```json
// In .taskmasterconfig
"ticketing": {
  "system": "none",
  "integrationEnabled": false,
  "jiraProjectKey": "YOUR_PROJECT_KEY",
  "jiraBaseUrl": "https://your-jira-instance.atlassian.net",
  "jiraEmail": "your-email@example.com",
  "jiraApiToken": "YOUR_JIRA_API_TOKEN", // Note: Store securely if possible
  "githubToken": "YOUR_GITHUB_PAT", // Note: Store securely if possible
  "githubOwner": "your-github-username-or-org",
  "githubRepository": "your-repo-name",
  "githubProjectNumber": "your-project-number", // Optional: for GitHub Projects
  "azureOrganization": "https://dev.azure.com/YourOrgName",
  "azurePersonalAccessToken": "YOUR_AZURE_DEVOPS_PAT", // Note: Store securely if possible
  "azureProjectName": "YourAzureDevOpsProjectName"
}
```

### Configuration Fields:

*   **`system` (string):** Specifies the ticketing system to integrate with.
    *   Valid values:
        *   `"none"`: (Default) No ticketing integration.
        *   `"jira"`: Integrate with Jira.
        *   `"github"`: Integrate with GitHub Issues (and optionally GitHub Projects).
        *   `"azure"`: Integrate with Azure DevOps Boards.
*   **`integrationEnabled` (boolean):** Set to `true` to enable the selected integration. Defaults to `false`.

### Jira Configuration (`system: "jira"`)

*   **`jiraProjectKey` (string):** Your Jira project key (e.g., "PROJ", "TASK").
*   **`jiraBaseUrl` (string):** The base URL of your Jira instance (e.g., "https://your-domain.atlassian.net").
*   **`jiraEmail` (string):** The email address associated with your Jira account (used for authentication with the API token).
*   **`jiraApiToken` (string):** Your Jira API token. Create this from your Atlassian account settings.

### GitHub Configuration (`system: "github"`)

*   **`githubToken` (string):** Your GitHub Personal Access Token (PAT). Required scopes:
    *   `repo`: For accessing repositories and managing issues.
    *   `project`: (If using GitHub Projects integration) For managing project items.
*   **`githubOwner` (string):** The owner of the repository (your GitHub username or organization name).
*   **`githubRepository` (string):** The name of the repository where issues will be created.
*   **`githubProjectNumber` (string, optional):** The number of your GitHub Project (classic or new "Projects V2") if you want to associate created issues with a project. This can usually be found in the project's URL.

### Azure DevOps Configuration (`system: "azure"`)

*   **`azureOrganization` (string):** Your Azure DevOps organization URL (e.g., "https://dev.azure.com/YourOrgName").
*   **`azurePersonalAccessToken` (string):** Your Azure DevOps Personal Access Token (PAT). Required scopes typically include:
    *   `Work Items (Read, write, & manage)`
    *   Ensure the token has access to the specified project.
*   **`azureProjectName` (string):** The name of your Azure DevOps project where work items will be created.

### Note on Token Security

API tokens and Personal Access Tokens (`jiraApiToken`, `githubToken`, `azurePersonalAccessToken`) are sensitive credentials. The current configuration stores them directly in the `.taskmasterconfig` file. 
Be mindful of this if you commit your `.taskmasterconfig` file to a shared repository. 
While Taskmaster's `.gitignore` attempts to exclude this file by default, ensure your project's `.gitignore` also correctly excludes it if you prefer not to share this configuration.
For enhanced security, consider whether these tokens should be managed via environment variables (similar to AI provider API keys), though this would require adjustments to how Taskmaster's `config-manager.js` retrieves these specific values.

## Troubleshooting

### Configuration Errors

- If Task Master reports errors about missing configuration or cannot find `.taskmasterconfig`, run `task-master models --setup` in your project root to create or repair the file.
- Ensure API keys are correctly placed in your `.env` file (for CLI) or `.cursor/mcp.json` (for MCP) and are valid for the providers selected in `.taskmasterconfig`.

### If `task-master init` doesn't respond:

Try running it with Node directly:

```bash
node node_modules/claude-task-master/scripts/init.js
```

Or clone the repository and run:

```bash
git clone https://github.com/eyaltoledano/claude-task-master.git
cd claude-task-master
node scripts/init.js
```
