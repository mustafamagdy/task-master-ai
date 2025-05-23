/**
 * ticket-status-updater.js
 * Handles updating ticket status in ticketing systems
 */

import { log, findTaskById, findProjectRoot } from '../../utils.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Update a task status in the connected ticketing system
 * @param {string} taskId - Task ID to update
 * @param {string} newStatus - New status
 * @param {Object} data - Tasks data object
 * @param {string} tasksPath - Path to tasks.json file
 */
export async function updateTicketStatus(taskId, newStatus, data, tasksPath) {
	try {
		const projectRoot = findProjectRoot();

		// Find the task by ID
		const task = findTaskById(data.tasks, taskId);
		if (!task) {
			log(
				'warn',
				`Task ${taskId} not found. Skipping ticketing system update.`
			);
			return;
		}

		// Get the ticketing system instance with explicit project root
		const ticketing = await getTicketingInstance(null, projectRoot);
		if (!ticketing) {
			log('warn', 'No ticketing system available. Skipping update.');
			return;
		}

		// Check if the task has a ticket ID in its metadata
		const ticketId = ticketing.getTicketId(task);
		if (ticketId) {
			log(
				'info',
				`Updating task ${taskId} with ticket ${ticketId} to status: ${newStatus}`
			);

			// Update the ticket status
			const success = await ticketing.updateTicketStatus(
				ticketId,
				newStatus,
				null,
				task
			);

			if (!success) {
				log(
					'warn',
					`Failed to update ticketing system issue ${ticketId} status for task ${taskId}`
				);
			} else {
				log(
					'success',
					`Successfully updated ticketing system issue ${ticketId} for task ${taskId}`
				);
			}
		} else {
			log(
				'info',
				`No ticket ID found for task ${taskId}. Skipping ticketing update.`
			);
		}

		// Update subtasks if they exist
		if (task.subtasks && task.subtasks.length > 0) {
			log(
				'info',
				`Cascading status update to ${task.subtasks.length} subtasks of task ${taskId}...`
			);
			for (const subtask of task.subtasks) {
				const subtaskTicketId = ticketing.getTicketId(subtask);
				if (subtaskTicketId) {
					log(
						'info',
						`Updating subtask ${subtask.id} with ticket ${subtaskTicketId} to status: ${newStatus}`
					);
					try {
						const subtaskSuccess = await ticketing.updateTicketStatus(
							subtaskTicketId,
							newStatus,
							null,
							subtask
						);

						if (!subtaskSuccess) {
							log(
								'warn',
								`Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`
							);
						} else {
							log(
								'success',
								`Successfully updated ticketing system issue ${subtaskTicketId} for subtask ${subtask.id}`
							);
						}
					} catch (ticketError) {
						log(
							'error',
							`Error updating ticketing system issue status for subtask ${subtask.id}: ${ticketError.message}`
						);
					}
				} else {
					log(
						'info',
						`No ticket ID found for subtask ${subtask.id}. Skipping ticketing update.`
					);
				}
			}
		}
	} catch (error) {
		log('error', `Error updating ticketing system status: ${error.message}`);
	}
}
