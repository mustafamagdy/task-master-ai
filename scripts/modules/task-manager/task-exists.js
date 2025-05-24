/**
 * Checks if a task with the given ID exists
 * @param {Array|string} tasksOrPath - Array of tasks to search or path to tasks.json file
 * @param {string|number} taskId - ID of task or subtask to check
 * @returns {Promise<boolean>} Whether the task exists
 */
import { readJSON } from '../utils.js';

async function taskExists(tasksOrPath, taskId) {
	let tasksArray;

	// Handle case where tasksOrPath is a file path
	if (typeof tasksOrPath === 'string') {
		try {
			const data = readJSON(tasksOrPath);
			if (!data || !data.tasks || !Array.isArray(data.tasks)) {
				return false;
			}
			tasksArray = data.tasks;
		} catch (error) {
			return false;
		}
	} else if (Array.isArray(tasksOrPath)) {
		tasksArray = tasksOrPath;
	} else {
		return false;
	}

	// Handle subtask IDs (e.g., "1.2")
	if (typeof taskId === 'string' && taskId.includes('.')) {
		const [parentIdStr, subtaskIdStr] = taskId.split('.');
		const parentId = parseInt(parentIdStr, 10);
		const subtaskId = parseInt(subtaskIdStr, 10);

		// Find the parent task
		const parentTask = tasksArray.find((t) => t.id === parentId);

		// If parent exists, check if subtask exists
		return !!(
			parentTask &&
			parentTask.subtasks &&
			Array.isArray(parentTask.subtasks) &&
			parentTask.subtasks.some((st) => st.id === subtaskId)
		);
	}

	// Handle regular task IDs
	const id = parseInt(taskId, 10);
	return tasksArray.some((t) => t.id === id);
}

export default taskExists;
