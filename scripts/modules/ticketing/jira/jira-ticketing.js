/**
 * jira-ticketing.js
 * Jira implementation of the abstract ticketing system interface
 * This is the main class that implements the TicketingSystemInterface
 * and delegates to specialized modules for different functionalities.
 */

import TicketingSystemInterface from '../ticketing-interface.js';

// Import from our refactored modules
import { isConfigured, validateConfig, getJiraConfig } from './jira-config.js';
import {
	mapPriorityToTicket,
	mapStatusToTicket,
	formatTitleForTicket,
	mapTicketStatusToTaskmaster,
	mapTicketPriorityToTaskmaster
} from './jira-mapping.js';
import {
	storeTicketId,
	getTicketId,
	createStory,
	createTask,
	getAllTickets,
	getTicketStatusById,
	updateTicketStatusById,
	updateTicketDetails,
	deleteTicket,
	ticketExists
} from './jira-ticket-operations.js';

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
		return isConfigured(explicitRoot);
	}

	/**
	 * Validate Jira configuration and log warnings if invalid
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object|null} Configuration object or null if invalid
	 */
	validateConfig(explicitRoot = null) {
		return validateConfig(explicitRoot);
	}

	/**
	 * Get Jira configuration
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 */
	getConfig(explicitRoot = null) {
		return getJiraConfig(explicitRoot);
	}

	/**
	 * Create a user story in Jira
	 * @param {Object} taskData - Task data
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created issue data
	 */
	async createStory(taskData, explicitRoot = null) {
		return createStory(taskData, explicitRoot);
	}

	/**
	 * Map TaskMaster priority to Jira priority
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string|null} Jira priority or null if disabled
	 */
	mapPriorityToTicket(priority) {
		return mapPriorityToTicket(priority);
	}

	/**
	 * Format a task title for Jira
	 * @param {Object} task - Task object
	 * @returns {string} Formatted title
	 */
	formatTitleForTicket(task) {
		return formatTitleForTicket(task);
	}

	/**
	 * Store Jira key in task metadata
	 * @param {Object} task - Task object
	 * @param {string} ticketId - Jira issue key
	 * @returns {Object} Updated task object
	 */
	storeTicketId(task, ticketId) {
		return storeTicketId(task, ticketId);
	}

	/**
	 * Get Jira key from task metadata
	 * @param {Object} task - Task object
	 * @returns {string|null} Jira issue key or null if not found
	 */
	getTicketId(task) {
		return getTicketId(task);
	}

	/**
	 * Map TaskMaster status to Jira status
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} Jira status
	 */
	mapStatusToTicket(status) {
		return mapStatusToTicket(status);
	}

	/**
	 * Get all tickets from Jira for the configured project
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Array>} Array of Jira tickets
	 */
	async getAllTickets(explicitRoot = null) {
		return getAllTickets(explicitRoot);
	}

	/**
	 * Get current status of a Jira ticket
	 * @param {string} ticketId - The Jira ticket ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} - The status of the ticket or null if it couldn't be fetched
	 */
	async getTicketStatus(ticketId, explicitRoot = null) {
		return getTicketStatusById(ticketId, explicitRoot);
	}

	/**
	 * Map Jira status to TaskMaster status
	 * @param {string} jiraStatus - Jira status
	 * @returns {string} TaskMaster status
	 */
	mapTicketStatusToTaskmaster(jiraStatus) {
		return mapTicketStatusToTaskmaster(jiraStatus);
	}

	/**
	 * Map Jira priority to TaskMaster priority
	 * @param {string} jiraPriority - Jira priority
	 * @returns {string} TaskMaster priority
	 */
	mapTicketPriorityToTaskmaster(jiraPriority) {
		return mapTicketPriorityToTaskmaster(jiraPriority);
	}

	/**
	 * Update the status of a Jira ticket
	 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
	 * @param {string} taskmasterStatus - TaskMaster status (e.g., 'done', 'in-progress')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @param {Object|null} taskData - Optional task data for additional updates
	 * @returns {Promise<boolean>} True if the update was successful, false otherwise
	 */
	async updateTicketStatus(
		ticketId,
		taskmasterStatus,
		explicitRoot = null,
		taskData = null
	) {
		return updateTicketStatusById(
			ticketId,
			taskmasterStatus,
			explicitRoot,
			taskData
		);
	}

	/**
	 * Create a task/subtask in the Jira system
	 * @param {Object} subtaskData - Subtask data
	 * @param {string} parentTicketId - Parent ticket ID in the ticketing system
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created ticket data
	 */
	async createTask(subtaskData, parentTicketId, explicitRoot = null) {
		return createTask(subtaskData, parentTicketId, explicitRoot);
	}

	/**
	 * Check if a ticket exists in the Jira system
	 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the ticket exists, false otherwise
	 */
	async ticketExists(ticketId, explicitRoot = null) {
		return ticketExists(ticketId, explicitRoot);
	}

	/**
	 * Find a ticket ID by reference ID
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Ticket ID if found, null otherwise
	 */
	async findTicketByRefId(refId, explicitRoot = null) {
		// This method is required by the interface but not yet implemented in jira-ticket-operations.js
		console.log(`Searching for ticket with reference ID: ${refId}`);
		return null; // Temporary fallback until we implement the actual search
	}

	/**
	 * Find a subtask ticket ID by reference ID
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Ticket ID if found, null otherwise
	 */
	async findSubtaskByRefId(refId, explicitRoot = null) {
		// This method is being called by the system but not yet implemented
		console.log(`Searching for subtask with reference ID: ${refId}`);
		return null; // Temporary fallback until we implement the actual search
	}

	/**
	 * Update ticket details (title, description, priority, etc.) when a task/subtask is updated
	 * @param {string} ticketId - Ticket ID
	 * @param {Object} taskData - New task data
	 * @param {Object} previousTaskData - Previous task data before the update
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async updateTicketDetails(
		ticketId,
		taskData,
		previousTaskData,
		explicitRoot = null
	) {
		// Use the statically imported implementation
		return updateTicketDetails(
			ticketId,
			taskData,
			previousTaskData,
			explicitRoot
		);
	}

	/**
	 * Delete a ticket in the Jira system
	 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 */
	async deleteTicket(ticketId, explicitRoot = null) {
		// Use the statically imported implementation
		return deleteTicket(ticketId, explicitRoot);
	}
}

export default JiraTicketing;
