/**
 * Sample tasks with ticket data for testing
 * Contains tasks that have associated tickets in different ticketing systems
 */

export const tasksWithJiraTickets = {
	meta: {
		projectName: 'Test Project with Jira',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Task with Jira ticket',
			description: 'A task that has an associated Jira ticket',
			status: 'pending',
			dependencies: [],
			priority: 'high',
			details: 'Implementation details for Jira-linked task',
			testStrategy: 'Test with Jira integration enabled',
			externalTicket: {
				system: 'jira',
				ticketId: 'PROJ-123',
				ticketKey: 'PROJ-123',
				ticketUrl: 'https://test.atlassian.net/browse/PROJ-123',
				createdAt: '2023-01-01T10:00:00.000Z'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask with Jira ticket',
					description: 'A subtask with its own Jira ticket',
					status: 'pending',
					dependencies: [],
					externalTicket: {
						system: 'jira',
						ticketId: 'PROJ-124',
						ticketKey: 'PROJ-124',
						ticketUrl: 'https://test.atlassian.net/browse/PROJ-124',
						createdAt: '2023-01-01T10:30:00.000Z'
					}
				},
				{
					id: 2,
					title: 'Subtask without ticket',
					description: 'A subtask that has no associated ticket',
					status: 'pending',
					dependencies: [1]
				}
			]
		},
		{
			id: 2,
			title: 'Task without ticket',
			description: 'A task that has no associated ticket',
			status: 'done',
			dependencies: [],
			priority: 'medium',
			details: 'This task was created before ticketing integration',
			testStrategy: 'Should work without ticket integration'
		}
	]
};

export const tasksWithGitHubTickets = {
	meta: {
		projectName: 'Test Project with GitHub',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Task with GitHub issue',
			description: 'A task that has an associated GitHub issue',
			status: 'in-progress',
			dependencies: [],
			priority: 'high',
			details: 'Implementation details for GitHub-linked task',
			testStrategy: 'Test with GitHub integration enabled',
			externalTicket: {
				system: 'github',
				ticketId: '456',
				ticketKey: '456',
				ticketUrl: 'https://github.com/owner/repo/issues/456',
				createdAt: '2023-01-01T11:00:00.000Z'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask with GitHub issue',
					description: 'A subtask with its own GitHub issue',
					status: 'done',
					dependencies: [],
					externalTicket: {
						system: 'github',
						ticketId: '457',
						ticketKey: '457',
						ticketUrl: 'https://github.com/owner/repo/issues/457',
						createdAt: '2023-01-01T11:30:00.000Z'
					}
				}
			]
		}
	]
};

export const tasksWithAzureTickets = {
	meta: {
		projectName: 'Test Project with Azure DevOps',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Task with Azure work item',
			description: 'A task that has an associated Azure DevOps work item',
			status: 'pending',
			dependencies: [],
			priority: 'medium',
			details: 'Implementation details for Azure-linked task',
			testStrategy: 'Test with Azure DevOps integration enabled',
			externalTicket: {
				system: 'azdevops',
				ticketId: '789',
				ticketKey: '789',
				ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/789',
				createdAt: '2023-01-01T12:00:00.000Z'
			}
		}
	]
};

