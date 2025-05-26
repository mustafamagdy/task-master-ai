/**
 * github-projects-ticketing.js
 * GitHub Projects implementation of the abstract ticketing system interface
 * NOTE: This is a placeholder implementation with stubs for future development
 */

import TicketingSystemInterface from '../ticketing-interface.js';
import { log } from '../../utils.js';
import {
	getGitHubToken,
	getGitHubOwner,
	getGitHubRepository,
	getGitHubProjectNumber
} from '../../config-manager.js';

/**
 * GitHub Projects implementation of the ticketing system interface
 * @implements {TicketingSystemInterface}
 */
import https from 'https'; // For making API calls

class GitHubProjectsTicketing extends TicketingSystemInterface {
	/**
	 * Constructor
	 * @param {Object} config - Configuration object provided by getTicketingSystem
	 */
	constructor(config) {
		super();
		// this.config stores the initial configuration (e.g., from project-level .taskmasterrc)
		// Specific calls can override this with `explicitRoot` to getConfig on the fly.
		this.config = config; 
		// log('info', 'GitHubProjectsTicketing initialized.'); // Keep logs minimal unless debugging
	}

	/**
	 * Helper function to make requests to GitHub API
	 * @param {string} method - HTTP method (GET, POST, PATCH, etc.)
	 * @param {string} path - API path (e.g., /repos/owner/repo/issues)
	 * @param {Object|null} requestBody - Data to send in the request body (for POST, PATCH)
	 * @param {string|null} explicitRoot - Optional explicit path to the project root to re-fetch config
	 * @returns {Promise<Object>} Parsed JSON response
	 * @private
	 */
	async _request(method, path, requestBody = null, explicitRoot = null) {
		// Use specific config for this request if explicitRoot is provided, otherwise use constructor-injected config
		const currentConfig = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		const { token } = currentConfig;

		if (!token) {
			log('error', 'GitHub token is missing. Cannot make API request.');
			throw new Error('GitHub token is missing.');
		}
		
		const hostname = path.startsWith('https://') ? new URL(path).hostname : 'api.github.com';
		const apiPath = path.startsWith('https://') ? new URL(path).pathname + new URL(path).search : path;

		const options = {
			hostname: hostname,
			path: apiPath,
			method: method,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github.v3+json',
				'User-Agent': 'TaskMaster-App', // GitHub requires User-Agent
				'X-GitHub-Api-Version': '2022-11-28'
			}
		};

		if (requestBody && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
			options.headers['Content-Type'] = 'application/json';
		}

