/**
 * id-utils.js
 * Centralized utilities for managing both ticket IDs and reference IDs for tasks and subtasks
 */

// ------------------------------
// Reference ID Constants
// ------------------------------
// Prefix for user stories
const USER_STORY_PREFIX = 'US';
// Prefix for tasks
const TASK_PREFIX = 'T';

// ============================================================
//                    TICKET ID FUNCTIONS
// ============================================================

/**
 * Store a ticket ID in a task's metadata
 * @param {Object} task - The task or subtask
 * @param {string} ticketId - The ticket ID to store
 * @returns {Object} Updated task object
 */
export function storeTicketId(task, ticketId) {
	if (!task || !ticketId) {
		console.log(
			'[ID-UTILS] Cannot store ticket ID: task or ticketId is null or undefined'
		);
		return task;
	}

	// Initialize metadata if it doesn't exist
	if (!task.metadata) {
		task.metadata = {};
	}

	// Store the ticket ID
	task.metadata.jiraKey = ticketId;
	console.log(`[ID-UTILS] Stored ticket ID ${ticketId} in task ${task.id}`);
	return task;
}

/**
 * Get the ticket ID for a task or subtask, with special handling for subtasks
 * @param {Object} task - The task or subtask
 * @param {Object} options - Optional parameters
 * @param {Object} options.parentTask - Parent task object for subtasks
 * @param {boolean} options.debug - Whether to log debug information
 * @returns {string|null} The ticket ID or null if not found
 */
export function getTicketId(task, options = {}) {
	const { debug = false, parentTask = null } = options;

	if (!task) {
		if (debug) console.log('[ID-UTILS] getTicketId: task is null or undefined');
		return null;
	}

	const isSubtask = task && task.id && task.id.toString().includes('.');

	if (debug) {
		console.log(
			`[ID-UTILS] Getting ticket ID for ${isSubtask ? 'subtask' : 'task'}: ${task.id || 'undefined'}`
		);
	}

	// First try to get the ticket ID from the task's own metadata
	if (task.metadata && task.metadata.jiraKey) {
		if (debug) {
			console.log(
				`[ID-UTILS] ${isSubtask ? 'Subtask' : 'Task'} ${task.id} has jiraKey: ${task.metadata.jiraKey}`
			);
		}
		return task.metadata.jiraKey;
	}

	// If this is a subtask and it doesn't have its own jiraKey, try to use the parent task's jiraKey
	if (isSubtask) {
		// If a parent task was provided, use its jiraKey
		if (parentTask && parentTask.metadata && parentTask.metadata.jiraKey) {
			if (debug) {
				console.log(
					`[ID-UTILS] Using parent task ${parentTask.id} jiraKey for subtask ${task.id}: ${parentTask.metadata.jiraKey}`
				);
			}
			return parentTask.metadata.jiraKey;
		}

		// Extract parent task ID from subtask ID (e.g., "1.2" -> "1")
		const parentTaskId = task.id.toString().split('.')[0];
		if (debug) {
			console.log(
				`[ID-UTILS] Subtask ${task.id} has no jiraKey, parent task ID would be: ${parentTaskId}`
			);
			console.log(
				`[ID-UTILS] However, parent task object not provided, cannot get jiraKey from parent`
			);
		}
	}

	// If we get here, no ticket ID was found
	if (debug) {
		console.log(
			`[ID-UTILS] No jiraKey found for ${isSubtask ? 'subtask' : 'task'} ${task.id}`
		);
	}
	return null;
}

// ============================================================
//                  REFERENCE ID FUNCTIONS
// ============================================================

/**
 * Generate a reference ID for a user story
 * @param {number} taskId - Task ID
 * @param {boolean} ticketingEnabled - Whether ticketing integration is enabled
 * @returns {string|null} Reference ID for the user story (e.g., US001) or null if ticketing is disabled
 */
export function generateUserStoryRefId(taskId, ticketingEnabled = true) {
	if (!ticketingEnabled) {
		return null;
	}

	// Format the task ID with leading zeros (e.g., 001, 012, 123)
	const formattedId = String(taskId).padStart(3, '0');
	return `${USER_STORY_PREFIX}${formattedId}`;
}

/**
 * Generate a reference ID for a subtask
 * @param {number} parentTaskId - Parent task ID
 * @param {number} subtaskId - Subtask ID
 * @param {boolean} ticketingEnabled - Whether ticketing integration is enabled
 * @returns {string|null} Reference ID for the subtask (e.g., T001-01) or null if ticketing is disabled
 */