// Tasks specifically for testing clear-subtasks integration
export const tasksWithSubtasksAndTickets = {
	meta: {
		projectName: 'Test Project for Clear Subtasks',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Parent task with subtasks to clear',
			description: 'This task has multiple subtasks that will be cleared',
			status: 'in-progress',
			dependencies: [],
			priority: 'high',
			details: 'Parent task details',
			testStrategy: 'Test clearing all subtasks',
			externalTicket: {
				system: 'jira',
				ticketId: 'PROJ-100',
				ticketKey: 'PROJ-100',
				ticketUrl: 'https://test.atlassian.net/browse/PROJ-100'
			},
			subtasks: [
				{
					id: 1,
					title: 'First subtask to clear',
					description: 'First subtask that will be cleared',
					status: 'pending',
					dependencies: [],
					externalTicket: {
						system: 'jira',
						ticketId: 'PROJ-101',
						ticketKey: 'PROJ-101',
						ticketUrl: 'https://test.atlassian.net/browse/PROJ-101'
					}
				},
				{
					id: 2,
					title: 'Second subtask to clear',
					description: 'Second subtask that will be cleared',
					status: 'in-progress',
					dependencies: [1],
					externalTicket: {
						system: 'jira',
						ticketId: 'PROJ-102',
						ticketKey: 'PROJ-102',
						ticketUrl: 'https://test.atlassian.net/browse/PROJ-102'
					}
				},
				{
					id: 3,
					title: 'Third subtask to clear',
					description: 'Third subtask that will be cleared',
					status: 'pending',
					dependencies: [],
					externalTicket: {
						system: 'jira',
						ticketId: 'PROJ-103',
						ticketKey: 'PROJ-103',
						ticketUrl: 'https://test.atlassian.net/browse/PROJ-103'
					}
				}
			]
		},
		{
			id: 2,
			title: 'Task without subtasks',
			description: 'This task has no subtasks',
			status: 'pending',
			dependencies: [],
			priority: 'medium',
			details: 'Single task without subtasks',
			testStrategy: 'Should handle tasks without subtasks gracefully'
		}
	]
};

// Tasks for testing remove-subtask integration
export const tasksForRemoveSubtaskTest = {
	meta: {
		projectName: 'Test Project for Remove Subtask',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Parent task for subtask removal',
			description: 'This task has subtasks that will be removed or converted',
			status: 'in-progress',
			dependencies: [],
			priority: 'high',
			details: 'Parent task details',
			testStrategy: 'Test removing and converting subtasks',
			externalTicket: {
				system: 'github',
				ticketId: '500',
				ticketKey: '500',
				ticketUrl: 'https://github.com/owner/repo/issues/500'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask to remove',
					description: 'This subtask will be removed',
					status: 'pending',
					dependencies: [],
					details: 'Subtask details for removal',
					externalTicket: {
						system: 'github',
						ticketId: '501',
						ticketKey: '501',
						ticketUrl: 'https://github.com/owner/repo/issues/501'
					}
				},
				{
					id: 2,
					title: 'Subtask to convert to task',
					description: 'This subtask will be converted to a standalone task',
					status: 'in-progress',
					dependencies: [1],
					details: 'Subtask details for conversion',
					externalTicket: {
						system: 'github',
						ticketId: '502',
						ticketKey: '502',
						ticketUrl: 'https://github.com/owner/repo/issues/502'
					}
				}
			]
		}
	]
};

// Tasks for testing content updates
export const tasksForContentUpdateTest = {
	meta: {
		projectName: 'Test Project for Content Updates',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Task for content update',
			description: 'This task will have its content updated',
			status: 'pending',
			dependencies: [],
			priority: 'high',
			details: 'Original task details',
			testStrategy: 'Test content synchronization',
			externalTicket: {
				system: 'azdevops',
				ticketId: '600',
				ticketKey: '600',
				ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/600'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask for content update',
					description: 'This subtask will have its content updated',
					status: 'pending',
					dependencies: [],
					details: 'Original subtask details',
					externalTicket: {
						system: 'azdevops',
						ticketId: '601',
						ticketKey: '601',
						ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/601'
					}
				}
			]
		},
		{
			id: 2,
			title: 'Another task for bulk update',
			description: 'This task will be part of a bulk content update',
			status: 'pending',
			dependencies: [1],
			priority: 'medium',
			details: 'Original task details for bulk update',
			testStrategy: 'Test bulk content synchronization',
			externalTicket: {
				system: 'azdevops',
				ticketId: '602',
				ticketKey: '602',
				ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/602'
			}
		}
	]
};

