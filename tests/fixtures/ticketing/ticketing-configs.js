/**
 * Mock Ticketing Configurations for Testing
 * Contains configuration objects for all supported ticketing systems
 */

export const mockJiraConfig = {
	ticketingIntegrationEnabled: true,
	ticketingSystem: 'jira',
	jiraBaseUrl: 'https://test.atlassian.net',
	jiraProjectKey: 'TEST',
	jiraEmail: 'test@example.com',
	jiraApiToken: 'mock-jira-token',
	jiraIssueType: 'Task',
	jiraDefaultPriority: 'Medium'
};

export const mockGitHubConfig = {
	ticketingIntegrationEnabled: true,
	ticketingSystem: 'github',
	githubOwner: 'testowner',
	githubRepository: 'testrepo',
	githubToken: 'mock-github-token',
	githubLabels: ['task', 'taskmaster'],
	githubAssignee: null
};

export const mockAzureConfig = {
	ticketingIntegrationEnabled: true,
	ticketingSystem: 'azdevops',
	azureOrganization: 'testorg',
	azureProjectName: 'testproject',
	azurePersonalAccessToken: 'mock-azure-token',
	azureWorkItemType: 'Task',
	azureAreaPath: 'testproject\\Development'
};

// Disabled ticketing configuration
export const mockDisabledConfig = {
	ticketingIntegrationEnabled: false,
	ticketingSystem: null
};

// Invalid configurations for error testing
export const mockInvalidConfigs = {
	jiraMissingUrl: {
		ticketingIntegrationEnabled: true,
		ticketingSystem: 'jira',
		jiraProjectKey: 'TEST',
		jiraEmail: 'test@example.com',
		jiraApiToken: 'mock-token'
		// Missing jiraBaseUrl
	},
	githubMissingRepo: {
		ticketingIntegrationEnabled: true,
		ticketingSystem: 'github',
		githubOwner: 'testowner',
		githubToken: 'mock-token'
		// Missing githubRepository
	},
	azureMissingOrg: {
		ticketingIntegrationEnabled: true,
		ticketingSystem: 'azdevops',
		azureProjectName: 'testproject',
		azurePersonalAccessToken: 'mock-token'
		// Missing azureOrganization
	},
	unsupportedSystem: {
		ticketingIntegrationEnabled: true,
		ticketingSystem: 'unsupported-system'
	}
};

// Environment variable configurations (for .env testing)
export const mockEnvConfigs = {
	jira: {
		TICKETING_INTEGRATION_ENABLED: 'true',
		TICKETING_SYSTEM: 'jira',
		JIRA_BASE_URL: 'https://test.atlassian.net',
		JIRA_PROJECT_KEY: 'TEST',
		JIRA_EMAIL: 'test@example.com',
		JIRA_API_TOKEN: 'mock-jira-token'
	},
	github: {
		TICKETING_INTEGRATION_ENABLED: 'true',
		TICKETING_SYSTEM: 'github',
		GITHUB_OWNER: 'testowner',
		GITHUB_REPOSITORY: 'testrepo',
		GITHUB_TOKEN: 'mock-github-token'
	},
	azdevops: {
		TICKETING_INTEGRATION_ENABLED: 'true',
		TICKETING_SYSTEM: 'azdevops',
		AZURE_ORGANIZATION: 'testorg',
		AZURE_PROJECT_NAME: 'testproject',
		AZURE_PERSONAL_ACCESS_TOKEN: 'mock-azure-token'
	},
	disabled: {
		TICKETING_INTEGRATION_ENABLED: 'false'
	}
};