		return new Promise((resolve, reject) => {
			const req = https.request(options, (res) => {
				let responseData = '';
				res.on('data', (chunk) => {
					responseData += chunk;
				});
				res.on('end', () => {
					try {
						const parsedResponse = responseData ? JSON.parse(responseData) : {};
						if (res.statusCode >= 200 && res.statusCode < 300) {
							resolve(parsedResponse);
						} else {
							const message = parsedResponse.message || 
										  (parsedResponse.errors && parsedResponse.errors.map(e => e.message).join(', ')) || 
										  responseData;
							const error = new Error(
								`GitHub API Error: ${res.statusCode} ${res.statusMessage} - ${message}`
							);
							error.statusCode = res.statusCode;
							error.responseBody = parsedResponse;
							reject(error);
						}
					} catch (e) {
						reject(new Error(`Failed to parse GitHub API response: ${e.message}. Response: ${responseData}`));
					}
				});
			});

			req.on('error', (e) => {
				reject(new Error(`GitHub API request failed: ${e.message}`));
			});

			if (requestBody && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
				req.write(JSON.stringify(requestBody));
			}
			req.end();
		});
	}
	
	/**
	 * Check if GitHub Projects is properly configured.
	 * Uses config passed at instantiation or re-fetches if explicitRoot is given.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {boolean} True if configured, false otherwise
	 */
	isConfigured(explicitRoot = null) {
		const config = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		// Repository is essential for issue management. Project number is optional.
		return !!config.token && !!config.owner && !!config.repository;
	}

	/**
	 * Validate GitHub Projects configuration and log warnings if invalid.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object|null} Configuration object or null if invalid
	 */
	validateConfig(explicitRoot = null) {
		const currentConfig = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		if (!this.isConfigured(explicitRoot)) { // Pass explicitRoot to isConfigured
			log('warn', 'GitHub Projects is not properly configured. Missing token, owner, or repository.');
			return null;
		}
		return currentConfig;
	}

	/**
	 * Get GitHub Projects configuration.
	 * This method now directly uses the config-manager functions.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 */
	getConfig(explicitRoot = null) {
		// Always fetch fresh config from config-manager when this is called.
		// This is important if explicitRoot is used or if config might change.
		return {
			token: getGitHubToken(explicitRoot),
			owner: getGitHubOwner(explicitRoot),
			repository: getGitHubRepository(explicitRoot),
			projectNumber: getGitHubProjectNumber(explicitRoot)
		};
	}

	/**
	 * Create an issue in GitHub. (Placeholder for full implementation)
	 * @param {Object} taskData - Task data
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object|null>} Created issue data or null
	 */
	async createStory(taskData, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			throw new Error('[GitHub] Configuration is invalid. Cannot create story.');
		}
		const { owner, repository, projectNumber } = config;

		const title = this.formatTitleForTicket(taskData);
		let body = `**Description:**\n${taskData.description || 'No description provided.'}\n\n`;
		if (taskData.details) {
			body += `**Details:**\n${taskData.details}\n\n`;
		}
		if (taskData.metadata?.refId && !title.includes(`[${taskData.metadata.refId}]`)) {
			body += `Reference ID: ${taskData.metadata.refId}\n`;
		}
		body += `\n\n---\nPowered by TaskMaster`;

		const priorityLabel = this.mapPriorityToTicket(taskData.priority);
		const labels = [priorityLabel, 'story'].filter(Boolean); // filter(Boolean) removes null/undefined

		const issuePayload = { title, body, labels };

		try {
			const issue = await this._request('POST', `/repos/${owner}/${repository}/issues`, issuePayload, explicitRoot);
			log('info', `[GitHub] Issue #${issue.number} created for task ${taskData.id}. URL: ${issue.html_url}`);

			if (projectNumber && issue.node_id) {
				// Placeholder for adding to project - requires GraphQL
				log('info', `[GitHub] Project number ${projectNumber} configured. GraphQL call needed to add issue ${issue.node_id} to project.`);
				// await this.addIssueToProjectGraphQL(issue.node_id, projectNumber, explicitRoot);
			}
			
			return { 
				id: issue.number.toString(), 
				key: issue.number.toString(), // GitHub issues use number as key
				url: issue.html_url,
				rawResponse: issue // Include raw response for potential GraphQL node_id
			};
		} catch (error) {
			log('error', `[GitHub] Failed to create issue for task ${taskData.id}: ${error.message}`);
			throw error; // Re-throw to allow sync-tickets to handle it
		}
	}

	/**
	 * Create a task in GitHub Projects.
	 * @param {Object} subtaskData - Subtask data
	 * @param {string} parentTicketId - Parent issue ID (number as string)
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object|null>} Created issue data or null
	 */
	async createTask(subtaskData, parentTicketId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			throw new Error('[GitHub] Configuration is invalid. Cannot create subtask.');
		}
		const { owner, repository, projectNumber } = config;

		const title = this.formatTitleForTicket(subtaskData);
		let body = `**Description:**\n${subtaskData.description || 'No description provided.'}\n\n`;
		if (subtaskData.details) {
			body += `**Details:**\n${subtaskData.details}\n\n`;
		}
		if (subtaskData.metadata?.refId && !title.includes(`[${subtaskData.metadata.refId}]`)) {
			body += `Reference ID: ${subtaskData.metadata.refId}\n`;
		}
		// Link to parent task
		body += `\nParent issue: #${parentTicketId}`;
		body += `\n\n---\nPowered by TaskMaster`;
		
		const priorityLabel = this.mapPriorityToTicket(subtaskData.priority || 'medium'); // Default priority for subtasks
		const labels = [priorityLabel, 'subtask'].filter(Boolean);

		const issuePayload = { title, body, labels };

		try {
			const issue = await this._request('POST', `/repos/${owner}/${repository}/issues`, issuePayload, explicitRoot);
			log('info', `[GitHub] Issue #${issue.number} (subtask) created for task ${subtaskData.id}, parent #${parentTicketId}. URL: ${issue.html_url}`);

			if (projectNumber && issue.node_id) {
				// Placeholder for adding to project - requires GraphQL
				log('info', `[GitHub] Project number ${projectNumber} configured. GraphQL call needed to add issue ${issue.node_id} to project.`);
				// await this.addIssueToProjectGraphQL(issue.node_id, projectNumber, explicitRoot);
			}

			return { 
				id: issue.number.toString(), 
				key: issue.number.toString(),
				url: issue.html_url,
				rawResponse: issue
			};
		} catch (error) {
			log('error', `[GitHub] Failed to create subtask issue for task ${subtaskData.id}: ${error.message}`);
			throw error;
		}
	}
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Issue ID if found, null otherwise
	 */
	async findTicketByRefId(refId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[GitHub] Configuration is invalid. Cannot find ticket by refId.');
			return null;
		}
		const { owner, repository } = config;

		if (!refId) {
			log('warn', '[GitHub] findTicketByRefId called with no refId.');
			return null;
		}

		// Construct query: search for refId in title or body, within the specified repo, only issues.
		// Using quotes around refId for exact match.
		const searchQuery = `"${refId}" repo:${owner}/${repository} is:issue in:title,body`;
		const encodedQuery = encodeURIComponent(searchQuery);

		try {
			const results = await this._request('GET', `/search/issues?q=${encodedQuery}&sort=created&order=desc`, null, explicitRoot);
			if (results.items && results.items.length > 0) {
				// Assuming the first item is the most relevant.
				// Could add more checks here if needed (e.g. ensure refId is truly in body/title if search is broad)
				const issue = results.items[0];
				log('info', `[GitHub] Found issue #${issue.number} for refId "${refId}" in ${owner}/${repository}. URL: ${issue.html_url}`);
				return issue.number.toString();
			}
			log('info', `[GitHub] No issue found for refId "${refId}" in ${owner}/${repository}.`);
			return null;
		} catch (error) {
			log('error', `[GitHub] Error searching for issue by refId "${refId}": ${error.message}`);
			return null; // As per contract, return null on error
		}
	}

	/**
	 * Check if an issue exists. (Placeholder for full implementation)
	 * @param {string} ticketId - Issue ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the issue exists, false otherwise
	 */
	async ticketExists(ticketId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			// If config is invalid, we can't determine if it exists.
			// Depending on desired strictness, could throw error or return false.
			log('warn', '[GitHub] Configuration is invalid. Cannot check if ticket exists.');
			return false; 
		}
		const { owner, repository } = config;

		if (!ticketId || ticketId === 'null' || ticketId === 'undefined') {
			log('warn', `[GitHub] ticketExists called with invalid ticketId: ${ticketId}.`);
			return false;
		}

		try {
			await this._request('GET', `/repos/${owner}/${repository}/issues/${ticketId}`, null, explicitRoot);
			log('info', `[GitHub] Issue #${ticketId} exists in ${owner}/${repository}.`);
			return true;
		} catch (error) {
			if (error.statusCode === 404 || error.statusCode === 410) { // 410 Gone
				log('info', `[GitHub] Issue #${ticketId} does not exist in ${owner}/${repository} (status: ${error.statusCode}).`);
				return false;
			}
			// For other errors (auth, rate limit, etc.), log and return false as "existence" is unknown/unconfirmed.
			log('error', `[GitHub] Error checking existence of issue #${ticketId} in ${owner}/${repository}: ${error.message}`);
			return false; 
		}
	}

	/**
	 * Create a link between two issues. (Placeholder for full implementation)
	 * @param {string} fromTicketId - From issue ID
	 * @param {string} toTicketId - To issue ID
	 * @param {string} linkType - Link type
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async createTicketLink(
		fromTicketId,
		toTicketId,
		linkType, // e.g., "Blocks", "Related to", "Depends on"
		explicitRoot = null
	) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[GitHub] Configuration is invalid. Cannot create ticket link.');
			return false;
		}
		const { owner, repository } = config;

		if (!fromTicketId || !toTicketId) {
			log('warn', '[GitHub] createTicketLink called with missing fromTicketId or toTicketId.');
			return false;
		}

		// Sanitize linkType for comment, or use a predefined mapping.
		// Basic sanitization for linkType to avoid injecting unintended markdown control characters.
		const sanitizedLinkType = linkType ? linkType.replace(/[*_`[\]()#+-.!]/g, '') : 'Related to';
		const commentBody = `${sanitizedLinkType} #${toTicketId}\n\n---\nLink created by TaskMaster`;

		try {
			await this._request('POST', `/repos/${owner}/${repository}/issues/${fromTicketId}/comments`, { body: commentBody }, explicitRoot);
			log('info', `[GitHub] Comment link created on issue #${fromTicketId} to #${toTicketId} (type: ${linkType}).`);
			return true;
		} catch (error) {
			log('error', `[GitHub] Failed to create comment link on issue #${fromTicketId} to #${toTicketId}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Update issue status. (Placeholder for full implementation)
	 * @param {string} ticketId - Issue ID
	 * @param {string} status - New status
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @param {Object} taskData - Task data for creating the issue if it doesn't exist
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async updateTicketStatus(
		ticketId,
		status, // TaskMaster status
		explicitRoot = null,
		taskData = null // Full task data from TaskMaster, useful for context
	) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[GitHub] Configuration is invalid. Cannot update ticket status.');
			return false;
		}
		const { owner, repository } = config;

		if (!ticketId) {
			log('warn', '[GitHub] updateTicketStatus called with no ticketId.');
			return false;
		}

		const ghStatusRepresentation = this.mapStatusToTicket(status); // e.g., 'Todo', 'In Progress', 'Closed'
		const updatePayload = {};
		let currentLabels = [];

		// Fetch the current issue to get its labels
		try {
			const currentIssue = await this._request('GET', `/repos/${owner}/${repository}/issues/${ticketId}`, null, explicitRoot);
			currentLabels = currentIssue.labels.map(label => label.name);
		} catch (error) {
			log('error', `[GitHub] Failed to fetch issue #${ticketId} before updating status: ${error.message}`);
			return false; // Cannot reliably update labels without knowing current ones
		}

		// Define labels that represent statuses to manage them exclusively
		const statusLabels = ['Todo', 'In Progress', 'In Review', 'Done'];
		
		// Filter out existing status labels
		let newLabels = currentLabels.filter(label => !statusLabels.includes(label));

		if (ghStatusRepresentation === 'Closed') {
			updatePayload.state = 'closed';
			// Optionally, if you want a specific label like "Cancelled" when closed via 'cancelled' status:
			if (status.toLowerCase() === 'cancelled') {
				// newLabels.push('Cancelled'); // Or some other label indicating why it's closed
			}
		} else {
			updatePayload.state = 'open'; // Ensure issue is open for active statuses
			if (statusLabels.includes(ghStatusRepresentation)) {
				newLabels.push(ghStatusRepresentation); // Add the new status label
			}
		}

		// Manage priority label: remove old, add new from taskData or keep existing
		const priorityPrefix = "priority:";
		newLabels = newLabels.filter(label => !label.startsWith(priorityPrefix)); // Remove existing priority label
		
		let priorityToApply = null;
		if (taskData?.priority) {
			priorityToApply = this.mapPriorityToTicket(taskData.priority);
		} else {
			// If no priority in taskData, try to find and keep the existing one
			const existingPriorityLabel = currentLabels.find(label => label.startsWith(priorityPrefix));
			if (existingPriorityLabel) priorityToApply = existingPriorityLabel;
		}
		if (priorityToApply) newLabels.push(priorityToApply);
		
		updatePayload.labels = [...new Set(newLabels)]; // Ensure unique labels

		try {
			await this._request('PATCH', `/repos/${owner}/${repository}/issues/${ticketId}`, updatePayload, explicitRoot);
			log('info', `[GitHub] Issue #${ticketId} status updated to: ${status} (GitHub state: ${updatePayload.state || 'open'}, labels: ${updatePayload.labels.join(', ')}).`);
			
			// TODO: GraphQL call if project columns need updating based on status
			// if (config.projectNumber && taskData) {
			//    const projectStatusFieldId = "YOUR_PROJECT_STATUS_FIELD_ID"; // This needs to be known/configured
			//    const projectStatusOptionId = mapStatusToProjectColumnOptionId(status); // Mapping needed
			//    if (projectStatusOptionId) {
			//        // await updateProjectItemField(issueNodeId, projectStatusFieldId, projectStatusOptionId);
			//    }
			// }
			return true;
		} catch (error) {
			log('error', `[GitHub] Failed to update status for issue #${ticketId}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Update issue details (title, body, priority). (Placeholder for full implementation)
	 * @param {string} ticketId - Issue ID
	 * @param {Object} taskData - Task data with new details
	 * @param {Object} previousTaskData - Previous task data (optional, for comparison)
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful
	 */
	async updateTicketDetails(ticketId, taskData, previousTaskData = null, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[GitHub] Configuration is invalid. Cannot update ticket details.');
			return false;
		}
		const { owner, repository } = config;

		if (!ticketId || !taskData) {
			log('warn', '[GitHub] updateTicketDetails called with missing ticketId or taskData.');
			return false;
		}

		const updatePayload = {};

		// Update title
		updatePayload.title = this.formatTitleForTicket(taskData);

		// Update body
		let body = `**Description:**\n${taskData.description || 'No description provided.'}\n\n`;
		if (taskData.details) {
			body += `**Details:**\n${taskData.details}\n\n`;
		}
		if (taskData.metadata?.refId && !updatePayload.title.includes(`[${taskData.metadata.refId}]`)) {
			body += `Reference ID: ${taskData.metadata.refId}\n`;
		}
		body += `\n\n---\nUpdated by TaskMaster`;
		updatePayload.body = body;

		// Manage labels: specifically priority. Other labels (like status) are managed by updateTicketStatus.
		try {
			const currentIssue = await this._request('GET', `/repos/${owner}/${repository}/issues/${ticketId}`, null, explicitRoot);
			let currentLabels = currentIssue.labels.map(label => label.name);

			const priorityPrefix = "priority:";
			currentLabels = currentLabels.filter(label => !label.startsWith(priorityPrefix)); // Remove existing priority

			const newPriorityLabel = this.mapPriorityToTicket(taskData.priority);
			if (newPriorityLabel) {
				currentLabels.push(newPriorityLabel);
			}
			updatePayload.labels = [...new Set(currentLabels)]; // Ensure unique and include other existing labels

			await this._request('PATCH', `/repos/${owner}/${repository}/issues/${ticketId}`, updatePayload, explicitRoot);
			log('info', `[GitHub] Issue #${ticketId} details updated.`);
			return true;
		} catch (error) {
			log('error', `[GitHub] Failed to update details for issue #${ticketId}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Delete a ticket (closes the issue in GitHub). (Placeholder for full implementation)
	 * @param {string} ticketId - Issue ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful
	 */
	async deleteTicket(ticketId, explicitRoot = null) {
		log('info', `[GitHub] Attempting to "delete" (close) issue #${ticketId}.`);
		// GitHub issues are typically closed, not deleted.
		// We pass minimal taskData for context if updateTicketStatus needs it for label management.
		const minimalTaskDataForClose = { 
			status: 'cancelled', // This will be mapped to 'Closed' state by mapStatusToTicket
			priority: null, // Let updateTicketStatus determine how to handle existing priority
		};
		return this.updateTicketStatus(ticketId, 'cancelled', explicitRoot, minimalTaskDataForClose);
	}
	
	/**
	 * Store issue ID in task metadata. This is a concrete implementation.
	 * @param {Object} task - Task object
	 * @param {string} ticketId - Issue ID
	 * @returns {Object} Updated task object
	 */
	storeTicketId(task, ticketId) {
		const newTask = { ...task };
		if (!newTask.metadata) newTask.metadata = {};
		newTask.metadata.githubIssueId = ticketId;
		return newTask;
	}

	/**
	 * Get issue ID from task metadata
	 * @param {Object} task - Task object
	 * @returns {string|null} Issue ID or null if not found
	 */
	getTicketId(task) {
		if (task && task.metadata) {
			return task.metadata.githubIssueId || null;
		}
		return null;
	}

	/**
	 * Get the URL for a GitHub issue
	 * @param {string} ticketId - Issue ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {string|null} URL string or null
	 */
	getTicketUrl(ticketId, explicitRoot = null) {
		const config = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		if (!config.owner || !config.repository || !ticketId) {
			log('warn', '[GitHub] Cannot generate ticket URL: Missing owner, repository, or ticketId.');
			return null;
		}
		return `https://github.com/${config.owner}/${config.repository}/issues/${ticketId}`;
	}

	/**
	 * Format a task title for GitHub. This is a concrete implementation.
	 * @param {Object} task - Task object
	 * @returns {string} Formatted title
	 */
	formatTitleForTicket(task) {
		const refId = task?.metadata?.refId || null;
		return refId ? `[${refId}] ${task.title}` : task.title;
	}

	/**
	 * Map TaskMaster priority to GitHub label
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string} GitHub priority label
	 */
	mapPriorityToTicket(priority) {
		switch (priority?.toLowerCase()) {
			case 'high':
				return 'priority:high';
			case 'medium':
				return 'priority:medium';
			case 'low':
				return 'priority:low';
			default:
				// If no/unknown priority, don't add a priority label by default.
				// Task creators can decide if they want a default label.
				return null; 
		}
	}

	/**
	 * Map TaskMaster status to GitHub status representation (label or state change).
	 * This is a concrete implementation.
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} GitHub status
	 */
	mapStatusToTicket(status) {
		switch (status?.toLowerCase()) {
			case 'pending':
				return 'Todo'; // Represents a label 'Todo', issue state 'open'
			case 'in-progress':
				return 'In Progress'; // Label 'In Progress', issue state 'open'
			case 'review':
				return 'In Review'; // Label 'In Review', issue state 'open'
			case 'done':
				return 'Done'; // Label 'Done', issue state 'open' (or 'closed' based on workflow)
			case 'cancelled':
				return 'Closed'; // Represents issue state 'closed'
			default:
				log('warn', `[GitHub] Unknown TaskMaster status "${status}" provided to mapStatusToTicket. Defaulting to "Todo" label.`);
				return 'Todo';
		}
	}

	/**
	 * Map GitHub issue details (like status labels and state) back to TaskMaster status.
	 * This is a concrete implementation.
	 * @param {Object} ticketDetails - Raw GitHub issue object, expected to have 'state' and 'labels' array.
	 * @returns {string} TaskMaster status
	 */
	mapTicketStatusToTaskmaster(ticketDetails) {
		if (!ticketDetails) return 'pending';

		const labels = ticketDetails.labels ? ticketDetails.labels.map(l => l.name.toLowerCase()) : [];

		if (ticketDetails.state === 'closed') {
			// If closed, could be 'done' or 'cancelled'.
			// Convention: If it has "Done" label, it's done, otherwise cancelled.
			if (labels.includes('done')) return 'done';
			return 'cancelled';
		}

		// Issue is open
		if (labels.includes('in progress') || labels.includes('in-progress')) return 'in-progress';
		if (labels.includes('in review') || labels.includes('in-review')) return 'review';
		if (labels.includes('done')) return 'done'; // 'Done' label on an open issue
		if (labels.includes('todo')) return 'pending';
		
		return 'pending'; // Default for open issues without specific status labels
	}

	/**
	 * Map GitHub issue priority labels back to TaskMaster priority.
	 * This is a concrete implementation.
	 * @param {Object} ticketDetails - Raw GitHub issue object with 'labels' array.
	 * @returns {string} TaskMaster priority
	 */
	 mapTicketPriorityToTaskmaster(ticketDetails) {
		if (!ticketDetails || !ticketDetails.labels) {
			return 'medium'; // Default
		}
		const labels = ticketDetails.labels.map(l => l.name.toLowerCase());
		if (labels.includes('priority:high')) return 'high';
		if (labels.includes('priority:low')) return 'low';
		return 'medium'; // 'priority:medium' or no specific priority label defaults to medium
	}

	// --- GitHub Projects (GraphQL) specific methods would go here ---
	// Example:
	// async addIssueToProjectGraphQL(issueNodeId, projectNodeId, explicitRoot = null) {
	//   const mutation = `...`; // GraphQL mutation
	//   try {
	//     const result = await this._request('POST', 'https://api.github.com/graphql', { query: mutation }, explicitRoot);
	//     // Process result
	//   } catch (error) {
	//     log('error', `[GitHub] Failed to add issue ${issueNodeId} to project ${projectNodeId}: ${error.message}`);
	//   }
	// }
}

export default GitHubProjectsTicketing;
