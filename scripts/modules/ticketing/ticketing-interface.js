/**
 * ticketing-interface.js
 * Abstract interface for ticketing system integrations
 */

/**
 * Abstract Ticketing System Interface
 * Defines the contract that all ticketing system implementations must follow
 * @abstract
 */
class TicketingSystemInterface {
	/**
	 * Check if the ticketing system is properly configured
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {boolean} True if configured, false otherwise
	 * @abstract
	 */
	isConfigured(explicitRoot = null) {
		throw new Error('Method isConfigured must be implemented by subclass');
	}

	/**
	 * Validate ticketing system configuration and log warnings if invalid
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object|null} Configuration object or null if invalid
	 * @abstract
	 */
	validateConfig(explicitRoot = null) {
		throw new Error('Method validateConfig must be implemented by subclass');
	}

	/**
	 * Get ticketing system configuration
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Object} Configuration object
	 * @abstract
	 */
	getConfig(explicitRoot = null) {
		throw new Error('Method getConfig must be implemented by subclass');
	}

	/**
	 * Create a story (top-level item) in the ticketing system
	 * @param {Object} taskData - Task data
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created ticket data
	 * @abstract
	 */
	createStory(taskData, explicitRoot = null) {
		throw new Error('Method createStory must be implemented by subclass');
	}

	/**
	 * Create a task/subtask in the ticketing system
	 * @param {Object} subtaskData - Subtask data
	 * @param {string} parentTicketId - Parent ticket ID in the ticketing system
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<Object>} Created ticket data
	 * @abstract
	 */
	createTask(subtaskData, parentTicketId, explicitRoot = null) {
		throw new Error('Method createTask must be implemented by subclass');
	}

	/**
	 * Find a ticket ID by reference ID
	 * @param {string} refId - Reference ID to search for
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<string|null>} Ticket ID if found, null otherwise
	 * @abstract
	 */
	findTicketByRefId(refId, explicitRoot = null) {
		throw new Error('Method findTicketByRefId must be implemented by subclass');
	}

	/**
	 * Check if a ticket exists in the ticketing system
	 * @param {string} ticketId - Ticket ID
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if the ticket exists, false otherwise
	 * @abstract
	 */
	ticketExists(ticketId, explicitRoot = null) {
		throw new Error('Method ticketExists must be implemented by subclass');
	}

	/**
	 * Create a link between two tickets
	 * @param {string} fromTicketId - From ticket ID
	 * @param {string} toTicketId - To ticket ID
	 * @param {string} linkType - Link type (e.g., 'Blocks', 'Relates to')
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 * @abstract
	 */
	createTicketLink(fromTicketId, toTicketId, linkType, explicitRoot = null) {
		throw new Error('Method createTicketLink must be implemented by subclass');
	}

	/**
	 * Update ticket status
	 * @param {string} ticketId - Ticket ID
	 * @param {string} status - New status
	 * @param {string|null} explicitRoot - Optional explicit path to the project root
	 * @param {Object} taskData - Task data for creating the ticket if it doesn't exist
	 * @returns {Promise<boolean>} True if successful, false otherwise
	 * @abstract
	 */
	updateTicketStatus(ticketId, status, explicitRoot = null, taskData = null) {
		throw new Error(
			'Method updateTicketStatus must be implemented by subclass'
		);
	}

	/**
	 * Store ticket ID in task metadata
	 * @param {Object} task - Task object
	 * @param {string} ticketId - Ticket ID
	 * @returns {Object} Updated task object
	 * @abstract
	 */
	storeTicketId(task, ticketId) {
		throw new Error('Method storeTicketId must be implemented by subclass');
	}

	/**
	 * Get ticket ID from task metadata
	 * @param {Object} task - Task object
	 * @returns {string|null} Ticket ID or null if not found
	 * @abstract
	 */
	getTicketId(task) {
		throw new Error('Method getTicketId must be implemented by subclass');
	}

	/**
	 * Format a task title for the ticketing system
	 * @param {Object} task - Task object
	 * @returns {string} Formatted title
	 * @abstract
	 */
	formatTitleForTicket(task) {
		throw new Error(
			'Method formatTitleForTicket must be implemented by subclass'
		);
	}

	/**
	 * Map TaskMaster priority to ticketing system priority
	 * @param {string} priority - TaskMaster priority (high, medium, low)
	 * @returns {string} Ticketing system priority
	 * @abstract
	 */
	mapPriorityToTicket(priority) {
		throw new Error(
			'Method mapPriorityToTicket must be implemented by subclass'
		);
	}

	/**
	 * Map TaskMaster status to ticketing system status
	 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
	 * @returns {string} Ticketing system status
	 * @abstract
	 */
	mapStatusToTicket(status) {
		throw new Error('Method mapStatusToTicket must be implemented by subclass');
	}
}

/**
 * Check if any ticketing system is properly configured
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<boolean>} True if a ticketing system is configured, false otherwise
 */
async function isTicketingSystemConfigured(explicitRoot = null) {
	try {
		// Dynamically import to avoid circular dependencies
		const { getTicketingInstance } = await import('./ticketing-factory.js');
		const ticketingInstance = await getTicketingInstance(null, explicitRoot);
		return (
			ticketingInstance !== null && ticketingInstance.isConfigured(explicitRoot)
		);
	} catch (error) {
		console.error('Error checking ticketing system configuration:', error);
		return false;
	}
}

export default TicketingSystemInterface;
export { isTicketingSystemConfigured };
