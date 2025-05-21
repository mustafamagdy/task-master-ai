/**
 * set-task-status.js
 * Direct function implementation for setting task status
 */

import { setTaskStatus } from '../../../../scripts/modules/task-manager.js';
import {
	enableSilentMode,
	disableSilentMode,
	isSilentMode,
	readJSON,
	findTaskById
} from '../../../../scripts/modules/utils.js';
import { getTicketingInstance } from '../../../../scripts/modules/ticketing/ticketing-factory.js';
import { getTicketingIntegrationEnabled } from '../../../../scripts/modules/config-manager.js';

/**
 * Direct function wrapper for setTaskStatus with error handling.
 *
 * @param {Object} args - Command arguments containing id, status and tasksJsonPath.
 * @param {Object} log - Logger object.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function setTaskStatusDirect(args, log) {
	// Destructure expected args, including the resolved tasksJsonPath
	const { tasksJsonPath, id, status } = args;
	try {
		log.info(`Setting task status with args: ${JSON.stringify(args)}`);

		// Check if tasksJsonPath was provided
		if (!tasksJsonPath) {
			const errorMessage = 'tasksJsonPath is required but was not provided.';
			log.error(errorMessage);
			return {
				success: false,
				error: { code: 'MISSING_ARGUMENT', message: errorMessage },
				fromCache: false
			};
		}

		// Check required parameters (id and status)
		if (!id) {
			const errorMessage =
				'No task ID specified. Please provide a task ID to update.';
			log.error(errorMessage);
			return {
				success: false,
				error: { code: 'MISSING_TASK_ID', message: errorMessage },
				fromCache: false
			};
		}

		if (!status) {
			const errorMessage =
				'No status specified. Please provide a new status value.';
			log.error(errorMessage);
			return {
				success: false,
				error: { code: 'MISSING_STATUS', message: errorMessage },
				fromCache: false
			};
		}

		// Use the provided path
		const tasksPath = tasksJsonPath;

		// Execute core setTaskStatus function
		const taskId = id;
		const newStatus = status;

		log.info(`Setting task ${taskId} status to "${newStatus}"`);

		// Helper function to determine status priority
		function getStatusPriority(status) {
			// Convert to lowercase for case-insensitive comparison
			const s = (status || '').toLowerCase();
			// Priority is based on workflow progression (higher number = further along)
			if (s === 'done') return 5; // Highest priority - work is complete
			if (s === 'in review' || s === 'review') return 4;
			if (s === 'in progress') return 3;
			if (s === 'to do') return 2;
			if (s === 'backlog') return 1;
			if (s === 'cancelled') return 6; // Special case - cancelled overrides everything
			return 0; // Default/unknown status
		}

		// Check for conflicts with ticketing system if integration is enabled
		let statusToUse = newStatus;
		if (getTicketingIntegrationEnabled()) {
			try {
				const ticketing = await getTicketingInstance('jira');
				if (ticketing) {
					// Read tasks.json to find the task
					const data = readJSON(tasksPath);
					const task = findTaskById(data.tasks, taskId);
					
					if (task) {
						// Check if task has a ticket in Jira
						const ticketId = ticketing.getTicketId(task);
						if (ticketId) {
							// Get current Jira status
							const currentJiraStatus = await ticketing.getTicketStatus(ticketId);
							if (currentJiraStatus) {
								log.info(`Retrieved current status for ticket ${ticketId} from Jira: ${currentJiraStatus}`);
								
								// Map TaskMaster status to Jira status for comparison
								const jiraEquivalentStatus = ticketing.mapStatusToTicket(newStatus);
								
								// Check if statuses are different (conflict case)
								if (currentJiraStatus !== jiraEquivalentStatus) {
									// We have a conflict - determine which status has higher priority
									const jiraStatusPriority = getStatusPriority(currentJiraStatus);
									const taskMasterStatusPriority = getStatusPriority(jiraEquivalentStatus);
									log.info(`Status conflict detected! Jira: ${currentJiraStatus} (priority ${jiraStatusPriority}), TaskMaster: ${newStatus} (priority ${taskMasterStatusPriority})`);
									
									if (jiraStatusPriority > taskMasterStatusPriority) {
										// Jira status has higher priority - use it
										const jiraTaskMasterStatus = ticketing.mapTicketStatusToTaskmaster(currentJiraStatus);
										log.info(`Using Jira's status (${currentJiraStatus}) which has higher priority. TaskMaster status set to: ${jiraTaskMasterStatus}`);
										statusToUse = jiraTaskMasterStatus;
									} else {
										// TaskMaster status has higher or equal priority - use it
										log.info(`Using TaskMaster's status (${newStatus}) which has higher priority than Jira status (${currentJiraStatus})`);
										// Will update Jira with the TaskMaster status (default behavior)
									}
								}
							}
						}
					}
				}
			} catch (error) {
				log.error(`Error checking ticket status in Jira: ${error.message}`);
				// Continue with TaskMaster status update on error
			}
		}

		// Call the core function with proper silent mode handling
		enableSilentMode(); // Enable silent mode before calling core function
		try {
			// Call the core function with potentially modified status
			await setTaskStatus(tasksPath, taskId, statusToUse, { mcpLog: log });

			log.info(`Successfully set task ${taskId} status to ${statusToUse}`);

			// Return success data
			const result = {
				success: true,
				data: {
					message: `Successfully updated task ${taskId} status to "${statusToUse}"`,
					taskId,
					status: statusToUse, // Use the potentially modified status value
					tasksPath: tasksPath // Return the path used
				},
				fromCache: false // This operation always modifies state and should never be cached
			};
			return result;
		} catch (error) {
			log.error(`Error setting task status: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'SET_STATUS_ERROR',
					message: error.message || 'Unknown error setting task status'
				},
				fromCache: false
			};
		} finally {
			// ALWAYS restore normal logging in finally block
			disableSilentMode();
		}
	} catch (error) {
		// Ensure silent mode is disabled if there was an uncaught error in the outer try block
		if (isSilentMode()) {
			disableSilentMode();
		}

		log.error(`Error setting task status: ${error.message}`);
		return {
			success: false,
			error: {
				code: 'SET_STATUS_ERROR',
				message: error.message || 'Unknown error setting task status'
			},
			fromCache: false
		};
	}
}
