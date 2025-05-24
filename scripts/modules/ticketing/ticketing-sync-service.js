/**
 * ticketing-sync-service.js
 * Unified service for handling ticketing system synchronization
 * Used by both CLI and MCP contexts for consistent behavior
 */

import {
	log,
	findProjectRoot,
	readJSON,
	writeJSON,
	isSilentMode
} from '../utils.js';
import { getTicketingIntegrationEnabled } from '../config-manager.js';
import { getTicketingInstance } from './ticketing-factory.js';
import { isTicketingSystemConfigured } from './ticketing-interface.js';
import { generateUserStoryRefId, storeRefId } from './utils/id-utils.js';

/**
 * Unified Ticketing Sync Service
 *
 * Direct service for syncing Task Master operations with external ticketing systems.
 * Used by both CLI and MCP to ensure consistent ticketing integration.
 *
 * Replaces the unreliable event-based system with direct method calls.
 */
class TicketingSyncService {
	constructor() {
		this.projectRoot = null;
		this.ticketingInstance = null;
		this.isEnabled = false;
		this.initialized = false;
	}

	/**
	 * Hybrid logging that works in both CLI and MCP (silent mode) contexts
	 * Always uses console.log to ensure ticketing operations are never silenced
	 * @param {string} level - Log level (info, warn, error, success, debug)
	 * @param {string} message - Message to log
	 */
	_log(level, message) {
		// Always use console.log for ticketing service to ensure it's never silenced
		// This guarantees unified behavior across CLI and MCP contexts
		const timestamp = new Date().toISOString();
		const levelTag = level.toUpperCase();
		console.log(`${timestamp} [TICKETING-SERVICE] [${levelTag}] ${message}`);

		// Also use regular log function if not in silent mode (for CLI compatibility)
		if (!isSilentMode()) {
			log(level, `[TICKETING-SERVICE] ${message}`);
		}
	}

	/**
	 * Initialize the service with project context
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<boolean>} Success status
	 */
	async initialize(projectRoot = null) {
		try {
			this.projectRoot = projectRoot || findProjectRoot();
			this.isEnabled = getTicketingIntegrationEnabled(this.projectRoot);

			if (this.isEnabled) {
				this.ticketingInstance = await getTicketingInstance(
					null,
					this.projectRoot
				);
				if (!this.ticketingInstance) {
					this._log('warn', 'No ticketing instance available');
					this.isEnabled = false;
				}
			}

			this.initialized = true;
			this._log('info', `Initialized - enabled: ${this.isEnabled}`);
			return true;
		} catch (error) {
			this._log('error', `Initialization failed: ${error.message}`);
			this.isEnabled = false;
			this.initialized = true; // Mark as initialized even if failed
			return false;
		}
	}

	/**
	 * Sync multiple subtasks (used by expand-task)
	 * @param {Array} subtasks - Array of subtask objects
	 * @param {Object} parentTask - The parent task object
	 * @param {string} tasksPath - Path to tasks.json
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Array>} Array of created tickets
	 */
	async syncSubtasks(subtasks, parentTask, tasksPath, projectRoot) {
		if (!this.initialized) {
			await this.initialize(projectRoot);
		}

		if (!this.isEnabled) {
			this._log('debug', 'Ticketing disabled - skipping subtasks sync');
			return [];
		}

		const results = [];
		for (const subtask of subtasks) {
			const ticket = await this.syncSubtask(
				subtask,
				parentTask,
				tasksPath,
				projectRoot
			);
			if (ticket && ticket.success) {
				results.push(ticket);
			}
		}

		this._log(
			'info',
			`Synced ${results.length}/${subtasks.length} subtasks to ticketing system`
		);
		return results;
	}

	/**
	 * Check if ticketing is enabled and initialized
	 * @returns {boolean} Whether ticketing sync is available
	 */
	isAvailable() {
		return this.initialized && this.isEnabled;
	}

	/**
	 * Get service status for debugging
	 * @returns {Object} Service status information
	 */
	getStatus() {
		return {
			initialized: this.initialized,
			enabled: this.isEnabled,
			hasInstance: !!this.ticketingInstance,
			projectRoot: this.projectRoot
		};
	}

	/**
	 * Check if the service is ready for ticketing operations
	 * @returns {boolean}
	 */
	isReady() {
		return this.initialized && this.ticketingInstance !== null;
	}

