/**
 * Direct function wrapper for addSubtask
 */

import { addSubtask } from '../../../../scripts/modules/task-manager.js';
import {
	enableSilentMode,
	disableSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
// Note: Subtask ticket creation is handled directly by the unified ticketing service

/**
 * Add a subtask to an existing task
 * @param {Object} args - Function arguments
 * @param {string} args.tasksJsonPath - Explicit path to the tasks.json file.
 * @param {string} args.id - Parent task ID
 * @param {string} [args.taskId] - Existing task ID to convert to subtask (optional)
 * @param {string} [args.title] - Title for new subtask (when creating a new subtask)
 * @param {string} [args.description] - Description for new subtask
 * @param {string} [args.details] - Implementation details for new subtask
 * @param {string} [args.dependencies] - Comma-separated list of dependency IDs for the new subtask
 * @param {string} [args.status='pending'] - Status for new subtask
 * @param {boolean} [args.skipGenerate=false] - Skip regenerating task files
 * @param {string} [args.projectRoot] - Project root path
 * @param {Object} log - Logger object
 * @param {Object} context - Additional context object
 * @returns {Promise<Object>} Result object with success flag and data or error
 */
export async function addSubtaskDirect(args, log, context = {}) {
	// Extract arguments
	const {
		tasksJsonPath,
		id,
		taskId,
		title,
		description,
		details,
		dependencies,
		status = 'pending',
		skipGenerate = false,
		projectRoot
	} = args;
	const { session } = context;

	// Enable silent mode to suppress console output
	enableSilentMode();

	// Create logger wrapper
	const mcpLog = createLogWrapper(log);

	try {
		// Validate required arguments
		if (!tasksJsonPath) {
			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'MISSING_ARGUMENT',
					message: 'tasksJsonPath is required'
				}
			};
		}

		if (!id) {
			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'MISSING_ARGUMENT',
					message: 'Parent task ID is required'
				}
			};
		}

		// Convert dependencies string to array if needed
		const dependencyArray = dependencies
			? dependencies.split(',').map((dep) => parseInt(dep.trim(), 10))
			: [];

		let result;

		// Call the core addSubtask function
		if (taskId) {
			// Converting existing task to subtask
			result = await addSubtask(
				tasksJsonPath,
				id,
				taskId, // existingTaskId
				null, // newSubtaskData
				!skipGenerate, // generateFiles
				{ projectRoot } // Pass context with projectRoot for ticketing integration
			);
		} else {
			// Creating new subtask
			const newSubtaskData = {
				title: title || '',
				description: description || '',
				details: details || '',
				dependencies: dependencyArray,
				status
			};

			result = await addSubtask(
				tasksJsonPath,
				id,
				null, // existingTaskId
				newSubtaskData, // newSubtaskData
				!skipGenerate, // generateFiles
				{ projectRoot } // Pass context with projectRoot for ticketing integration
			);
		}

		// Subtask creation completed - ticketing integration handled directly
		log.info(
			`Subtask ${id}.${result.id} created successfully with direct ticketing integration.`
		);

		// Restore normal logging
		disableSilentMode();

		// Return successful result
		return {
			success: true,
			data: {
				subtask: result,
				message: `Successfully added subtask ${id}.${result.id}`
			}
		};
	} catch (error) {
		// Restore normal logging on error
		disableSilentMode();

		log.error(`Error in addSubtaskDirect: ${error.message}`);

		return {
			success: false,
			error: {
				code: error.code || 'ADD_SUBTASK_ERROR',
				message: error.message
			}
		};
	}
}
