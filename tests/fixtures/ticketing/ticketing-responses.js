/**
 * Mock Ticketing Responses for Testing
 * Contains mock API responses for all supported ticketing systems
 */

export const mockJiraResponses = {
	createIssue: {
		id: 'PROJ-123',
		key: 'PROJ-123',
		self: 'https://test.atlassian.net/rest/api/2/issue/PROJ-123',
		fields: {
			summary: 'Test Task',
			description: 'Test task description',
			status: { name: 'To Do' },
			priority: { name: 'Medium' }
		}
	},
	updateIssue: {
		id: 'PROJ-123',
		key: 'PROJ-123',
		fields: {
			status: { name: 'Done' },
			updated: '2023-01-01T12:00:00.000Z'
		}
	},
	updateIssueContent: {
		id: 'PROJ-123',
		key: 'PROJ-123',
		fields: {
			summary: 'Updated Task Title',
			description: 'Updated task description',
			updated: '2023-01-01T12:00:00.000Z'
		}
	},
	error: {
		errorMessages: [
			'Issue does not exist or you do not have permission to see it.'
		],
		errors: {}
	},
	rateLimitError: {
		errorMessages: ['Rate limit exceeded. Try again later.'],
		errors: {}
	}
};

export const mockGitHubResponses = {
	createIssue: {
		id: 456,
		number: 456,
		title: 'Test Task',
		body: 'Test task description',
		state: 'open',
		html_url: 'https://github.com/owner/repo/issues/456',
		labels: [{ name: 'task' }],
		assignee: null
	},
	updateIssue: {
		id: 456,
		number: 456,
		title: 'Test Task',
		state: 'closed',
		updated_at: '2023-01-01T12:00:00Z'
	},
	updateIssueContent: {
		id: 456,
		number: 456,
		title: 'Updated Task Title',
		body: 'Updated task description',
		updated_at: '2023-01-01T12:00:00Z'
	},
	error: {
		message: 'Not Found',
		status: 404
	},
	rateLimitError: {
		message: 'API rate limit exceeded',
		status: 403
	}
};

export const mockAzureDevOpsResponses = {
	createWorkItem: {
		id: 789,
		rev: 1,
		fields: {
			'System.Id': 789,
			'System.Title': 'Test Task',
			'System.Description': 'Test task description',
			'System.State': 'New',
			'System.WorkItemType': 'Task'
		},
		url: 'https://dev.azure.com/org/project/_apis/wit/workItems/789'
	},
	updateWorkItem: {
		id: 789,
		rev: 2,
		fields: {
			'System.Id': 789,
			'System.State': 'Done',
			'System.ChangedDate': '2023-01-01T12:00:00.000Z'
		}
	},
	updateWorkItemContent: {
		id: 789,
		rev: 3,
		fields: {
			'System.Id': 789,
			'System.Title': 'Updated Task Title',
			'System.Description': 'Updated task description',
			'System.ChangedDate': '2023-01-01T12:00:00.000Z'
		}
	},
	error: {
		message:
			'Work item does not exist or you do not have permissions to read it.',
		typeKey: 'WorkItemDoesNotExistException'
	},
	rateLimitError: {
		message: 'Rate limit exceeded',
		typeKey: 'RateLimitExceededException'
	}
};

// Common error scenarios for all providers
export const commonErrorScenarios = {
	networkError: new Error('Network connection failed'),
	timeoutError: new Error('Request timeout'),
	authenticationError: new Error('Authentication failed'),
	authorizationError: new Error('Insufficient permissions'),
	serviceUnavailable: new Error('Service temporarily unavailable')
};

// Success responses for different operations
export const successResponses = {
	jira: {
		syncTask: {
			success: true,
			ticketKey: 'PROJ-123',
			ticketUrl: 'https://test.atlassian.net/browse/PROJ-123'
		},
		updateStatus: { success: true, ticketKey: 'PROJ-123', newStatus: 'Done' },
		updateContent: { success: true, ticketKey: 'PROJ-123', updated: true }
	},
	github: {
		syncTask: {
			success: true,
			ticketKey: '456',
			ticketUrl: 'https://github.com/owner/repo/issues/456'
		},
		updateStatus: { success: true, ticketKey: '456', newStatus: 'closed' },
		updateContent: { success: true, ticketKey: '456', updated: true }
	},
	azdevops: {
		syncTask: {
			success: true,
			ticketKey: '789',
			ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/789'
		},
		updateStatus: { success: true, ticketKey: '789', newStatus: 'Done' },
		updateContent: { success: true, ticketKey: '789', updated: true }
	}
};

// Error responses for different operations
export const errorResponses = {
	ticketingNotAvailable: {
		success: false,
		error: 'Ticketing service not available'
	},
	ticketNotFound: {
		success: false,
		error: 'Ticket not found'
	},
	invalidConfiguration: {
		success: false,
		error: 'Invalid ticketing configuration'
	},
	apiError: {
		success: false,
		error: 'API request failed'
	}
};
