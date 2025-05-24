import path from 'path';

import { log, readJSON, writeJSON } from '../utils.js';
import { isTaskDependentOn } from '../task-manager.js';
import generateTaskFiles from './generate-task-files.js';
import { generateSubtaskRefId, storeRefId } from '../ticketing/utils/id-utils.js';
import ticketingSyncService from '../ticketing/ticketing-sync-service.js';

/**
 * Add a subtask to a parent task
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {number|string} parentId - ID of the parent task
 * @param {number|string|null} existingTaskId - ID of an existing task to convert to subtask (optional)
 * @param {Object} newSubtaskData - Data for creating a new subtask (used if existingTaskId is null)
 * @param {boolean} generateFiles - Whether to regenerate task files after adding the subtask
 * @param {Object} context - Additional context including projectRoot
 * @returns {Object} The newly created or converted subtask
 */
async function addSubtask(
	tasksPath,
	parentId,
	existingTaskId = null,
	newSubtaskData = null,
	generateFiles = true,
	context = {}
) {
	try {
		log('info', `Adding subtask to parent task ${parentId}...`);

		// Read the existing tasks
		const data = readJSON(tasksPath);
		if (!data || !data.tasks) {
			throw new Error(`Invalid or missing tasks file at ${tasksPath}`);
		}

		// Convert parent ID to number
		const parentIdNum = parseInt(parentId, 10);

		// Find the parent task
		const parentTask = data.tasks.find((t) => t.id === parentIdNum);
		if (!parentTask) {
			throw new Error(`Parent task with ID ${parentIdNum} not found`);
		}

		// Initialize subtasks array if it doesn't exist
		if (!parentTask.subtasks) {
			parentTask.subtasks = [];
		}

		let newSubtask;

		// Case 1: Convert an existing task to a subtask
		if (existingTaskId !== null) {
			const existingTaskIdNum = parseInt(existingTaskId, 10);

			// Find the existing task
			const existingTaskIndex = data.tasks.findIndex(
				(t) => t.id === existingTaskIdNum
			);
			if (existingTaskIndex === -1) {
				throw new Error(`Task with ID ${existingTaskIdNum} not found`);
			}

			const existingTask = data.tasks[existingTaskIndex];

			// Check if task is already a subtask
			if (existingTask.parentTaskId) {
				throw new Error(
					`Task ${existingTaskIdNum} is already a subtask of task ${existingTask.parentTaskId}`
				);
			}

			// Check for circular dependency
			if (existingTaskIdNum === parentIdNum) {
				throw new Error(`Cannot make a task a subtask of itself`);
			}

			// Check if parent task is a subtask of the task we're converting
			// This would create a circular dependency
			if (isTaskDependentOn(data.tasks, parentTask, existingTaskIdNum)) {
				throw new Error(
					`Cannot create circular dependency: task ${parentIdNum} is already a subtask or dependent of task ${existingTaskIdNum}`
				);
			}

			// Find the highest subtask ID to determine the next ID
			const highestSubtaskId =
				parentTask.subtasks.length > 0
					? Math.max(...parentTask.subtasks.map((st) => st.id))
					: 0;
			const newSubtaskId = highestSubtaskId + 1;

			// Clone the existing task to be converted to a subtask
			newSubtask = {
				...existingTask,
				id: newSubtaskId,
				parentTaskId: parentIdNum
			};

			// Generate refId for the converted subtask
			const refId = generateSubtaskRefId(parentIdNum, newSubtaskId, true); // Always generate refId
			if (refId) {
				newSubtask = storeRefId(newSubtask, refId);
				log('info', `Generated reference ID ${refId} for converted subtask ${parentIdNum}.${newSubtaskId}`);
			}

			// Add to parent's subtasks
			parentTask.subtasks.push(newSubtask);

			// Remove the task from the main tasks array
			data.tasks.splice(existingTaskIndex, 1);

			log(
				'info',
				`Converted task ${existingTaskIdNum} to subtask ${parentIdNum}.${newSubtaskId}`
			);
		}
		// Case 2: Create a new subtask
		else if (newSubtaskData) {
			// Find the highest subtask ID to determine the next ID
			const highestSubtaskId =
				parentTask.subtasks.length > 0
					? Math.max(...parentTask.subtasks.map((st) => st.id))
					: 0;
			const newSubtaskId = highestSubtaskId + 1;

			// Create the new subtask object
			newSubtask = {
				id: newSubtaskId,
				title: newSubtaskData.title,
				description: newSubtaskData.description || '',
				details: newSubtaskData.details || '',
				status: newSubtaskData.status || 'pending',
				dependencies: newSubtaskData.dependencies || [],
				metadata: {}, // Initialize with empty metadata object to ensure refId can be stored
				parentTaskId: parentIdNum
			};

			// Generate refId for the new subtask
			const refId = generateSubtaskRefId(parentIdNum, newSubtaskId, true); // Always generate refId
			if (refId) {
				newSubtask = storeRefId(newSubtask, refId);
				log('info', `Generated reference ID ${refId} for new subtask ${parentIdNum}.${newSubtaskId}`);
			}

			// Add to parent's subtasks
			parentTask.subtasks.push(newSubtask);

			log('info', `Created new subtask ${parentIdNum}.${newSubtaskId}`);
		} else {
			throw new Error(
				'Either existingTaskId or newSubtaskData must be provided'
			);
		}

		// Write the updated tasks back to the file
		writeJSON(tasksPath, data);

		// Direct ticketing integration
		// Use the EXACT same pattern as add-task which works successfully
		const { projectRoot } = context;
		if (projectRoot) {
			let ticketingResult = null;
			try {
				// Create a task-like object for the subtask that can use syncTask
				const subtaskAsTask = {
					...newSubtask,
					title: `[Subtask] ${newSubtask.title}`, // Prefix to indicate it's a subtask
					description: `${newSubtask.description}\n\nParent Task: Task #${parentIdNum}`,
					// Keep the subtask ID structure for tracking
					metadata: newSubtask.metadata || {}
				};

				// Use syncTask (which works) instead of syncSubtask (which doesn't)
				console.log(`[ADD-SUBTASK] Calling syncTask for subtask ${parentIdNum}.${newSubtask.id} with projectRoot: ${projectRoot}`);
				ticketingResult = await ticketingSyncService.syncTask(subtaskAsTask, tasksPath, projectRoot);
				console.log(`[ADD-SUBTASK] syncTask result:`, ticketingResult);
				
				if (ticketingResult.success) {
					// Update the original subtask with the ticket key
					newSubtask.metadata = newSubtask.metadata || {};
					newSubtask.metadata.jiraKey = ticketingResult.ticketKey;
					
					// Update the subtask in the file
					const updatedData = readJSON(tasksPath);
					const updatedParentTask = updatedData.tasks.find((t) => t.id === parentIdNum);
					if (updatedParentTask && updatedParentTask.subtasks) {
						const subtaskIndex = updatedParentTask.subtasks.findIndex(st => st.id === newSubtask.id);
						if (subtaskIndex !== -1) {
							updatedParentTask.subtasks[subtaskIndex] = newSubtask;
							writeJSON(tasksPath, updatedData);
						}
					}
					
					log('success', `Created ticket ${ticketingResult.ticketKey} for subtask ${parentIdNum}.${newSubtask.id}`);
				} else if (ticketingResult.error !== 'Ticketing service not available') {
					// Only warn if it's not just disabled ticketing
					log('warn', `Warning: Could not create ticket for subtask ${parentIdNum}.${newSubtask.id}: ${ticketingResult.error}`);
				}
			} catch (ticketingError) {
				log('warn', `Warning: Ticketing integration error for subtask ${parentIdNum}.${newSubtask.id}: ${ticketingError.message}`);
			}
		}

		// Generate task files if requested
		if (generateFiles) {
			log('info', 'Regenerating task files...');
			await generateTaskFiles(tasksPath, path.dirname(tasksPath));
		}

		log('success', `Subtask ${parentIdNum}.${newSubtask.id} created successfully${context.projectRoot ? '' : '. Use \'task-master sync-tickets\' to sync with ticketing system if needed'}.`);

		return newSubtask;
	} catch (error) {
		log('error', `Error adding subtask: ${error.message}`);
		throw error;
	}
}

export default addSubtask;
