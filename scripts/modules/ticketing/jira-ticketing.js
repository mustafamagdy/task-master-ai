/**
 * jira-ticketing.js
 * Jira implementation of the abstract ticketing system interface
 */

import TicketingSystemInterface from './ticketing-interface.js';
import { log } from '../utils.js';
import {
	getConfig,
	getJiraProjectKey,
	getJiraBaseUrl,
	getJiraEmail,
	getJiraApiToken
} from '../config-manager.js';
import {
	extractRefIdFromTitle,
	formatTitleForJira,
	getRefId
} from './reference-id-service.js';

// API version to use
const JIRA_API_VERSION = '2';

/**
 * Jira implementation of the ticketing system interface
 */
class JiraTicketing extends TicketingSystemInterface {
	/**
	 * Constructor
	 * @param {Object} config - Configuration object
	 */
	constructor(config) {
		super();
		this.config = config;
	}

	/**
	 * Check if Jira is properly configured
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {boolean} True if configured, false otherwise
	 */
	isConfigured(explicitRoot = null) {
		const jiraProjectKey = getJiraProjectKey(explicitRoot);
		const config = getConfig(explicitRoot);
		const jiraBaseUrl = config?.global?.jiraBaseUrl;
		const jiraEmail = config?.global?.jiraEmail;
		const jiraApiToken = config?.global?.jiraApiToken;

		return !!jiraProjectKey && !!jiraBaseUrl && !!jiraEmail && !!jiraApiToken;
	}

	/**
	 * Validate Jira configuration and log warnings if invalid
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object|null} Configuration object or null if invalid
	 */
	validateConfig(explicitRoot = null) {
		log('info', 'Validating Jira configuration...');
		const projectKey = getJiraProjectKey(explicitRoot);
		const baseUrl = getJiraBaseUrl(explicitRoot);
		const email = getJiraEmail(explicitRoot);
		const apiToken = getJiraApiToken(explicitRoot);

		log('info', `Jira configuration: projectKey=${projectKey || 'NOT SET'}, baseUrl=${baseUrl || 'NOT SET'}, email=${email || 'NOT SET'}, apiToken=${apiToken ? 'SET' : 'NOT SET'}`);

		// Check if all required fields are present
		if (!projectKey) {
			log('error', 'Jira project key is not configured. Please set jiraProjectKey in your .taskmasterconfig file.');
			return null;
		}

		if (!baseUrl) {
			log('error', 'Jira base URL is not configured. Please set jiraBaseUrl in your .taskmasterconfig file.');
			return null;
		}

		if (!email) {
			log('error', 'Jira email is not configured. Please set jiraEmail in your .taskmasterconfig file.');
			return null;
		}

		if (!apiToken) {
			log('error', 'Jira API token is not configured. Please set jiraApiToken in your .taskmasterconfig file.');
			return null;
		}

		// Check for placeholder values
		if (baseUrl.includes('{{') || baseUrl.includes('}}')) {
			log('error', 'Jira base URL contains placeholder values. Please update your .taskmasterconfig file.');
			return null;
		}

		if (email.includes('{{') || email.includes('}}')) {
			log('error', 'Jira email contains placeholder values. Please update your .taskmasterconfig file.');
			return null;
		}

		if (apiToken.includes('{{') || apiToken.includes('}}')) {
			log('error', 'Jira API token contains placeholder values. Please update your .taskmasterconfig file.');
			return null;
		}

		log('success', 'Jira configuration is valid!');
		return { projectKey, baseUrl, email, apiToken };
	}

	/**
	 * Get Jira configuration
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 */
	getConfig(explicitRoot = null) {
		const config = getConfig(explicitRoot);
		const projectKey = getJiraProjectKey(explicitRoot);
		const baseUrl = getJiraBaseUrl(explicitRoot);
		const email = getJiraEmail(explicitRoot);
		const apiToken = getJiraApiToken(explicitRoot);

		return { projectKey, baseUrl, email, apiToken };
	}

	/**
	 * Create a user story in Jira
	 * @param {Object} taskData - Task data
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created issue data
	 */
	async createStory(taskData, explicitRoot = null) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return null;

		const { projectKey, baseUrl, email, apiToken } = config;

