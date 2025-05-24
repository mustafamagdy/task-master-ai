/**
 * status-utils.js
 * Centralized utilities for handling task and ticket status
 */

/**
 * Synchronize a task status with its ticket status
 * @param {Object} taskItem - The task or subtask item
 * @param {string} ticketIdentifier - The ticket ID in the ticketing system
 * @param {Object} ticketingSystem - The ticketing system instance
 * @param {Object} options - Additional options
 * @param {boolean} options.isSubtaskItem - Whether this is a subtask
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<boolean>} Whether the synchronization was successful
 */
export async function synchronizeTaskStatus(
	taskItem,
	ticketIdentifier,
	ticketingSystem,
	options = {}
) {
	const { isSubtaskItem = false, logger = console } = options;

	try {
		// Validate inputs
		if (!ticketingSystem || !ticketIdentifier) {
			logger.error(
				`Missing ${!ticketingSystem ? 'ticketing system' : 'ticket identifier'} for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`
			);
			return false;
		}

		// Get current status from ticketing system
		const ticketStatusResult = await ticketingSystem.getTicketStatus(
			ticketIdentifier,
			options.projectRoot
		);

		if (!ticketStatusResult) {
			logger.warn(`No status found for ticket ${ticketIdentifier}`);
			return false;
		}

		// Extract the actual status string from the result
		// Handle both string status and object with status property
		const ticketStatus =
			typeof ticketStatusResult === 'object' && ticketStatusResult.status
				? ticketStatusResult.status
				: ticketStatusResult;

		if (!ticketStatus || typeof ticketStatus !== 'string') {
			logger.warn(`Invalid status format for ticket ${ticketIdentifier}`);
			return false;
		}

		// Convert ticket status to TaskMaster status
		const taskmasterStatus =
			ticketingSystem.mapTicketStatusToTaskmaster(ticketStatus);

		if (!taskmasterStatus) {
			logger.warn(
				`Could not map ticket status "${ticketStatus}" to TaskMaster status`
			);
			return false;
		}

		// If the current task status is different from the ticketing system status, update it
		if (taskItem.status !== taskmasterStatus) {
			// Update the task status
			taskItem.status = taskmasterStatus;

			// If there's a status change function provided, call it
			if (options.onStatusChanged) {
				options.onStatusChanged(taskItem, taskmasterStatus, ticketStatus);
			}

			return true;
		} else {
			return false; // No change needed
		}
	} catch (error) {
		logger.error(
			`Sync error for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${error.message}`
		);
		return false;
	}
}
