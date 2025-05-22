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
import {
	getIssueTypeMapping,
	getFieldMapping,
	shouldIgnoreField,
	getRelationshipMapping,
	initializeDefaultMappings
} from './mapping-manager.js';

// API version to use consistently across all endpoints
const JIRA_API_VERSION = '3';

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

		const projectKey = getJiraProjectKey(explicitRoot);
		const baseUrl = getJiraBaseUrl(explicitRoot);
		const email = getJiraEmail(explicitRoot);
		const apiToken = getJiraApiToken(explicitRoot);



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


		return { projectKey, baseUrl, email, apiToken };
	}

	/**
	 * Get Jira configuration
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 */
	getConfig(explicitRoot = null) {
		// Use validateConfig since it already pulls all these values
		return this.validateConfig(explicitRoot);
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
			
			// Get the issue type based on the mapping
			const issueType = getIssueTypeMapping('task');
		
			// Build the fields object without priority first
			const fields = {
				project: {
					key: projectKey
				},
				summary,
				description,
				issuetype: {
					name: issueType
				}
			};
			
			// Only add priority if provided, needed, and not disabled in mapping
			try {
				const priorityValue = this.mapPriorityToTicket(taskData.priority || 'medium');
				
				// Only add if priority mapping returned a value (not null/disabled)
				if (priorityValue) {
					fields.priority = {
						name: priorityValue
					};
				}
			} catch (priorityError) {
				// Ignore priority field if it causes issues

			}

			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
				{
					method: 'POST',
					headers: this._getAuthHeaders(email, apiToken),
					body: JSON.stringify({ fields })
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				// If the error is specifically about priority, retry without priority field
				if (errorText.includes('priority') && fields.priority) {

					delete fields.priority;
					
					const retryResponse = await fetch(
						`${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
						{
							method: 'POST',
							headers: this._getAuthHeaders(email, apiToken),
							body: JSON.stringify({ fields })
						}
					);
					
					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(`Jira API error: ${retryResponse.status} ${retryErrorText}`);
					}
					
					const data = await retryResponse.json();
	
					return data;
				}
				
				throw new Error(`Jira API error: ${response.status} ${errorText}`);
			}

			try {
				const data = await response.json();

				return data;
			} catch (jsonError) {
				log('error', `JSON parse error: ${jsonError.message}`);
				throw jsonError; // Re-throw the original error
			}
		} catch (error) {
			log('error', `Error creating Jira story: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Map TaskMaster priority to Jira priority
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string} Jira priority
	 */
	mapPriorityToTicket(priority) {
		const mappedField = getFieldMapping('priority', priority.toLowerCase());
		
		// If the field is disabled, return null to exclude it
		if (!mappedField.enabled) {
			return null;
		}
		
		return mappedField.value;
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
	 * Map TaskMaster status to Jira status
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} Jira status
	 */
	mapStatusToTicket(status) {
		const mappedField = getFieldMapping('status', status.toLowerCase());
		
		// If the field is disabled, return default status
		if (!mappedField.enabled) {
			return 'To Do';
		}
		
		return mappedField.value;
	}

	/**
	 * Get all tickets from Jira for the configured project
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Array>} Array of Jira tickets
	 */
	async getAllTickets(explicitRoot = null) {
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return [];

		const { projectKey, baseUrl, email, apiToken } = config;

		try {
			// JQL query to get all issues for the project
			const jql = `project = ${projectKey} ORDER BY created DESC`;

			
			// Make the API request
			const response = await fetch(
				`${baseUrl}/rest/api/${JIRA_API_VERSION}/search?jql=${encodeURIComponent(jql)}&maxResults=100`,
				{
					method: 'GET',
					headers: this._getAuthHeaders(email, apiToken)
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Jira API error: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			
			// Process the results
			if (data.issues && Array.isArray(data.issues)) {

				return data.issues.map(issue => ({
					id: issue.id,
					key: issue.key,
					summary: issue.fields.summary,
					description: issue.fields.description || '',
					status: issue.fields.status?.name || 'To Do',
					priority: issue.fields.priority?.name || 'Medium',
					isSubtask: issue.fields.issuetype?.subtask || false,
					parentKey: issue.fields.parent?.key, // Will be set for subtasks
					created: issue.fields.created,
					updated: issue.fields.updated
				}));
			}
			
			return [];
		} catch (error) {
			log('error', `Error fetching tickets from Jira: ${error.message}`);
			return [];
		}
	}

	/**
	 * Get current status of a Jira ticket
	 * @param {string} ticketId - The Jira ticket ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} - The status of the ticket or null if it couldn't be fetched
	 */
	async getTicketStatus(ticketId, explicitRoot = null) {
		if (!ticketId) return null;
		
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return null;
		
		const { baseUrl, email, apiToken } = config;
		const url = `${baseUrl}/rest/api/3/issue/${ticketId}`;
		
		try {

			
			const response = await fetch(url, {
				method: 'GET',
				headers: this._getAuthHeaders(email, apiToken)
			});
			
			if (!response.ok) {
				log('error', `Failed to fetch ticket status: ${response.status} ${response.statusText}`);
				return null;
			}
			
			const data = await response.json();
			if (data && data.fields && data.fields.status && data.fields.status.name) {
				return data.fields.status.name;
			}
			
			return null;
		} catch (error) {
			log('error', `Error fetching ticket status: ${error.message}`);
			return null;
		}
	}
	
	/**
	 * Map Jira status to TaskMaster status
	 * @param {string} jiraStatus - Jira status
	 * @returns {string} TaskMaster status
	 */
	mapTicketStatusToTaskmaster(jiraStatus) {
		if (!jiraStatus) return 'pending';
		
		// Create a reverse mapping by loading the current mapping
		const statusMapping = getFieldMapping('status', '').mapping || {};
		const reverseMapping = {};
		
		// Build a reverse lookup map
		Object.entries(statusMapping).forEach(([taskmasterStatus, jiraStatusValue]) => {
			reverseMapping[jiraStatusValue.toLowerCase()] = taskmasterStatus;
		});
		
		// Look up the TaskMaster status from the Jira status
		const taskmasterStatus = reverseMapping[jiraStatus.toLowerCase()];
		
		// If found, return it; otherwise use a default mapping
		if (taskmasterStatus) {
			return taskmasterStatus;
		}
		
		// Fallback to default mapping if not found in configuration
		switch (jiraStatus.toLowerCase()) {
			case 'to do':
			case 'open':
			case 'backlog':
				return 'pending';
			case 'in progress':
				return 'in-progress';
			case 'in review':
				return 'review';
			case 'done':
				return 'done';
			case 'cancelled':
				return 'cancelled';
			default:
				return 'pending';
		}
	}

	/**
	 * Map Jira priority to TaskMaster priority
	 * @param {string} jiraPriority - Jira priority
	 * @returns {string} TaskMaster priority
	 */
	mapTicketPriorityToTaskmaster(jiraPriority) {
		if (!jiraPriority) return 'medium';
		
		// Create a reverse mapping by loading the current mapping
		const priorityMapping = getFieldMapping('priority', '').mapping || {};
		const reverseMapping = {};
		
		// Build a reverse lookup map
		Object.entries(priorityMapping).forEach(([taskmasterPriority, jiraPriorityValue]) => {
			reverseMapping[jiraPriorityValue.toLowerCase()] = taskmasterPriority;
		});
		
		// Look up the TaskMaster priority from the Jira priority
		const taskmasterPriority = reverseMapping[jiraPriority.toLowerCase()];
		
		// If found, return it; otherwise use a default mapping
		if (taskmasterPriority) {
			return taskmasterPriority;
		}
		
		// Fallback to default mapping if not found in configuration
		switch (jiraPriority.toLowerCase()) {
			case 'highest':
			case 'high':
				return 'high';
			case 'medium':
				return 'medium';
			case 'low':
			case 'lowest':
				return 'low';
			default:
				return 'medium';
		}
	}



	/**
	 * Check if a ticket exists in the Jira system
	 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the ticket exists, false otherwise
	 */
	async ticketExists(ticketId, explicitRoot = null) {
		if (!ticketId) return false;
		
		// Validate configuration
		const config = this.validateConfig(explicitRoot);
		if (!config) return false;
		
		const { baseUrl, email, apiToken } = config;
		
		try {
			// Use the issue API to check if the ticket exists
			const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketId)}`;
			
			const response = await fetch(url, {
				method: 'GET',
				headers: this._getAuthHeaders(email, apiToken)
			});
			
			// If we get a 200 OK response, the ticket exists
			if (response.ok) {
				return true;
			}
			
			// If we get a 404 Not Found, the ticket doesn't exist
			if (response.status === 404) {
				return false;
			}
			
			// For other errors, log them but assume the ticket doesn't exist for safety
			log('error', `Error checking if ticket exists: ${response.status} ${response.statusText}`);
			return false;
		} catch (error) {
			log('error', `Error checking if ticket exists: ${error.message}`);
			return false;
		}
	}
	/**
	 * Helper method to create auth headers for Jira API requests
	 * @param {string} email - Jira email
	 * @param {string} apiToken - Jira API token
	 * @returns {Object} Headers object with Authorization and Content-Type
	 * @private
	 */
	_getAuthHeaders(email, apiToken) {
		return {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
		};
	}
}

export default JiraTicketing;