	/**
	 * Sync a newly created task with the ticketing system
	 * @param {Object} task - The task object
	 * @param {string} tasksPath - Path to tasks.json file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Result { success: boolean, ticketKey?: string, error?: string }
	 */
	async syncTask(task, tasksPath, projectRoot) {
		try {
			// Initialize if not already done
			if (!this.isReady()) {
				const initResult = await this.initialize(projectRoot);
				if (!initResult) {
					return { success: false, error: 'Ticketing service not available' };
				}
			}

			log(
				'debug',
				`[TICKETING_SERVICE] Syncing task ${task.id} with ticketing system`
			);

			// Ensure task has a reference ID
			let updatedTask = { ...task };
			if (!updatedTask.metadata?.refId) {
				const refId = generateUserStoryRefId(task.id, true);
				if (refId) {
					updatedTask = storeRefId(updatedTask, refId);
					log(
						'debug',
						`[TICKETING_SERVICE] Generated refId ${refId} for task ${task.id}`
					);
				}
			}

			// Create ticket
			const ticketData = {
				id: updatedTask.id,
				title: updatedTask.title,
				description: updatedTask.description,
				details: updatedTask.details,
				priority: updatedTask.priority,
				status: updatedTask.status,
				metadata: updatedTask.metadata
			};

			const ticketingIssue = await this.ticketingInstance.createStory(
				ticketData,
				projectRoot
			);

			if (ticketingIssue && ticketingIssue.key) {
				// Store ticket key in task metadata
				if (!updatedTask.metadata) {
					updatedTask.metadata = {};
				}
				updatedTask.metadata.jiraKey = ticketingIssue.key;

				// Also use the ticketing system's method if available
				if (typeof this.ticketingInstance.storeTicketId === 'function') {
					updatedTask = this.ticketingInstance.storeTicketId(
						updatedTask,
						ticketingIssue.key
					);
				}

				// Update the task in the file
				await this._updateTaskInFile(updatedTask, tasksPath);

				log(
					'success',
					`[TICKETING_SERVICE] Created ticket ${ticketingIssue.key} for task ${task.id}`
				);
				return { success: true, ticketKey: ticketingIssue.key };
			} else {
				log(
					'warn',
					`[TICKETING_SERVICE] Failed to create ticket for task ${task.id}`
				);
				return { success: false, error: 'Failed to create ticket' };
			}
		} catch (error) {
			log(
				'error',
				`[TICKETING_SERVICE] Error syncing task ${task.id}: ${error.message}`
			);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Sync a newly created subtask with the ticketing system
	 * @param {Object} subtask - The subtask object
	 * @param {Object} parentTask - The parent task object
	 * @param {string} tasksPath - Path to tasks.json file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Result { success: boolean, ticketKey?: string, error?: string }
	 */
	async syncSubtask(subtask, parentTask, tasksPath, projectRoot) {
		try {
			// Initialize if not already done
			if (!this.isReady()) {
				const initResult = await this.initialize(projectRoot);
				if (!initResult) {
					return { success: false, error: 'Ticketing service not available' };
				}
			}

			log(
				'debug',
				`[TICKETING_SERVICE] Syncing subtask ${parentTask.id}.${subtask.id} with ticketing system`
			);

			// Get parent ticket key
			const parentTicketKey = this.ticketingInstance.getTicketId(parentTask);

			if (!parentTicketKey) {
				log(
					'warn',
					`[TICKETING_SERVICE] Parent task ${parentTask.id} has no ticket key, cannot create subtask ticket`
				);
				return { success: false, error: 'Parent task has no ticket' };
			}

			// SIMPLIFIED APPROACH: Use createStory (which works) instead of complex createTask
			// This creates standalone tickets for subtasks rather than true Jira subtasks
			// but ensures consistent ticketing integration
			const subtaskData = {
				id: subtask.id,
				parentId: parentTask.id,
				title: `[Subtask] ${subtask.title}`, // Prefix to indicate it's a subtask
				description: `${subtask.description}\n\nParent Task: ${parentTask.title} (${parentTicketKey})`,
				details: subtask.details,
				priority: subtask.priority || parentTask.priority,
				status: subtask.status,
				metadata: subtask.metadata || {}
			};

			// Use createStory which is proven to work reliably
			const ticketingIssue = await this.ticketingInstance.createStory(
				subtaskData,
				projectRoot
			);

			if (ticketingIssue && ticketingIssue.key) {
				// Store ticket key in subtask metadata
				if (!subtask.metadata) {
					subtask.metadata = {};
				}
				subtask.metadata.jiraKey = ticketingIssue.key;

				// Also use the ticketing system's method if available
				if (typeof this.ticketingInstance.storeTicketId === 'function') {
					this.ticketingInstance.storeTicketId(subtask, ticketingIssue.key);
				}

				// Update the subtask in the file
				await this._updateSubtaskInFile(subtask, parentTask.id, tasksPath);

				log(
					'success',
					`[TICKETING_SERVICE] Created ticket ${ticketingIssue.key} for subtask ${parentTask.id}.${subtask.id}`
				);
				return { success: true, ticketKey: ticketingIssue.key };
			} else {
				log(
					'warn',
					`[TICKETING_SERVICE] Failed to create ticket for subtask ${parentTask.id}.${subtask.id}`
				);
				return { success: false, error: 'Failed to create subtask ticket' };
			}
		} catch (error) {
			log(
				'error',
				`[TICKETING_SERVICE] Error syncing subtask ${parentTask.id}.${subtask.id}: ${error.message}`
			);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Sync multiple tasks (used by sync-tickets command)
	 * @param {Array} tasks - Array of task objects
	 * @param {string} tasksPath - Path to tasks.json file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Result { success: boolean, created: number, errors: Array }
	 */
	async syncMultipleTasks(tasks, tasksPath, projectRoot) {
		try {
			// Initialize if not already done
			if (!this.isReady()) {
				const initResult = await this.initialize(projectRoot);
				if (!initResult) {
					return {
						success: false,
						created: 0,
						errors: ['Ticketing service not available']
					};
				}
			}

			let created = 0;
			const errors = [];

			for (const task of tasks) {
				// Check if the task has a ticket ID but it might have been deleted in Jira
				if (task.metadata?.jiraKey) {
					// Verify if the ticket still exists in Jira
					const ticketExists = await this.ticketingInstance.ticketExists(
						task.metadata.jiraKey,
						projectRoot
					);
					
					if (!ticketExists) {
						// If ticket doesn't exist in Jira but we have a key, recreate it
						this._log('info', `Ticket ${task.metadata.jiraKey} not found in Jira, recreating...`);
						const result = await this.syncTask(task, tasksPath, projectRoot);
						if (result.success) {
							created++;
						} else {
							errors.push(`Task ${task.id}: ${result.error}`);
						}
					} else {
						this._log('debug', `Ticket ${task.metadata.jiraKey} exists in Jira, skipping creation`);
					}
				} else {
					// No ticket ID, create a new one
					const result = await this.syncTask(task, tasksPath, projectRoot);
					if (result.success) {
						created++;
					} else {
						errors.push(`Task ${task.id}: ${result.error}`);
					}
				}

				// Always sync subtasks if they exist (regardless of parent ticket status)
				if (task.subtasks && task.subtasks.length > 0) {
					for (const subtask of task.subtasks) {
						if (subtask.metadata?.jiraKey) {
							// Verify if the subtask ticket still exists in Jira
							const subtaskTicketExists = await this.ticketingInstance.ticketExists(
								subtask.metadata.jiraKey,
								projectRoot
							);
							
							if (!subtaskTicketExists) {
								// If ticket doesn't exist in Jira but we have a key, recreate it
								this._log('info', `Subtask ticket ${subtask.metadata.jiraKey} not found in Jira, recreating...`);
								const subtaskResult = await this.syncSubtask(
									subtask,
									task,
									tasksPath,
									projectRoot
								);
								if (subtaskResult.success) {
									created++;
								} else {
									errors.push(
										`Subtask ${task.id}.${subtask.id}: ${subtaskResult.error}`
									);
								}
							} else {
								this._log('debug', `Subtask ticket ${subtask.metadata.jiraKey} exists in Jira, skipping creation`);
							}
						} else {
							// No ticket ID, create a new one
							const subtaskResult = await this.syncSubtask(
								subtask,
								task,
								tasksPath,
								projectRoot
							);
							if (subtaskResult.success) {
								created++;
							} else {
								errors.push(
									`Subtask ${task.id}.${subtask.id}: ${subtaskResult.error}`
								);
							}
						}
					}
				}
			}

			log(
				'info',
				`[TICKETING_SERVICE] Sync completed: ${created} tickets created, ${errors.length} errors`
			);
			return { success: true, created, errors };
		} catch (error) {
			log(
				'error',
				`[TICKETING_SERVICE] Error syncing multiple tasks: ${error.message}`
			);
			return { success: false, created: 0, errors: [error.message] };
		}
	}

	/**
	 * Update task status in ticketing system
	 * @param {number} taskId - Task ID
	 * @param {string} newStatus - New status
	 * @param {string} tasksPath - Path to tasks.json file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Result { success: boolean, error?: string }
	 */
	async updateTaskStatus(taskId, newStatus, tasksPath, projectRoot) {
		try {
			// Initialize if not already done
			if (!this.isReady()) {
				const initResult = await this.initialize(projectRoot);
				if (!initResult) {
					return { success: false, error: 'Ticketing service not available' };
				}
			}

			// Get the task
			const tasksData = readJSON(tasksPath);
			const task = tasksData.tasks.find((t) => t.id === taskId);

			if (!task) {
				return { success: false, error: `Task ${taskId} not found` };
			}

			const ticketKey = this.ticketingInstance.getTicketId(task);
			if (!ticketKey) {
				log(
					'debug',
					`[TICKETING_SERVICE] Task ${taskId} has no ticket, skipping status update`
				);
				return { success: true }; // Not an error, just no ticket to update
			}

			// Update ticket status
			await this.ticketingInstance.updateTicketStatus(
				ticketKey,
				newStatus,
				projectRoot
			);

			log(
				'debug',
				`[TICKETING_SERVICE] Updated ticket ${ticketKey} status to ${newStatus}`
			);
			return { success: true };
		} catch (error) {
			log(
				'error',
				`[TICKETING_SERVICE] Error updating task status: ${error.message}`
			);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Delete a ticket in the ticketing system
	 * @param {string} ticketId - Ticket ID to delete
	 * @param {string} tasksPath - Path to tasks.json file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Result { success: boolean, error?: string }
	 */
	async deleteTicket(ticketId, tasksPath, projectRoot) {
		try {
			// Initialize if not already done
			if (!this.isReady()) {
				const initResult = await this.initialize(projectRoot);
				if (!initResult) {
					return { success: false, error: 'Ticketing service not available' };
				}
			}

			// Check if ticket exists before attempting to delete
			const exists = await this.ticketingInstance.ticketExists(ticketId, projectRoot);
			if (!exists) {
				this._log('info', `Ticket ${ticketId} does not exist, considering deletion successful`);
				return { success: true }; // Not an error, just no ticket to delete
			}

			// Delete the ticket
			const deleteResult = await this.ticketingInstance.deleteTicket(ticketId, projectRoot);
			
			if (deleteResult) {
				this._log('info', `Successfully deleted ticket ${ticketId}`);
				return { success: true };
			} else {
				this._log('error', `Failed to delete ticket ${ticketId}`);
				return { success: false, error: 'Failed to delete ticket' };
			}
		} catch (error) {
			this._log('error', `Error deleting ticket ${ticketId}: ${error.message}`);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Helper method to update a task in the tasks file
	 * @private
	 */
	async _updateTaskInFile(updatedTask, tasksPath) {
		const tasksData = readJSON(tasksPath);
		const taskIndex = tasksData.tasks.findIndex((t) => t.id === updatedTask.id);

		if (taskIndex !== -1) {
			tasksData.tasks[taskIndex] = updatedTask;
			writeJSON(tasksPath, tasksData);
		}
	}

	/**
	 * Helper method to update a subtask in the tasks file
	 * @private
	 */
	async _updateSubtaskInFile(updatedSubtask, parentTaskId, tasksPath) {
		const tasksData = readJSON(tasksPath);
		const parentTask = tasksData.tasks.find((t) => t.id === parentTaskId);

		if (parentTask && parentTask.subtasks) {
			const subtaskIndex = parentTask.subtasks.findIndex(
				(st) => st.id === updatedSubtask.id
			);
			if (subtaskIndex !== -1) {
				parentTask.subtasks[subtaskIndex] = updatedSubtask;
				writeJSON(tasksPath, tasksData);
			}
		}
	}
}

// Create singleton instance
const ticketingSyncService = new TicketingSyncService();

export default ticketingSyncService;
export { TicketingSyncService };
