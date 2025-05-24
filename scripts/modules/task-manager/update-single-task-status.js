import chalk from 'chalk';

import { log } from '../utils.js';
import {
	isValidTaskStatus,
	TASK_STATUS_OPTIONS
} from '../../../src/constants/task-status.js';
import { emit, EVENT_TYPES } from '../events/event-emitter.js';

/**
 * Update the status of a single task
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {string} taskIdInput - Task ID to update
 * @param {string} newStatus - New status
 * @param {Object} data - Tasks data
 * @param {boolean} showUi - Whether to show UI elements
 */
async function updateSingleTaskStatus(
	tasksPath,
	taskIdInput,
	newStatus,
	data,
	showUi = true
) {
	if (!isValidTaskStatus(newStatus)) {
		throw new Error(
			`Error: Invalid status value: ${newStatus}. Use one of: ${TASK_STATUS_OPTIONS.join(', ')}`
		);
	}

	// Check if it's a subtask (e.g., "1.2")
	if (taskIdInput.includes('.')) {
		const [parentId, subtaskId] = taskIdInput
			.split('.')
			.map((id) => parseInt(id, 10));

		// Find the parent task
		const parentTask = data.tasks.find((t) => t.id === parentId);
		if (!parentTask) {
			throw new Error(`Parent task ${parentId} not found`);
		}

		// Find the subtask
		if (!parentTask.subtasks) {
			throw new Error(`Parent task ${parentId} has no subtasks`);
		}

		const subtask = parentTask.subtasks.find((st) => st.id === subtaskId);
		if (!subtask) {
			throw new Error(
				`Subtask ${subtaskId} not found in parent task ${parentId}`
			);
		}

		// Update the subtask status
		const oldStatus = subtask.status || 'pending';
		subtask.status = newStatus;

		// Add timestamp of this update
		if (!subtask.metadata) subtask.metadata = {};
		subtask.metadata.lastStatusUpdate = new Date().toISOString();

		log(
			'info',
			`Updated subtask ${parentId}.${subtaskId} status from '${oldStatus}' to '${newStatus}'`
		);

		// Emit subtask status changed event
		// Use the actual subtask object, not just the ID
		emit(EVENT_TYPES.SUBTASK_STATUS_CHANGED, {
			taskId: parentId,
			subtaskId: subtask.id, // Keep the original ID as stored in the subtask
			subtask, // Pass the actual subtask object
			newStatus,
			oldStatus,
			data,
			tasksPath
		});

		// Check if all subtasks are done (if setting to 'done')
		if (
			newStatus.toLowerCase() === 'done' ||
			newStatus.toLowerCase() === 'completed'
		) {
			const allSubtasksDone = parentTask.subtasks.every(
				(st) => st.status === 'done' || st.status === 'completed'
			);

			// Suggest updating parent task if all subtasks are done
			if (
				allSubtasksDone &&
				parentTask.status !== 'done' &&
				parentTask.status !== 'completed'
			) {
				// Only show suggestion in CLI mode
				if (showUi) {
					console.log(
						chalk.yellow(
							`All subtasks of parent task ${parentId} are now marked as done.`
						)
					);
					console.log(
						chalk.yellow(
							`Consider updating the parent task status with: task-master set-status --id=${parentId} --status=done`
						)
					);
				}
			}
		}
	} else {
		// Handle regular task
		let taskId = parseInt(taskIdInput, 10);
		const task = data.tasks.find((t) => t.id === taskId);

		if (!task) {
			throw new Error(`Task ${taskId} not found`);
		}

		// Update the task status
		const oldStatus = task.status || 'pending';
		task.status = newStatus;

		// Add timestamp of this update
		if (!task.metadata) task.metadata = {};
		task.metadata.lastStatusUpdate = new Date().toISOString();

		log(
			'info',
			`Updated task ${taskId} status from '${oldStatus}' to '${newStatus}'`
		);

		// Emit task status changed event
		emit(EVENT_TYPES.TASK_STATUS_CHANGED, {
			taskId,
			newStatus,
			oldStatus,
			data,
			tasksPath
		});

		// If marking as done, also mark all subtasks as done
		if (
			(newStatus.toLowerCase() === 'done' ||
				newStatus.toLowerCase() === 'completed') &&
			task.subtasks &&
			task.subtasks.length > 0
		) {
			const pendingSubtasks = task.subtasks.filter(
				(st) => st.status !== 'done' && st.status !== 'completed'
			);

			if (pendingSubtasks.length > 0) {
				log(
					'info',
					`Also marking ${pendingSubtasks.length} subtasks as '${newStatus}'`
				);

				pendingSubtasks.forEach((subtask) => {
					const oldSubtaskStatus = subtask.status || 'pending';
					subtask.status = newStatus;

					// Emit subtask status changed event for each auto-updated subtask
					emit(EVENT_TYPES.SUBTASK_STATUS_CHANGED, {
						taskId,
						subtaskId: subtask.id, // Keep the original ID as stored in the subtask
						subtask, // Pass the actual subtask object
						newStatus,
						oldStatus: oldSubtaskStatus,
						data,
						tasksPath
					});
				});
			}
		}
	}
}

export default updateSingleTaskStatus;
