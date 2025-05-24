import fs from 'fs';
import path from 'path';

import { log, readJSON, writeJSON } from '../utils.js';
import generateTaskFiles from './generate-task-files.js';
import taskExists from './task-exists.js';
import ticketingSyncService from '../ticketing/ticketing-sync-service.js';

/**
 * Removes one or more tasks or subtasks from the tasks file
 * @param {string} tasksPath - Path to the tasks file
 * @param {string} taskIds - Comma-separated string of task/subtask IDs to remove (e.g., '5,6.1,7')
 * @param {string} projectRoot - Project root directory for ticketing integration
 * @returns {Object} Result object with success status, messages, and removed task info
 */
async function removeTask(tasksPath, taskIds, projectRoot = null) {
	const results = {
		success: true,
		messages: [],
		errors: [],
		removedTasks: []
	};
	const taskIdsToRemove = taskIds
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean); // Remove empty strings if any

	if (taskIdsToRemove.length === 0) {
		results.success = false;
		results.errors.push('No valid task IDs provided.');
		return results;
	}

	try {
		// Read task data
		const data = readJSON(tasksPath);
		if (!data || !data.tasks || !Array.isArray(data.tasks)) {
			results.success = false;
			results.errors.push('Invalid task data in file.');
			return results;
		}

		// Track task IDs to delete files for
		const tasksToDeleteFiles = [];

		// Process each task ID
		for (const taskId of taskIdsToRemove) {
			try {
				// Validate task existence
				const exists = await taskExists(tasksPath, taskId);
				if (!exists) {
					throw new Error(`Task with ID ${taskId} not found`);
				}

				// Handle subtask removal
				if (taskId.includes('.')) {
					// Split to get parent ID and subtask ID
					const [parentIdStr, subtaskIdStr] = taskId.split('.');
					const parentId = parseInt(parentIdStr, 10);
					const subtaskId = parseInt(subtaskIdStr, 10);

					// Find parent task
					const parentTask = data.tasks.find((t) => t.id === parentId);
					if (!parentTask || !parentTask.subtasks) {
						throw new Error(`Parent task with ID ${parentId} not found`);
					}

					// Find subtask index
					const subtaskIndex = parentTask.subtasks.findIndex(
						(st) => st.id === subtaskId
					);
					if (subtaskIndex === -1) {
						throw new Error(
							`Subtask with ID ${subtaskId} not found in parent task ${parentId}`
						);
					}

					// Store subtask for return
					const removedSubtask = parentTask.subtasks[subtaskIndex];
					results.removedTasks.push({
						...removedSubtask,
						parentTaskId: parentId
					});

					// Remove the subtask from parent
					parentTask.subtasks.splice(subtaskIndex, 1);

					// Delete ticket for the removed subtask (ticketing integration)
					if (projectRoot) {
						try {
							// Get ticket ID from the subtask
							const subtask = removedSubtask;
							const ticketId = subtask.metadata?.jiraKey;
							
							if (ticketId) {
								const ticketingResult = await ticketingSyncService.deleteTicket(
									ticketId,
									tasksPath,
									projectRoot
								);
								
								if (ticketingResult.success) {
									log(
										'info',
										`Deleted ticket ${ticketId} for removed subtask ${taskId}`
									);
								} else if (
									ticketingResult.error !== 'Ticketing service not available'
								) {
									// Only warn if it's not just disabled ticketing
									log(
										'warn',
										`Warning: Could not delete ticket for removed subtask ${taskId}: ${ticketingResult.error}`
									);
								}
							} else {
								log(
									'debug',
									`Subtask ${taskId} does not have an associated ticket, skipping deletion`
								);
							}
						} catch (ticketingError) {
							log(
								'warn',
								`Warning: Could not delete ticket for removed subtask ${taskId}: ${ticketingError.message}`
							);
						}
					}

					results.messages.push(`Successfully removed subtask ${taskId}`);
				}
				// Handle main task removal
				else {
					const taskIdNum = parseInt(taskId, 10);
					const taskIndex = data.tasks.findIndex((t) => t.id === taskIdNum);
					if (taskIndex === -1) {
						// This case should theoretically be caught by the taskExists check above,
						// but keep it as a safeguard.
						throw new Error(`Task with ID ${taskId} not found`);
					}

					// Store the task info before removal
					const removedTask = data.tasks[taskIndex];
					results.removedTasks.push(removedTask);
					tasksToDeleteFiles.push(taskIdNum); // Add to list for file deletion

					// Remove the task from the main array
					data.tasks.splice(taskIndex, 1);

					// Delete ticket for the removed task (ticketing integration)
					if (projectRoot) {
						try {
							// Get ticket ID from the task
							const task = removedTask;
							const ticketId = task.metadata?.jiraKey;
							
							if (ticketId) {
								const ticketingResult = await ticketingSyncService.deleteTicket(
									ticketId,
									tasksPath,
									projectRoot
								);
								
								if (ticketingResult.success) {
									log(
										'info',
										`Deleted ticket ${ticketId} for removed task ${taskId}`
									);
								} else if (
									ticketingResult.error !== 'Ticketing service not available'
								) {
									// Only warn if it's not just disabled ticketing
									log(
										'warn',
										`Warning: Could not delete ticket for removed task ${taskId}: ${ticketingResult.error}`
									);
								}
							} else {
								log(
									'debug',
									`Task ${taskId} does not have an associated ticket, skipping deletion`
								);
							}
							
							// If the task has subtasks with tickets, delete those too
							if (task.subtasks && task.subtasks.length > 0) {
								for (const subtask of task.subtasks) {
									const subtaskTicketId = subtask.metadata?.jiraKey;
									if (subtaskTicketId) {
										try {
											const subtaskResult = await ticketingSyncService.deleteTicket(
												subtaskTicketId,
												tasksPath,
												projectRoot
											);
											if (subtaskResult.success) {
												log(
													'info',
													`Deleted ticket ${subtaskTicketId} for subtask ${taskId}.${subtask.id}`
												);
											}
										} catch (subtaskError) {
											log(
												'warn',
												`Warning: Could not delete ticket for subtask ${taskId}.${subtask.id}: ${subtaskError.message}`
											);
										}
									}
								}
							}
						} catch (ticketingError) {
							log(
								'warn',
								`Warning: Could not delete ticket for removed task ${taskId}: ${ticketingError.message}`
							);
						}
					}

					results.messages.push(`Successfully removed task ${taskId}`);
				}
			} catch (innerError) {
				// Catch errors specific to processing *this* ID
				const errorMsg = `Error processing ID ${taskId}: ${innerError.message}`;
				results.errors.push(errorMsg);
				results.success = false;
				log('warn', errorMsg); // Log as warning and continue with next ID
			}
		}

		// Only write file and regenerate if there were no errors or some successful removals
		if (results.success || results.messages.length > 0) {
			// Write updated data back to file
			writeJSON(tasksPath, data);

			// Delete task files for removed tasks
			for (const taskId of tasksToDeleteFiles) {
				const taskFilePath = path.join(
					path.dirname(tasksPath),
					`task_${taskId.toString().padStart(3, '0')}.txt`
				);
				if (fs.existsSync(taskFilePath)) {
					try {
						fs.unlinkSync(taskFilePath);
						log('info', `Deleted task file: ${taskFilePath}`);
					} catch (fileError) {
						log('warn', `Warning: Could not delete file: ${fileError.message}`);
					}
				}
			}

			// Regenerate task files
			try {
				const outputDir = path.dirname(tasksPath);
				await generateTaskFiles(tasksPath, outputDir);
			} catch (genError) {
				log('error', `Error regenerating task files: ${genError.message}`);
				// Don't fail the operation because of file generation error
			}
		}

		return results;
	} catch (error) {
		results.success = false;
		results.errors.push(`Error removing task(s): ${error.message}`);
		return results;
	}
}

export default removeTask;