export function generateSubtaskRefId(
	parentTaskId,
	subtaskId,
	ticketingEnabled = true
) {
	if (!ticketingEnabled) {
		return null;
	}

	// Format the parent task ID with leading zeros (e.g., 001, 012, 123)
	const formattedParentId = String(parentTaskId).padStart(3, '0');
	// Format the subtask ID with leading zeros (e.g., 01, 02, 10)
	const formattedSubtaskId = String(subtaskId).padStart(2, '0');
	// Keep the hyphen between parent and subtask IDs
	return `${TASK_PREFIX}${formattedParentId}-${formattedSubtaskId}`;
}

/**
 * Extract reference ID from a task title
 * @param {string} title - Task title
 * @returns {string|null} Reference ID if found, null otherwise
 */
export function extractRefIdFromTitle(title) {
	if (!title) return null;

	// Match patterns like US001- or T001-01- at the beginning of the title
	const match = title.match(/^((?:US\d{3})|(?:T\d{3}-\d{2}))-/);
	return match ? match[1] : null;
}

/**
 * Store reference ID in task metadata
 * @param {Object} task - Task object
 * @param {string} refId - Reference ID to store
 * @returns {Object} Updated task object
 */
export function storeRefId(task, refId) {
	if (!task || !refId) return task;

	// Initialize metadata if it doesn't exist
	if (!task.metadata) {
		task.metadata = {};
	}

	// Store reference ID in metadata
	task.metadata.refId = refId;

	return task;
}

/**
 * Get reference ID from task metadata
 * @param {Object} task - Task object
 * @returns {string|null} Reference ID or null if not found
 */
export function getRefId(task) {
	return task?.metadata?.refId || null;
}

/**
 * Format task title with reference ID for Jira
 * @param {Object} task - Task object
 * @returns {string} Formatted title with reference ID for Jira
 */
export function formatTitleForJira(task) {
	if (!task || !task.title) return '';

	const refId = getRefId(task);
	if (!refId) return task.title;

	// Format as 'US001-Title' instead of '[US-001] Title'
	return `${refId}-${task.title}`;
}

/**
 * Format task title with reference ID for any ticketing system
 * @param {Object} task - Task object
 * @param {string} systemType - Type of ticketing system (e.g., 'jira', 'github')
 * @returns {string} Formatted title with reference ID
 */
export function formatTitleForTicket(task, systemType = 'jira') {
	// Select appropriate formatter based on the ticketing system type
	switch (systemType.toLowerCase()) {
		case 'jira':
			return formatTitleForJira(task);
		case 'github':
			// GitHub might use a different format, like: [US001] Title
			const refId = getRefId(task);
			if (!refId || !task.title) return task?.title || '';
			return `[${refId}] ${task.title}`;
		default:
			// Default to Jira format
			return formatTitleForJira(task);
	}
}

/**
 * Find a task by reference ID in the tasks array
 * @param {Array} tasks - Array of tasks
 * @param {string} refId - Reference ID to search for
 * @returns {Object|null} Task object if found, null otherwise
 */
export function findTaskByRefId(tasks, refId) {
	if (!tasks || !Array.isArray(tasks) || !refId) return null;

	// Search for the task with the matching reference ID in metadata
	for (const task of tasks) {
		const taskRefId = getRefId(task);
		if (taskRefId === refId) {
			return task;
		}

		// Also search in subtasks if available
		if (task.subtasks && Array.isArray(task.subtasks)) {
			for (const subtask of task.subtasks) {
				const subtaskRefId = getRefId(subtask);
				if (subtaskRefId === refId) {
					return subtask;
				}
			}
		}
	}

	// Fallback to searching in titles if metadata is missing
	// This helps in migrating from old format to new format
	const oldFormatRefId = refId
		.replace(/US(\d{3})/, 'US-$1')
		.replace(/T(\d{3}-\d{2})/, 'T$1');

	for (const task of tasks) {
		const title = task.title || '';
		if (title.includes(`[${oldFormatRefId}]`)) {
			return task;
		}

		// Also check subtasks
		if (task.subtasks && Array.isArray(task.subtasks)) {
			for (const subtask of task.subtasks) {
				const subtaskTitle = subtask.title || '';
				if (subtaskTitle.includes(`[${oldFormatRefId}]`)) {
					return subtask;
				}
			}
		}
	}

	return null;
}
