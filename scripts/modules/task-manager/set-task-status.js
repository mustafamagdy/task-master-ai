import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';

import { log, readJSON, writeJSON, findTaskById } from '../utils.js';
import { displayBanner } from '../ui.js';
import { validateTaskDependencies } from '../dependency-manager.js';
import { getDebugFlag, getTicketingIntegrationEnabled } from '../config-manager.js';
import { getTicketingInstance } from '../ticketing/ticketing-factory.js';
import updateSingleTaskStatus from './update-single-task-status.js';
import generateTaskFiles from './generate-task-files.js';

/**
 * Updates a task status in the connected ticketing system
 * @param {string} taskId - Task ID to update
 * @param {string} newStatus - New status
 * @param {Object} data - Tasks data object
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Additional options
 */
async function updateTicketStatus(
	taskId,
	newStatus,
	data,
	tasksPath,
	options = {}
) {
	try {
		// Find the task by ID
		const task = findTaskById(data.tasks, taskId);
		if (!task) {
			log(
				'warn',
				`Task ${taskId} not found. Skipping ticketing system update.`
			);
			return;
		}

		// Get the ticketing system instance (currently only Jira is supported)
		const ticketing = await getTicketingInstance('jira');

		// Check if the task has a ticket ID in its metadata
		const ticketId = ticketing.getTicketId(task);
		if (ticketId) {
			log(
				'info',
				`Updating ticketing system issue ${ticketId} status to ${newStatus}...`
			);

			// Update the ticket status
			const success = await ticketing.updateTicketStatus(
				ticketId,
				newStatus,
				null,
				task
			);
			if (success) {
				log(
					'success',
					`Updated ticketing system issue ${ticketId} status for task ${taskId}`
				);
			} else {
				log(
					'warn',
					`Failed to update ticketing system issue ${ticketId} status for task ${taskId}`
				);
			}
		} else {
			log(
				'info',
				`No ticketing system issue found for task ${taskId}. Skipping status update.`
			);
		}

		// Update subtasks if they exist
		if (task.subtasks && task.subtasks.length > 0) {
			for (const subtask of task.subtasks) {
				const subtaskTicketId = ticketing.getTicketId(subtask);
				if (subtaskTicketId) {
					log(
						'info',
						`Updating ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}...`
					);
					try {
						const subtaskSuccess = await ticketing.updateTicketStatus(
							subtaskTicketId,
							newStatus,
							null,
							subtask
						);

						if (subtaskSuccess) {
							log(
								'success',
								`Updated ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`
							);
						} else {
							log(
								'warn',
								`Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`
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
						`No ticketing system issue found for subtask ${subtask.id}. Skipping status update.`
					);
				}
			}
		}
	} catch (error) {
		log('error', `Error updating ticketing system status: ${error.message}`);
	}
}
import {
	isValidTaskStatus,
	TASK_STATUS_OPTIONS
} from '../../../src/constants/task-status.js';

/**
 * Set the status of a task
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {string} taskIdInput - Task ID(s) to update
 * @param {string} newStatus - New status
 * @param {Object} options - Additional options (mcpLog for MCP mode)
 * @returns {Object|undefined} Result object in MCP mode, undefined in CLI mode
 */
async function setTaskStatus(tasksPath, taskIdInput, newStatus, options = {}) {
	try {
		if (!isValidTaskStatus(newStatus)) {
			throw new Error(
				`Error: Invalid status value: ${newStatus}. Use one of: ${TASK_STATUS_OPTIONS.join(', ')}`
			);
		}
		// Determine if we're in MCP mode by checking for mcpLog
		const isMcpMode = !!options?.mcpLog;

		// Only display UI elements if not in MCP mode
		if (!isMcpMode) {
			displayBanner();

			console.log(
				boxen(chalk.white.bold(`Updating Task Status to: ${newStatus}`), {
					padding: 1,
					borderColor: 'blue',
					borderStyle: 'round'
				})
			);
		}

		log('info', `Reading tasks from ${tasksPath}...`);
		const data = readJSON(tasksPath);
		if (!data || !data.tasks) {
			throw new Error(`No valid tasks found in ${tasksPath}`);
		}

		// Handle multiple task IDs (comma-separated)
		const taskIds = taskIdInput.split(',').map((id) => id.trim());
		const updatedTasks = [];

		// Update each task
		for (const id of taskIds) {
			await updateSingleTaskStatus(tasksPath, id, newStatus, data, !isMcpMode);
			updatedTasks.push(id);

			// Update ticketing system issues if integration is enabled
			// Check if Jira is enabled (will be replaced with more generic check in the future)
			if (getTicketingIntegrationEnabled()) {
				await updateTicketStatus(id, newStatus, data, tasksPath, {
					...options,
					writeJSON
				});
			}
		}

		// Write the updated tasks to the file
		writeJSON(tasksPath, data);

		// Validate dependencies after status update
		log('info', 'Validating dependencies after status update...');
		validateTaskDependencies(data.tasks);

		// Generate individual task files
		log('info', 'Regenerating task files...');
		await generateTaskFiles(tasksPath, path.dirname(tasksPath), {
			mcpLog: options.mcpLog
		});

		// Display success message - only in CLI mode
		if (!isMcpMode) {
			for (const id of updatedTasks) {
				const task = findTaskById(data.tasks, id);
				const taskName = task ? task.title : id;

				console.log(
					boxen(
						chalk.white.bold(`Successfully updated task ${id} status:`) +
							'\n' +
							`From: ${chalk.yellow(task ? task.status : 'unknown')}\n` +
							`To:   ${chalk.green(newStatus)}`,
						{ padding: 1, borderColor: 'green', borderStyle: 'round' }
					)
				);
			}
		}

		// Return success value for programmatic use
		return {
			success: true,
			updatedTasks: updatedTasks.map((id) => ({
				id,
				status: newStatus
			}))
		};
	} catch (error) {
		log('error', `Error setting task status: ${error.message}`);

		// Only show error UI in CLI mode
		if (!options?.mcpLog) {
			console.error(chalk.red(`Error: ${error.message}`));

			// Pass session to getDebugFlag
			if (getDebugFlag(options?.session)) {
				// Use getter
				console.error(error);
			}

			process.exit(1);
		} else {
			// In MCP mode, throw the error for the caller to handle
			throw error;
		}
	}
}

export default setTaskStatus;