// Empty tasks for testing task creation
export const emptyTasksForCreationTest = {
	meta: {
		projectName: 'Empty Test Project',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: []
};

// Combined tasks object that includes all test fixtures
export const tasksWithTickets = {
	meta: {
		projectName: 'Test Project with Mixed Tickets',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		// From Jira fixture
		{
			id: 1,
			title: 'Task with Jira ticket',
			description: 'A task that has an associated Jira ticket',
			status: 'pending',
			dependencies: [],
			priority: 'high',
			details: 'Implementation details for Jira-linked task',
			testStrategy: 'Test with Jira integration enabled',
			externalTicket: {
				system: 'jira',
				ticketId: 'PROJ-123',
				ticketKey: 'PROJ-123',
				ticketUrl: 'https://test.atlassian.net/browse/PROJ-123',
				createdAt: '2023-01-01T10:00:00.000Z'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask with Jira ticket',
					description: 'A subtask with its own Jira ticket',
					status: 'pending',
					dependencies: [],
					externalTicket: {
						system: 'jira',
						ticketId: 'PROJ-124',
						ticketKey: 'PROJ-124',
						ticketUrl: 'https://test.atlassian.net/browse/PROJ-124',
						createdAt: '2023-01-01T10:30:00.000Z'
					}
				},
				{
					id: 2,
					title: 'Subtask without ticket',
					description: 'A subtask that has no associated ticket',
					status: 'pending',
					dependencies: [1]
				}
			]
		},
		// From GitHub fixture
		{
			id: 2,
			title: 'Task with GitHub issue',
			description: 'A task that has an associated GitHub issue',
			status: 'in-progress',
			dependencies: [],
			priority: 'high',
			details: 'Implementation details for GitHub-linked task',
			testStrategy: 'Test with GitHub integration enabled',
			externalTicket: {
				system: 'github',
				ticketId: '456',
				ticketKey: '456',
				ticketUrl: 'https://github.com/owner/repo/issues/456',
				createdAt: '2023-01-01T11:00:00.000Z'
			},
			subtasks: [
				{
					id: 1,
					title: 'Subtask with GitHub issue',
					description: 'A subtask with its own GitHub issue',
					status: 'done',
					dependencies: [],
					externalTicket: {
						system: 'github',
						ticketId: '457',
						ticketKey: '457',
						ticketUrl: 'https://github.com/owner/repo/issues/457',
						createdAt: '2023-01-01T11:30:00.000Z'
					}
				}
			]
		},
		// From Azure DevOps fixture
		{
			id: 3,
			title: 'Task with Azure work item',
			description: 'A task that has an associated Azure DevOps work item',
			status: 'pending',
			dependencies: [],
			priority: 'medium',
			details: 'Implementation details for Azure-linked task',
			testStrategy: 'Test with Azure DevOps integration enabled',
			externalTicket: {
				system: 'azdevops',
				ticketId: '789',
				ticketKey: '789',
				ticketUrl: 'https://dev.azure.com/org/project/_workitems/edit/789',
				createdAt: '2023-01-01T12:00:00.000Z'
			}
		}
	]
};

// Tasks for testing remove-task integration
export const tasksForRemoveTaskTest = {
	meta: {
		projectName: 'Test Project for Remove Task',
		projectVersion: '1.0.0',
		createdAt: '2023-01-01T00:00:00.000Z',
		updatedAt: '2023-01-01T00:00:00.000Z'
	},
	tasks: [
		{
			id: 1,
			title: 'Simple task to remove',
			description: 'This task will be removed in tests',
			status: 'pending',
			dependencies: [],
			priority: 'medium',
			details: 'Task details for removal',
			testStrategy: 'Test removing task with ticket',
			metadata: {
				jiraKey: 'TEST-101'
			},
			subtasks: []
		},
		{
			id: 2,
			title: 'Parent task with subtasks to remove',
			description: 'This task has subtasks that will be removed together',
			status: 'in-progress',
			dependencies: [],
			priority: 'high',
			details: 'Parent task details',
			testStrategy: 'Test removing task with subtasks',
			metadata: {
				jiraKey: 'TEST-102'
			},
			subtasks: [
				{
					id: 1,
					title: 'First subtask',
					description: 'This subtask will be removed with parent',
					status: 'pending',
					dependencies: [],
					details: 'Subtask details for removal',
					metadata: {
						jiraKey: 'TEST-103'
					}
				},
				{
					id: 2,
					title: 'Second subtask',
					description: 'This subtask will also be removed with parent',
					status: 'in-progress',
					dependencies: [],
					details: 'Second subtask details',
					metadata: {
						jiraKey: 'TEST-104'
					}
				}
			]
		}
	]
};
