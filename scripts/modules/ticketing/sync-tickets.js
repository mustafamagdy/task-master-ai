/**
 * sync-tickets.js
 * Generic task synchronization with ticketing systems
 */

import { readJSON, writeJSON, log } from '../utils.js';
import {
	getTicketingSystem,
	getTicketingSystemEnabled
} from '../config-manager.js';
import { getRefId, formatTitleForTicket } from './reference-id-service.js';

/**
 * Synchronize tasks with the configured ticketing system
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force synchronization even if not enabled
 * @param {Object} options.mcpLog - MCP logger functions
 * @returns {Promise<Object>} Synchronization result
 */
async function syncTickets(tasksPath, options = {}) {
	const { force = false, mcpLog = null } = options;
	const customLog = mcpLog || {
		info: log.bind(null, 'info'),
		error: log.bind(null, 'error'),
		warn: log.bind(null, 'warn'),
		success: log.bind(null, 'success')
	};

	// Extract project root from the tasks path
	const projectRoot = tasksPath.replace(/[\\/]tasks[\\/]tasks\.json$/, '');

	customLog.info(`Starting task synchronization with ticketing system...`);

	// Get the configured ticketing system
	const ticketingSystem = getTicketingSystem(projectRoot);

	// Exit if no ticketing system or not enabled (unless force=true)
	if (!ticketingSystem) {
		customLog.warn(`No ticketing system configured.`);
		return { success: false, message: 'No ticketing system configured' };
	}

	if (!force && !getTicketingSystemEnabled(projectRoot)) {
		customLog.warn(`Ticketing system integration is not enabled.`);
		return {
			success: false,
			message: 'Ticketing system integration is not enabled'
		};
	}

	// Check if ticketing system is properly configured
	if (!ticketingSystem.isConfigured(projectRoot)) {
		customLog.warn(`Ticketing system is not properly configured.`);
		return {
			success: false,
			message: 'Ticketing system is not properly configured'
		};
	}

	// Statistics for reporting
	const stats = {
		tasksCreated: 0,
		subtasksCreated: 0,
		tasksUpdated: 0,
		subtasksUpdated: 0,
		errors: 0
	};

	try {
		// Read tasks data
		customLog.info(`Reading tasks from ${tasksPath}...`);
		const data = options.readJSON?.(tasksPath) || readJSON(tasksPath);

		if (!data || !Array.isArray(data)) {
			customLog.error(`Invalid tasks data in ${tasksPath}`);
			return { success: false, message: 'Error: Invalid tasks data' };
		}

		// Process each task
		for (const task of data) {
			try {
				// Get reference ID for the task
				const refId = getRefId(task);
				if (!refId) {
					customLog.warn(
						`Task ${task.id || 'unknown'} has no reference ID, skipping`
					);
					continue;
				}

				// Check if task already has a ticket ID
				let ticketId = ticketingSystem.getTicketId(task);

				// If no ticket ID in metadata, try to find it by reference ID
				if (!ticketId) {
					customLog.info(
						`No ticket ID found in metadata for task ${task.id}. Searching by reference ID ${refId}...`
					);
					ticketId = await ticketingSystem.findTicketByRefId(
						refId,
						projectRoot
					);

					if (ticketId) {
						customLog.success(
							`Found ticket ${ticketId} by reference ID ${refId}`
						);
						// Store the ticket ID in task metadata
						ticketingSystem.storeTicketId(task, ticketId);
						// Save the updated metadata
						options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
						stats.tasksUpdated++;
					}
				}

				// Create a new ticket if not found
				if (!ticketId) {
					customLog.info(
						`Creating new ticket for task ${task.id} (${refId})...`
					);
					try {
						const title = formatTitleForTicket(task);
						customLog.info(`Creating story with title: ${title}`);

						const result = await ticketingSystem.createStory(task, projectRoot);
						if (result) {
							ticketId = result.key || result.id;
							customLog.success(
								`Created ticket ${ticketId} for task ${task.id}`
							);

							// Store the ticket ID in task metadata
							ticketingSystem.storeTicketId(task, ticketId);
							// Save the updated metadata
							options.writeJSON?.(tasksPath, data) ||
								writeJSON(tasksPath, data);
							stats.tasksCreated++;
						}
					} catch (error) {
						customLog.error(
							`Failed to create ticket for task ${task.id}: ${error.message}`
						);
						stats.errors++;
					}
				}

				// Process subtasks if present
				if (task.subtasks && task.subtasks.length > 0 && ticketId) {
					customLog.info(
						`Processing ${task.subtasks.length} subtasks for task ${task.id}...`
					);

					for (const subtask of task.subtasks) {
						try {
							// Get reference ID for subtask
							const subtaskRefId = getRefId(subtask);
							if (!subtaskRefId) {
								customLog.warn(
									`Subtask ${subtask.id} has no reference ID, skipping`
								);
								continue;
							}

							// Check if subtask already has a ticket ID
							let subtaskTicketId = ticketingSystem.getTicketId(subtask);

							// If no ticket ID in metadata, try to find it by reference ID
							if (!subtaskTicketId) {
								customLog.info(
									`No ticket ID found in metadata for subtask ${subtask.id}. Searching by reference ID ${subtaskRefId}...`
								);
								subtaskTicketId = await ticketingSystem.findTicketByRefId(
									subtaskRefId,
									projectRoot
								);

								if (subtaskTicketId) {
									customLog.success(
										`Found ticket ${subtaskTicketId} by reference ID ${subtaskRefId}`
									);
									// Store the ticket ID in subtask metadata
									ticketingSystem.storeTicketId(subtask, subtaskTicketId);
									// Save the updated metadata
									options.writeJSON?.(tasksPath, data) ||
										writeJSON(tasksPath, data);
									stats.subtasksUpdated++;
								}
							}

							// Create a new subtask ticket if not found
							if (!subtaskTicketId) {
								customLog.info(
									`Creating new ticket for subtask ${subtask.id} (${subtaskRefId})...`
								);
								try {
									// Add parent info to subtask data
									const subtaskData = {
										...subtask,
										parentId: task.id,
										parentTicketId: ticketId,
										parentRefId: refId
									};

									const result = await ticketingSystem.createTask(
										subtaskData,
										ticketId,
										projectRoot
									);
									if (result) {
										subtaskTicketId = result.key || result.id;
										customLog.success(
											`Created ticket ${subtaskTicketId} for subtask ${subtask.id}`
										);

										// Store the ticket ID in subtask metadata
										ticketingSystem.storeTicketId(subtask, subtaskTicketId);
										// Save the updated metadata
										options.writeJSON?.(tasksPath, data) ||
											writeJSON(tasksPath, data);
										stats.subtasksCreated++;
									}
								} catch (error) {
									customLog.error(
										`Failed to create ticket for subtask ${subtask.id}: ${error.message}`
									);
									stats.errors++;
								}
							}
						} catch (subtaskError) {
							customLog.error(
								`Error processing subtask ${subtask.id}: ${subtaskError.message}`
							);
							stats.errors++;
						}
					}
				}
			} catch (taskError) {
				customLog.error(
					`Error processing task ${task.id || 'unknown'}: ${taskError.message}`
				);
				stats.errors++;
			}
		}

		// Save the final data
		options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);

		// Return success with statistics
		const message = `Synchronization complete: ${stats.tasksCreated} tasks created, ${stats.subtasksCreated} subtasks created, ${stats.tasksUpdated} tasks updated, ${stats.subtasksUpdated} subtasks updated, ${stats.errors} errors`;
		customLog.success(message);

		return {
			success: true,
			stats,
			message
		};
	} catch (error) {
		customLog.error(`Synchronization error: ${error.message}`);
		return {
			success: false,
			stats,
			message: `Error: ${error.message}`
		};
	}
}

export { syncTickets };