		try {
			// For API version 2, use plain text description instead of ADF
			// Combine description and details with a separator if both exist
			const description = taskData.details
				? `${taskData.description}

${taskData.details}`
				: taskData.description;

			// Format title with reference ID for Jira if available
			const summary = this.formatTitleForTicket(taskData);
			
			// Build the fields object without priority first
			const fields = {
				project: {
					key: projectKey
				},
				summary,
				description,
				issuetype: {
					name: 'Story'
				}
			};
			
			// Only add priority if provided and needed
			try {
				fields.priority = {
					name: this.mapPriorityToTicket(taskData.priority || 'medium')
				};
			} catch (priorityError) {
				// Ignore priority field if it causes issues
				log('warn', `Skipping priority field for Jira story: ${priorityError.message}`);
			}

			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					},
					body: JSON.stringify({ fields })
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				// If the error is specifically about priority, retry without priority field
				if (errorText.includes('priority') && fields.priority) {
					log('warn', 'Priority field error detected. Retrying without priority field.');
					delete fields.priority;
					
					const retryResponse = await fetch(
						`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
							},
							body: JSON.stringify({ fields })
						}
					);
					
					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(`Jira API error: ${retryResponse.status} ${retryErrorText}`);
					}
					
					const data = await retryResponse.json();
					log('success', `Created Jira story ${data.key} for task ${taskData.id} without priority field`);
					return data;
				}
				
				throw new Error(`Jira API error: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			log('success', `Created Jira story ${data.key} for task ${taskData.id}`);
			return data;
		} catch (error) {
			log('error', `Error creating Jira story: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Create a subtask in Jira
	 * @param {Object} subtaskData - Subtask data
	 * @param {string} parentTicketId - Parent issue key in Jira
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created issue data
	 */
	async createTask(subtaskData, parentTicketId, explicitRoot = null) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return null;

		const { baseUrl, email, apiToken } = config;

		try {
			// Format title with reference ID for Jira if available
			const summary = this.formatTitleForTicket(subtaskData);

			// Combine description and details with a separator if both exist
			const description = subtaskData.details
				? `${subtaskData.description}

${subtaskData.details}`
				: subtaskData.description;

			// Build the fields object without priority first
			const fields = {
				parent: {
					key: parentTicketId
				},
				summary,
				description,
				issuetype: {
					name: 'Sub-task'
				}
			};
			
			// Only add priority if provided and needed
			try {
				fields.priority = {
					name: this.mapPriorityToTicket(subtaskData.priority || 'medium')
				};
			} catch (priorityError) {
				// Ignore priority field if it causes issues
				log('warn', `Skipping priority field for Jira subtask: ${priorityError.message}`);
			}

			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					},
					body: JSON.stringify({ fields })
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				// If the error is specifically about priority, retry without priority field
				if (errorText.includes('priority') && fields.priority) {
					log('warn', 'Priority field error detected. Retrying without priority field.');
					delete fields.priority;
					
					const retryResponse = await fetch(
						`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
							},
							body: JSON.stringify({ fields })
						}
					);
					
					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(`Jira API error: ${retryResponse.status} ${retryErrorText}`);
					}
					
					const data = await retryResponse.json();
					log('success', `Created Jira subtask ${data.key} for task ${subtaskData.id} without priority field`);
					return data;
				}
				
				throw new Error(`Jira API error: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			log(
				'success',
				`Created Jira subtask ${data.key} for task ${subtaskData.id}`
			);
			return data;
		} catch (error) {
			log('error', `Error creating Jira subtask: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Find a Jira issue key by reference ID
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Issue key if found, null otherwise
	 */
	async findTicketByRefId(refId, explicitRoot = null) {
		console.log(`===== DEBUG: findTicketByRefId called with refId: ${refId} =====`);

		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		
		if (!config) {
			console.log(`===== DEBUG: Config validation failed in findTicketByRefId =====`);
			return null;
		}
		if (!refId) {
			console.log(`===== DEBUG: No refId provided to findTicketByRefId =====`);
			return null;
		}

		console.log(`===== DEBUG: findTicketByRefId config validated, searching for ticket =====`);
		const { projectKey, baseUrl, email, apiToken } = config;

		try {
			// Search for issues with the reference ID in the title
			const jql = `project = ${projectKey} AND summary ~ "${refId}" ORDER BY created DESC`;
			console.log(`===== DEBUG: Searching with JQL: ${jql} =====`);
			
			// FOR DEBUG ONLY: Force this method to return null to test ticket creation
			console.log(`===== DEBUG: FORCING null return to test ticket creation =====`);
			return null;

			// const response = await fetch(
			// 	`${baseUrl}/rest/api/${JIRA_API_VERSION}/search?jql=${encodeURIComponent(jql)}`,
			// 	{
			// 		method: 'GET',
			// 		headers: {
			// 			'Content-Type': 'application/json',
			// 			Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
			// 		}
			// 	}
			// );

			// if (!response.ok) {
			// 	const errorText = await response.text();
			// 	throw new Error(`Jira API error: ${response.status} ${errorText}`);
			// }

			// const data = await response.json();
			// if (data.issues && data.issues.length > 0) {
			// 	return data.issues[0].key;
			// }
			// return null;
		} catch (error) {
			log(
				'error',
				`Error finding Jira issue by reference ID: ${error.message}`
			);
			return null;
		}
	}

	/**
	 * Check if a Jira issue exists
	 * @param {string} ticketId - Issue key in Jira
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the issue exists, false otherwise
	 */
	async ticketExists(ticketId, explicitRoot = null) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return false;
		if (!ticketId) return false;

		const { baseUrl, email, apiToken } = config;

		try {
			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${ticketId}`,
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					}
				}
			);

			return response.ok;
		} catch (error) {
			log('error', `Error checking if Jira issue exists: ${error.message}`);
			return false;
		}
	}

	/**
	 * Create a link between two Jira issues
	 * @param {string} fromTicketId - From issue key in Jira
	 * @param {string} toTicketId - To issue key in Jira
	 * @param {string} linkType - Link type (e.g., 'Blocks', 'Relates to')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async createTicketLink(
		fromTicketId,
		toTicketId,
		linkType,
		explicitRoot = null
	) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return false;
		if (!fromTicketId || !toTicketId || !linkType) return false;

		const { baseUrl, email, apiToken } = config;

		try {
			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issueLink`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					},
					body: JSON.stringify({
						type: {
							name: linkType
						},
						inwardIssue: {
							key: fromTicketId
						},
						outwardIssue: {
							key: toTicketId
						}
					})
				}
			);

			return response.ok;
		} catch (error) {
			log('error', `Error creating Jira issue link: ${error.message}`);
			return false;
		}
	}

	/**
	 * Update issue status in Jira
	 * @param {string} ticketId - Issue key in Jira
	 * @param {string} status - New status
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @param {Object} taskData - Task data for creating the issue if it doesn't exist
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async updateTicketStatus(
		ticketId,
		status,
		explicitRoot = null,
		taskData = null
	) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return false;
		if (!ticketId || !status) return false;

		const { baseUrl, email, apiToken } = config;
		const jiraStatus = this.mapStatusToTicket(status);

		try {
			// Check if the issue exists
			const exists = await this.ticketExists(ticketId, explicitRoot);
			if (!exists) {
				if (taskData) {
					// Try to create the issue if we have task data
					log(
						'info',
						`Issue ${ticketId} not found. Attempting to create it...`
					);
					if (taskData.parentId || taskData.parentJiraKey) {
						const parentKey = taskData.parentJiraKey;
						if (parentKey) {
							const result = await this.createTask(
								taskData,
								parentKey,
								explicitRoot
							);
							return !!result;
						}
					} else {
						const result = await this.createStory(taskData, explicitRoot);
						return !!result;
					}
				}
				log('warn', `Issue ${ticketId} not found and could not be created.`);
				return false;
			}

			// Get transitions for the issue
			const transResponse = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${ticketId}/transitions`,
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					}
				}
			);

			if (!transResponse.ok) {
				log('error', `Error getting transitions for issue ${ticketId}`);
				return false;
			}

			const transData = await transResponse.json();
			const transition = transData.transitions.find(
				(t) =>
					t.name.toLowerCase() === jiraStatus.toLowerCase() ||
					t.to.name.toLowerCase() === jiraStatus.toLowerCase()
			);

			if (!transition) {
				log(
					'warn',
					`Transition to status ${jiraStatus} not found for issue ${ticketId}`
				);
				return false;
			}

			// Perform the transition
			const updateResponse = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${ticketId}/transitions`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
					},
					body: JSON.stringify({
						transition: {
							id: transition.id
						}
					})
				}
			);

			return updateResponse.ok;
		} catch (error) {
			log('error', `Error updating Jira issue status: ${error.message}`);
			return false;
		}
	}

	/**
	 * Store Jira key in task metadata
	 * @param {Object} task - Task object
	 * @param {string} ticketId - Jira issue key
	 * @returns {Object} Updated task object
	 */
	storeTicketId(task, ticketId) {
		const newTask = { ...task };
		if (!newTask.metadata) newTask.metadata = {};
		newTask.metadata.jiraKey = ticketId;
		return newTask;
	}

	/**
	 * Get Jira key from task metadata
	 * @param {Object} task - Task object
	 * @returns {string|null} Jira issue key or null if not found
	 */
	getTicketId(task) {
		return task?.metadata?.jiraKey || null;
	}

	/**
	 * Format a task title for Jira
	 * @param {Object} task - Task object
	 * @returns {string} Formatted title
	 */
	formatTitleForTicket(task) {
		const refId = getRefId(task);
		return refId ? `${refId}-${task.title}` : task.title;
	}

	/**
	 * Map TaskMaster priority to Jira priority
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string} Jira priority
	 */
	mapPriorityToTicket(priority) {
		switch (priority?.toLowerCase()) {
			case 'high':
				return 'High';
			case 'medium':
				return 'Medium';
			case 'low':
				return 'Low';
			default:
				return 'Medium'; // Default to medium priority
		}
	}

	/**
	 * Map TaskMaster status to Jira status
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} Jira status
	 */
	mapStatusToTicket(status) {
		switch (status?.toLowerCase()) {
			case 'pending':
				return 'To Do';
			case 'in-progress':
				return 'In Progress';
			case 'review':
				return 'In Review';
			case 'done':
				return 'Done';
			case 'cancelled':
				return 'Cancelled';
			case 'deferred':
				return 'Backlog';
			default:
				return 'To Do';
		}
	}
}

export default JiraTicketing;
