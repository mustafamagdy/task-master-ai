import path from 'path';
import { log, readJSON, writeJSON } from '../utils.js';
import generateTaskFiles from './generate-task-files.js';
import ticketingSyncService from '../ticketing/ticketing-sync-service.js';

/**
 * Remove a subtask from its parent task
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {string} subtaskId - ID of the subtask to remove in format "parentId.subtaskId"
 * @param {boolean} convertToTask - Whether to convert the subtask to a standalone task
 * @param {boolean} generateFiles - Whether to regenerate task files after removing the subtask
 * @param {string} projectRoot - Project root path (for ticketing integration)
 * @returns {Object|null} The removed subtask if convertToTask is true, otherwise null
 */
async function removeSubtask(
	tasksPath,
	subtaskId,
	convertToTask = false,
	generateFiles = true,
	projectRoot = null
) {
	try {
		log('info', `Removing subtask ${subtaskId}...`);

		// Read the existing tasks
		const data = readJSON(tasksPath);
		if (!data || !data.tasks) {
			throw new Error(`Invalid or missing tasks file at ${tasksPath}`);
		}

		// Parse the subtask ID (format: "parentId.subtaskId")
		if (!subtaskId.includes('.')) {
			throw new Error(
				`Invalid subtask ID format: ${subtaskId}. Expected format: "parentId.subtaskId"`
			);
		}

		const [parentIdStr, subtaskIdStr] = subtaskId.split('.');
		const parentId = parseInt(parentIdStr, 10);
		const subtaskIdNum = parseInt(subtaskIdStr, 10);

		// Find the parent task
		const parentTask = data.tasks.find((t) => t.id === parentId);
		if (!parentTask) {
			throw new Error(`Parent task with ID ${parentId} not found`);
		}

		// Check if parent has subtasks
		if (!parentTask.subtasks || parentTask.subtasks.length === 0) {
			throw new Error(`Parent task ${parentId} has no subtasks`);
		}

		// Find the subtask to remove
		const subtaskIndex = parentTask.subtasks.findIndex(
			(st) => st.id === subtaskIdNum
		);
		if (subtaskIndex === -1) {
			throw new Error(`Subtask ${subtaskId} not found`);
		}

		// Get a copy of the subtask before removing it
		const removedSubtask = { ...parentTask.subtasks[subtaskIndex] };

		// Remove the subtask from the parent
		parentTask.subtasks.splice(subtaskIndex, 1);

		// If parent has no more subtasks, remove the subtasks array
		if (parentTask.subtasks.length === 0) {
			delete parentTask.subtasks;
		}

		// Update ticket status to cancelled for the removed subtask (ticketing integration)
		if (projectRoot) {
			try {
				// Get the ticket ID if it exists
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
							`Deleted ticket ${ticketId} for removed subtask ${subtaskId}`
						);
					} else if (
						ticketingResult.error !== 'Ticketing service not available'
					) {
						// Only warn if it's not just disabled ticketing
						log(
							'warn',
							`Warning: Could not delete ticket for removed subtask ${subtaskId}: ${ticketingResult.error}`
						);
					}
				} else {
					log(
						'debug',
						`Subtask ${subtaskId} does not have an associated ticket, skipping deletion`
					);
				}
			} catch (ticketingError) {
				log(
					'warn',
					`Warning: Could not delete ticket for removed subtask ${subtaskId}: ${ticketingError.message}`
				);
			}
		}

		let convertedTask = null;

		// Convert the subtask to a standalone task if requested
		if (convertToTask) {
			log('info', `Converting subtask ${subtaskId} to a standalone task...`);

			// Find the highest task ID to determine the next ID
			const highestId = Math.max(...data.tasks.map((t) => t.id));
			const newTaskId = highestId + 1;

			// Create the new task from the subtask
			convertedTask = {
				id: newTaskId,
				title: removedSubtask.title,
				description: removedSubtask.description || '',
				details: removedSubtask.details || '',
				status: removedSubtask.status || 'pending',
				dependencies: removedSubtask.dependencies || [],
				priority: parentTask.priority || 'medium' // Inherit priority from parent
			};

			// Add the parent task as a dependency if not already present
			if (!convertedTask.dependencies.includes(parentId)) {
				convertedTask.dependencies.push(parentId);
			}

			// Add the converted task to the tasks array
			data.tasks.push(convertedTask);

			log('info', `Created new task ${newTaskId} from subtask ${subtaskId}`);

			// Create ticket for the converted task (ticketing integration)
			if (projectRoot) {
				try {
					const ticketingResult = await ticketingSyncService.syncTask(
						convertedTask,
						tasksPath,
						projectRoot
					);
					if (ticketingResult.success) {
						log(
							'info',
							`Created ticket ${ticketingResult.ticketKey} for converted task ${convertedTask.id}`
						);
					} else if (
						ticketingResult.error !== 'Ticketing service not available'
					) {
						// Only warn if it's not just disabled ticketing
						log(
							'warn',
							`Warning: Could not create ticket for converted task ${convertedTask.id}: ${ticketingResult.error}`
						);
					}
				} catch (ticketingError) {
					log(
						'warn',
						`Warning: Could not create ticket for converted task ${convertedTask.id}: ${ticketingError.message}`
					);
				}
			}
		} else {
			log('info', `Subtask ${subtaskId} deleted`);
		}

		// Write the updated tasks back to the file
		writeJSON(tasksPath, data);

		// Generate task files if requested
		if (generateFiles) {
			log('info', 'Regenerating task files...');
			try {
				const outputDir = path.dirname(tasksPath);
				await generateTaskFiles(tasksPath, outputDir);
			} catch (genError) {
				log('error', `Error regenerating task files: ${genError.message}`);
				// Don't fail the operation because of file generation error
			}
		}

		return convertedTask;
	} catch (error) {
		log('error', `Error removing subtask: ${error.message}`);
		throw error;
	}
}

export default removeSubtask;
