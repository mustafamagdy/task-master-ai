import https from 'https';
import { Buffer } from 'buffer'; // For PAT encoding
import TicketingSystemInterface from '../ticketing-interface.js';
import { log } from '../../utils.js';
import {
	getAzureOrganization,
	getAzurePersonalAccessToken,
	getAzureProjectName
} from '../../config-manager.js';

const DEFAULT_API_VERSION = '7.0'; // Common Azure DevOps API version

/**
 * Azure DevOps implementation of the ticketing system interface
 * @implements {TicketingSystemInterface}
 */
class AzureDevOpsTicketing extends TicketingSystemInterface {
	/**
	 * Constructor
	 * @param {Object} config - Configuration object from getTicketingSystem
	 */
	constructor(config) {
		super();
		this.config = config; // Initial config from instantiation
		// log('info', '[AzDevOps] Initialized Azure DevOps Ticketing System.');
	}

	/**
	 * Helper function to make requests to Azure DevOps API
	 * @param {string} method - HTTP method (GET, POST, PATCH, DELETE)
	 * @param {string} orgUrl - Base organization URL (e.g., https://dev.azure.com/MyOrg)
	 * @param {string} path - API path (e.g., /MyProject/_apis/wit/workitems)
	 * @param {string} token - Personal Access Token
	 * @param {Object|null} requestBody - Data to send in the request body
	 * @param {string} apiVersion - API version string (e.g., '7.0')
	 * @param {Object} additionalHeaders - Any additional headers
	 * @returns {Promise<Object>} Parsed JSON response
	 * @private
	 */
	async _request(method, orgUrl, path, token, requestBody = null, apiVersion = DEFAULT_API_VERSION, additionalHeaders = {}) {
		if (!orgUrl || !token) {
			throw new Error('[AzDevOps] Organization URL or PAT is missing for API request.');
		}

		const url = new URL(orgUrl); // Validates and parses the organization URL
		const requestPath = `${url.pathname}${path}?api-version=${apiVersion}`.replace(/\/\//g, '/'); // Avoid double slashes

		const patAuth = Buffer.from(`:${token}`).toString('base64'); // User is empty for PAT

		const options = {
			hostname: url.hostname,
			path: requestPath,
			method: method,
			headers: {
				'Authorization': `Basic ${patAuth}`,
				'Accept': 'application/json',
				...additionalHeaders // Spread additional headers, allowing override for Content-Type
			}
		};
		
		// Default Content-Type for methods that typically have a body
		if (requestBody && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
			options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
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
										  (parsedResponse.value?.Message) || // Some AzDevOps errors are in value.Message
										  responseData;
							const error = new Error(
								`[AzDevOps] API Error: ${res.statusCode} ${res.statusMessage} - ${message}`
							);
							error.statusCode = res.statusCode;
							error.responseBody = parsedResponse;
							reject(error);
						}
					} catch (e) {
						reject(new Error(`[AzDevOps] Failed to parse API response: ${e.message}. Response: ${responseData}`));
					}
				});
			});

			req.on('error', (e) => {
				reject(new Error(`[AzDevOps] API request failed: ${e.message}`));
			});

			if (requestBody) {
				req.write(JSON.stringify(requestBody));
			}
			req.end();
		});
	}

	/**
	 * Check if Azure DevOps is properly configured.
	 * Uses config passed at instantiation or re-fetches if explicitRoot is given.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {boolean} True if configured, false otherwise
	 */
	isConfigured(explicitRoot = null) {
		const config = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		return !!config.organization && !!config.token && !!config.projectName;
	}

	/**
	 * Validate Azure DevOps configuration and log warnings if invalid.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object|null} Configuration object or null if invalid
	 */
	validateConfig(explicitRoot = null) {
		const currentConfig = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		if (!this.isConfigured(explicitRoot)) { // Pass explicitRoot to isConfigured
			log('warn', '[AzDevOps] Azure DevOps is not properly configured. Missing organization URL, PAT, or project name.');
			return null;
		}
		// Validate organization URL format
		try {
			new URL(currentConfig.organization);
		} catch (e) {
			log('warn', `[AzDevOps] Invalid Azure DevOps organization URL format: ${currentConfig.organization}`);
			return null;
		}
		return currentConfig;
	}
	
	/**
	 * Get Azure DevOps configuration.
	 * This method now directly uses the config-manager functions.
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 */
	getConfig(explicitRoot = null) {
		// Always fetch fresh config from config-manager when this is called.
		return {
			organization: getAzureOrganization(explicitRoot),
			token: getAzurePersonalAccessToken(explicitRoot),
			projectName: getAzureProjectName(explicitRoot)
		};
	}

	/**
	 * Create a work item in Azure DevOps. (Placeholder)
	 * @param {Object} taskData - Task data
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object|null>} Created work item data or null
	 */
	async createStory(taskData, explicitRoot = null, workItemType = 'User Story') {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			throw new Error('[AzDevOps] Configuration is invalid. Cannot create story.');
		}
		const { organization, token, projectName } = config;

		const patchDocument = [
			{
				op: 'add',
				path: '/fields/System.Title',
				value: this.formatTitleForTicket(taskData)
			},
			{
				op: 'add',
				path: '/fields/System.Description',
				// Azure DevOps description fields typically expect HTML.
				value: `${taskData.description || ''}<br><hr><p><em>Details:</em></p>${taskData.details || 'N/A'}`
			},
			{
				op: 'add',
				path: '/fields/Microsoft.VSTS.Common.Priority',
				value: this.mapPriorityToTicket(taskData.priority)
			}
		];

		if (taskData.metadata?.refId) {
			patchDocument.push({
				op: 'add',
				path: '/fields/System.Tags',
				value: taskData.metadata.refId // Add refId as a tag
			});
		}
		
		// Add area path and iteration path if configured or default needed
		// patchDocument.push({ op: 'add', path: '/fields/System.AreaPath', value: projectName });
		// patchDocument.push({ op: 'add', path: '/fields/System.IterationPath', value: projectName });


		try {
			// The Content-Type for creating/updating work items with JSON Patch is 'application/json-patch+json'
			const additionalHeaders = { 'Content-Type': 'application/json-patch+json' };
			const workItem = await this._request(
				'POST', 
				organization, 
				`/${projectName}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}`, 
				token, 
				patchDocument,
				DEFAULT_API_VERSION,
				additionalHeaders
			);

			log('info', `[AzDevOps] Work item #${workItem.id} (${workItemType}) created for task ${taskData.id}. URL: ${workItem._links.html.href}`);
			return {
				id: workItem.id.toString(),
				key: workItem.id.toString(),
				url: workItem._links.html.href,
				rawResponse: workItem
			};
		} catch (error) {
			log('error', `[AzDevOps] Failed to create ${workItemType} for task ${taskData.id}: ${error.message}`);
			log('error', `[AzDevOps] Request payload: ${JSON.stringify(patchDocument)}`);
			if (error.responseBody) log('error', `[AzDevOps] Response body: ${JSON.stringify(error.responseBody)}`);
			throw error;
		}
	}

	/**
	 * Create a child work item in Azure DevOps. (Placeholder)
	 * @param {Object} subtaskData - Subtask data
	 * @param {string} parentTicketId - Parent work item ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object|null>} Created work item data or null
	 */
	async createTask(subtaskData, parentTicketId, explicitRoot = null) {
		log('warn', '[AzDevOps] createTask not fully implemented yet.');
		return null;
	}
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Work item ID if found, null otherwise
	 */
	async findTicketByRefId(refId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[AzDevOps] Configuration is invalid. Cannot find ticket by refId.');
			return null;
		}
		const { organization, token, projectName } = config;

		if (!refId) {
			log('warn', '[AzDevOps] findTicketByRefId called with no refId.');
			return null;
		}

		// WIQL query to find work items by tag.
		// Ensure refId is escaped if it can contain single quotes or other special chars.
		// For simplicity, assuming refId is a simple alphanumeric string here.
		const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${refId}'`;
		const wiqlPayload = { query: wiqlQuery };

		try {
			const queryResult = await this._request('POST', organization, `/${projectName}/_apis/wit/wiql`, token, wiqlPayload);
			
			if (queryResult.workItems && queryResult.workItems.length > 0) {
				const workItemId = queryResult.workItems[0].id.toString();
				log('info', `[AzDevOps] Found work item ID ${workItemId} for refId "${refId}" in project "${projectName}".`);
				// Optionally, one might want to fetch the full work item here to confirm details,
				// but the task is just to find the ID.
				return workItemId;
			}
			log('info', `[AzDevOps] No work item found for refId "${refId}" in project "${projectName}".`);
			return null;
		} catch (error) {
			log('error', `[AzDevOps] Error searching for work item by refId "${refId}": ${error.message}`);
			// If the error is a 404 on the query itself, it likely means project/org is wrong,
			// but _request should handle general API errors.
			return null;
		}
	}

	/**
	 * Check if a work item exists. (Placeholder)
	 * @param {string} ticketId - Work item ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the work item exists, false otherwise
	 */
	async ticketExists(ticketId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			log('warn', '[AzDevOps] Configuration is invalid. Cannot check if ticket exists.');
			return false;
		}
		const { organization, token, projectName } = config;

		if (!ticketId || isNaN(parseInt(ticketId))) { // AzDevOps IDs are numbers
			log('warn', `[AzDevOps] ticketExists called with invalid ticketId: ${ticketId}. Must be a number.`);
			return false;
		}

		try {
			// Just fetching the work item is enough to know if it exists.
			// No need to specify fields, default response is fine.
			await this._request('GET', organization, `/${projectName}/_apis/wit/workitems/${ticketId}`, token);
			log('info', `[AzDevOps] Work item ID ${ticketId} exists in project "${projectName}".`);
			return true;
		} catch (error) {
			if (error.statusCode === 404) {
				log('info', `[AzDevOps] Work item ID ${ticketId} does not exist in project "${projectName}".`);
				return false;
			}
			log('error', `[AzDevOps] Error checking existence of work item ID ${ticketId}: ${error.message}`);
			return false; // For other errors (auth, etc.), existence is unconfirmed.
		}
	}

	/**
	 * Create a link between two work items. (Placeholder)
	 * @param {string} fromTicketId - From work item ID
	 * @param {string} toTicketId - To work item ID
	 * @param {string} linkType - Link type
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async createTicketLink(
		fromTicketId,
		toTicketId,
		linkType,
		explicitRoot = null
	) {
		log('warn', '[AzDevOps] createTicketLink not fully implemented yet.');
		return false;
	}

	/**
	 * Update work item status. (Placeholder)
	 * @param {string} ticketId - Work item ID
	 * @param {string} status - New status
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @param {Object} taskData - Task data for creating the work item if it doesn't exist
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async updateTicketStatus(
		ticketId,
		status, // TaskMaster status
		explicitRoot = null,
		taskData = null // Full task data from TaskMaster, useful for context like priority
	) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			throw new Error('[AzDevOps] Configuration is invalid. Cannot update ticket status.');
		}
		const { organization, token, projectName } = config;

		if (!ticketId || isNaN(parseInt(ticketId))) {
			log('error', `[AzDevOps] Invalid ticketId for status update: ${ticketId}`);
			return false;
		}

		const mappedState = this.mapStatusToTicket(status);
		const patchDocument = [
			{
				op: 'add', // 'add' can also mean 'update' for existing fields
				path: '/fields/System.State',
				value: mappedState
			}
		];

		// Optionally update priority if provided in taskData
		if (taskData && taskData.priority) {
			patchDocument.push({
				op: 'add',
				path: '/fields/Microsoft.VSTS.Common.Priority',
				value: this.mapPriorityToTicket(taskData.priority)
			});
		}
		
		// Add other fields to update if necessary, e.g., reason for state change
		// if (mappedState === 'Removed' || mappedState === 'Closed') {
		//    patchDocument.push({ op: 'add', path: '/fields/System.Reason', value: 'Updated by TaskMaster' });
		// }


		try {
			const additionalHeaders = { 'Content-Type': 'application/json-patch+json' };
			await this._request(
				'PATCH',
				organization,
				`/${projectName}/_apis/wit/workitems/${ticketId}`,
				token,
				patchDocument,
				DEFAULT_API_VERSION,
				additionalHeaders
			);
			log('info', `[AzDevOps] Work item #${ticketId} status updated to "${mappedState}".`);
			return true;
		} catch (error) {
			log('error', `[AzDevOps] Failed to update status for work item #${ticketId}: ${error.message}`);
			log('error', `[AzDevOps] Request payload: ${JSON.stringify(patchDocument)}`);
			if (error.responseBody) log('error', `[AzDevOps] Response body: ${JSON.stringify(error.responseBody)}`);
			// Do not re-throw for boolean return type methods as per convention in other ticketing systems
			return false;
		}
	}

	/**
	 * Update work item details (title, body, priority). (Placeholder)
	 * @param {string} ticketId - Work item ID
	 * @param {Object} taskData - Task data with new details
	 * @param {Object} previousTaskData - Previous task data (optional, for comparison)
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful
	 */
	async updateTicketDetails(ticketId, taskData, previousTaskData = null, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			throw new Error('[AzDevOps] Configuration is invalid. Cannot update ticket details.');
		}
		const { organization, token, projectName } = config;

		if (!ticketId || isNaN(parseInt(ticketId)) || !taskData) {
			log('error', `[AzDevOps] Invalid parameters for updateTicketDetails: ticketId=${ticketId}`);
			return false;
		}

		const patchDocument = [];

		if (taskData.title) {
			patchDocument.push({
				op: 'add',
				path: '/fields/System.Title',
				value: this.formatTitleForTicket(taskData)
			});
		}

		// Combine description and details for the System.Description field
		let descriptionValue = '';
		if (taskData.description) descriptionValue += taskData.description;
		if (taskData.details) {
			if (descriptionValue) descriptionValue += '<br><hr><p><em>Details:</em></p>';
			descriptionValue += taskData.details;
		}
		if (descriptionValue || (previousTaskData && (previousTaskData.description || previousTaskData.details))) { // Update only if new value or if old value existed
			patchDocument.push({
				op: 'add', // Use 'add' for create or update
				path: '/fields/System.Description',
				value: descriptionValue
			});
		}
		

		if (taskData.priority) {
			patchDocument.push({
				op: 'add',
				path: '/fields/Microsoft.VSTS.Common.Priority',
				value: this.mapPriorityToTicket(taskData.priority)
			});
		}

		// Update tags if refId is present - ensure not to duplicate, though AzDevOps handles this.
		// A robust tag update would fetch existing tags, merge, then replace.
		// For simplicity here, we just add the refId tag if it's in metadata.
		// This assumes other tags are managed directly in AzDevOps.
		if (taskData.metadata?.refId) {
			// To properly update tags, you'd typically get existing tags, add new, remove old if needed.
			// Simple add for refId:
			// patchDocument.push({ op: 'add', path: '/fields/System.Tags', value: taskData.metadata.refId });
			// For a more complete update, one might do:
			// 1. Get current work item for existing tags.
			// 2. Construct new tag string.
			// 3. Use 'replace' op for System.Tags.
			// This is simplified here to avoid a GET request.
		}

		if (patchDocument.length === 0) {
			log('info', `[AzDevOps] No details to update for work item #${ticketId}.`);
			return true; // Nothing to update, consider it a success.
		}

		try {
			const additionalHeaders = { 'Content-Type': 'application/json-patch+json' };
			await this._request(
				'PATCH',
				organization,
				`/${projectName}/_apis/wit/workitems/${ticketId}`,
				token,
				patchDocument,
				DEFAULT_API_VERSION,
				additionalHeaders
			);
			log('info', `[AzDevOps] Work item #${ticketId} details updated.`);
			return true;
		} catch (error) {
			log('error', `[AzDevOps] Failed to update details for work item #${ticketId}: ${error.message}`);
			log('error', `[AzDevOps] Request payload: ${JSON.stringify(patchDocument)}`);
			if (error.responseBody) log('error', `[AzDevOps] Response body: ${JSON.stringify(error.responseBody)}`);
			return false;
		}
	}

	/**
	 * Delete a ticket (sets state to 'Removed' or similar). (Placeholder)
	 * @param {string} ticketId - Work item ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful
	 */
	async deleteTicket(ticketId, explicitRoot = null) {
		const config = this.validateConfig(explicitRoot);
		if (!config) {
			// Error already logged by validateConfig
			return false;
		}

		if (!ticketId || isNaN(parseInt(ticketId))) {
			log('error', `[AzDevOps] Invalid ticketId for deleteTicket: ${ticketId}`);
			return false;
		}

		log('info', `[AzDevOps] Attempting to "delete" (set state to 'Removed') work item #${ticketId}.`);
		
		// We use 'cancelled' as the TaskMaster status, which mapStatusToTicket should map to 'Removed' or similar.
		// Pass minimal taskData as updateTicketStatus might expect it, though for state change only it's less critical.
		const minimalTaskDataForDelete = { 
			status: 'cancelled',
			// priority: null, // Let updateTicketStatus handle priority if it needs to
		};

		return this.updateTicketStatus(ticketId, 'cancelled', explicitRoot, minimalTaskDataForDelete);
	}
	
	/**
	 * Store work item ID in task metadata. This is a concrete implementation.
	 * @param {Object} task - Task object
	 * @param {string} ticketId - Work item ID
	 * @returns {Object} Updated task object
	 */
	storeTicketId(task, ticketId) {
		const newTask = { ...task };
		if (!newTask.metadata) newTask.metadata = {};
		newTask.metadata.azureWorkItemId = ticketId;
		return newTask;
	}

	/**
	 * Get work item ID from task metadata
	 * @param {Object} task - Task object
	 * @returns {string|null} Work item ID or null if not found
	 */
	getTicketId(task) {
		if (task && task.metadata) {
			return task.metadata.azureWorkItemId || null;
		}
		return null;
	}

	/**
	 * Get the URL for an Azure DevOps work item.
	 * @param {string} ticketId - Work item ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {string|null} URL string or null
	 */
	getTicketUrl(ticketId, explicitRoot = null) {
		const config = explicitRoot ? this.getConfig(explicitRoot) : this.config;
		if (!config.organization || !config.projectName || !ticketId) {
			log('warn', '[AzDevOps] Cannot generate ticket URL: Missing organization, project name, or ticketId.');
			return null;
		}
		// Format: {organization}/{projectName}/_workitems/edit/{ticketId}
		// Ensure organization URL doesn't end with a slash before appending project name
		const orgBase = config.organization.endsWith('/') ? config.organization.slice(0, -1) : config.organization;
		return `${orgBase}/${config.projectName}/_workitems/edit/${ticketId}`;
	}

	/**
	 * Format a task title for Azure DevOps. This is a concrete implementation.
	 * @param {Object} task - Task object
	 * @returns {string} Formatted title
	 */
	formatTitleForTicket(task) {
		const refId = task?.metadata?.refId || null;
		return refId ? `${refId}: ${task.title}` : task.title;
	}

	/**
	 * Map TaskMaster priority to Azure DevOps priority
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string} Azure DevOps priority
	 */
	mapPriorityToTicket(priority) {
		// Azure DevOps priorities: 1 (High), 2 (Medium), 3 (Low), 4 (Lowest - often not used for tasks)
		switch (priority?.toLowerCase()) {
			case 'high':
				return 1; 
			case 'medium':
				return 2;
			case 'low':
				return 3;
			default:
				return 2; // Default to Medium priority
		}
	}

	/**
	 * Map TaskMaster status to Azure DevOps state. This is a concrete implementation.
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} Azure DevOps state
	 */
	mapStatusToTicket(status) { // For a standard Agile process template
		switch (status?.toLowerCase()) {
			case 'pending':
				return 'New'; // Or 'To Do' depending on process template
			case 'in-progress':
				return 'Active'; // Or 'Doing'
			case 'review':
				return 'Resolved'; // Or a custom 'In Review' state
			case 'done':
				return 'Closed'; // Or 'Done'
			case 'cancelled':
				return 'Removed'; // Or 'Closed' with a specific reason
			default:
				log('warn', `[AzDevOps] Unknown TaskMaster status "${status}" provided to mapStatusToTicket. Defaulting to "New".`);
				return 'New';
		}
	}

	/**
	 * Map Azure DevOps work item details back to TaskMaster status.
	 * @param {Object} ticketDetails - Raw Azure DevOps work item object.
	 * @returns {string} TaskMaster status
	 */
	mapTicketStatusToTaskmaster(ticketDetails) {
		if (!ticketDetails || !ticketDetails.fields || !ticketDetails.fields['System.State']) {
			return 'pending'; // Default
		}
		const state = ticketDetails.fields['System.State'].toLowerCase();
		// This mapping depends heavily on the chosen Azure DevOps process template.
		// This is a generic example.
		switch (state) {
			case 'new':
			case 'to do':
				return 'pending';
			case 'active':
			case 'doing':
			case 'committed': // Another common "in progress" state
				return 'in-progress';
			case 'resolved': // Often used for "ready for test" or "in review"
			case 'review':
				return 'review';
			case 'closed':
			case 'done':
				// Could check 'System.Reason' for more granular mapping if needed
				// For now, if it's closed and reason is 'Fixed', 'Completed', etc. -> done
				// If 'Abandoned', 'Rejected' -> cancelled
				const reason = ticketDetails.fields['System.Reason']?.toLowerCase();
				if (reason === 'removed' || reason === 'cut' || reason === 'declined' || reason === 'obsolete' || reason === 'out of scope') {
					return 'cancelled';
				}
				return 'done';
			case 'removed':
				return 'cancelled';
			default:
				log('warn', `[AzDevOps] Unknown Azure DevOps state "${state}" provided to mapTicketStatusToTaskmaster. Defaulting to "pending".`);
				return 'pending';
		}
	}

	/**
	 * Map Azure DevOps work item priority back to TaskMaster priority.
	 * @param {Object} ticketDetails - Raw Azure DevOps work item object.
	 * @returns {string} TaskMaster priority
	 */
	mapTicketPriorityToTaskmaster(ticketDetails) {
		if (!ticketDetails || !ticketDetails.fields || !ticketDetails.fields['Microsoft.VSTS.Common.Priority']) {
			return 'medium'; // Default
		}
		const priority = ticketDetails.fields['Microsoft.VSTS.Common.Priority'];
		switch (priority) {
			case 1:
				return 'high';
			case 2:
				return 'medium';
			case 3:
			case 4: // Mapping 4 also to low for simplicity
				return 'low';
			default:
				return 'medium';
		}
	}
}

export default AzureDevOpsTicketing;
