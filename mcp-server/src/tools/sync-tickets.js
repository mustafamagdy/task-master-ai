/**
 * tools/sync-tickets.js
 * Tool to synchronize tasks with external ticketing systems
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse,
	withNormalizedProjectRoot
} from './utils.js';
import { findTasksJsonPath } from '../core/utils/path-utils.js';
import { getTicketingInstance } from '../../scripts/modules/ticketing/ticketing-factory.js';
import { readJSON, writeJSON, log as consoleLog } from '../../scripts/modules/utils.js';
import { findProjectRoot } from '../../scripts/modules/utils.js';

/**
 * Synchronizes Task Master tasks with the configured external ticketing system
 * 
 * @param {Object} options - Options for synchronization
 * @param {string} options.tasksJsonPath - Path to tasks.json file
 * @param {string} options.projectRoot - Project root directory
 * @param {string} options.taskId - Optional specific task ID to sync (if not provided, syncs all tasks)
 * @param {boolean} options.force - Whether to force re-sync even if a ticket already exists
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Result of synchronization
 */
async function syncTicketsDirect(options, logger) {
	const { tasksJsonPath, projectRoot, taskId, force = false } = options;
	
	logger.info(`Starting ticket synchronization with tasksPath: ${tasksJsonPath}`);
	
	try {
		// Get ticketing instance
		const ticketingInstance = await getTicketingInstance(null, projectRoot);
		if (!ticketingInstance) {
			logger.error('No ticketing system configured');
			return {
				success: false,
				error: 'No ticketing system configured. Please configure a ticketing integration first.'
			};
		}
		
		// Read tasks data
		const data = readJSON(tasksJsonPath);
		if (!data || !data.tasks) {
			logger.error('Invalid tasks data structure');
			return {
				success: false,
				error: 'Invalid tasks data structure'
			};
		}
		
		const results = {
			success: true,
			syncedTasks: [],
			skippedTasks: [],
			errors: []
		};
		
		// Filter tasks if taskId is provided
		const tasksToProcess = taskId 
			? data.tasks.filter(task => task.id.toString() === taskId.toString())
			: data.tasks;
			
		if (taskId && tasksToProcess.length === 0) {
			logger.error(`Task with ID ${taskId} not found`);
			return {
				success: false,
				error: `Task with ID ${taskId} not found`
			};
		}
		
		// Process each task
		for (const task of tasksToProcess) {
			try {
				// Skip if already has a ticket and not forcing
				if (!force && task.metadata && task.metadata.jiraKey) {
					logger.info(`Task ${task.id} already has ticket ${task.metadata.jiraKey}, skipping`);
					results.skippedTasks.push({
						id: task.id,
						title: task.title,
						ticketKey: task.metadata.jiraKey,
						reason: 'Already has ticket'
					});
					continue;
				}
				
				// Create ticket for task if it doesn't exist or force is true
				const ticketData = {
					id: task.id,
					title: task.title,
					description: task.description,
					details: task.details,
					priority: task.priority,
					status: task.status,
					metadata: task.metadata || {}
				};
				
				logger.info(`Creating/syncing ticket for task ${task.id}`);
				const ticketingIssue = await ticketingInstance.createStory(
					ticketData,
					projectRoot
				);
				
				if (ticketingIssue && ticketingIssue.key) {
					// Update task with ticket info
					if (!task.metadata) {
						task.metadata = {};
					}
					
					// Store ticket key
					task.metadata.jiraKey = ticketingIssue.key;
					
					// Use the ticketing system's method if available
					if (typeof ticketingInstance.storeTicketId === 'function') {
						task = ticketingInstance.storeTicketId(
							task,
							ticketingIssue.key
						);
					}
					
					// Update task in data
					const taskIndex = data.tasks.findIndex(t => t.id === task.id);
					if (taskIndex !== -1) {
						data.tasks[taskIndex] = task;
					}
					
					results.syncedTasks.push({
						id: task.id,
						title: task.title,
						ticketKey: ticketingIssue.key
					});
					
					logger.info(`Successfully synced task ${task.id} with ticket ${ticketingIssue.key}`);
					
					// Process subtasks if any
					if (task.subtasks && task.subtasks.length > 0) {
						for (const subtask of task.subtasks) {
							try {
								// Skip if already has a ticket and not forcing
								if (!force && subtask.metadata && subtask.metadata.jiraKey) {
									logger.info(`Subtask ${task.id}.${subtask.id} already has ticket ${subtask.metadata.jiraKey}, skipping`);
									results.skippedTasks.push({
										id: `${task.id}.${subtask.id}`,
										title: subtask.title,
										ticketKey: subtask.metadata.jiraKey,
										reason: 'Already has ticket'
									});
									continue;
								}
								
								// Create ticket for subtask
								const subtaskData = {
									id: `${task.id}.${subtask.id}`,
									title: subtask.title,
									description: subtask.description,
									details: subtask.details,
									priority: subtask.priority,
									status: subtask.status,
									metadata: subtask.metadata || {},
									parentTicketId: ticketingIssue.key
								};
								
								logger.info(`Creating/syncing ticket for subtask ${task.id}.${subtask.id}`);
								const subtaskTicket = await ticketingInstance.createTask(
									subtaskData,
									ticketingIssue.key,
									projectRoot
								);
								
								if (subtaskTicket && subtaskTicket.key) {
									// Update subtask with ticket info
									if (!subtask.metadata) {
										subtask.metadata = {};
									}
									
									// Store ticket key
									subtask.metadata.jiraKey = subtaskTicket.key;
									
									// Use the ticketing system's method if available
									if (typeof ticketingInstance.storeTicketId === 'function') {
										subtask = ticketingInstance.storeTicketId(
											subtask,
											subtaskTicket.key
										);
									}
									
									// Update subtask in task
									const subtaskIndex = task.subtasks.findIndex(st => st.id === subtask.id);
									if (subtaskIndex !== -1) {
										task.subtasks[subtaskIndex] = subtask;
										
										// Update task in data
										const taskIndex = data.tasks.findIndex(t => t.id === task.id);
										if (taskIndex !== -1) {
											data.tasks[taskIndex] = task;
										}
									}
									
									results.syncedTasks.push({
										id: `${task.id}.${subtask.id}`,
										title: subtask.title,
										ticketKey: subtaskTicket.key
									});
									
									logger.info(`Successfully synced subtask ${task.id}.${subtask.id} with ticket ${subtaskTicket.key}`);
								} else {
									const errorMsg = `Failed to create ticket for subtask ${task.id}.${subtask.id}`;
									logger.error(errorMsg);
									results.errors.push({
										id: `${task.id}.${subtask.id}`,
										title: subtask.title,
										error: errorMsg
									});
								}
							} catch (subtaskError) {
								const errorMsg = `Error syncing subtask ${task.id}.${subtask.id}: ${subtaskError.message}`;
								logger.error(errorMsg);
								results.errors.push({
									id: `${task.id}.${subtask.id}`,
									title: subtask.title,
									error: errorMsg
								});
							}
						}
					}
				} else {
					const errorMsg = `Failed to create ticket for task ${task.id}`;
					logger.error(errorMsg);
					results.errors.push({
						id: task.id,
						title: task.title,
						error: errorMsg
					});
				}
			} catch (taskError) {
				const errorMsg = `Error syncing task ${task.id}: ${taskError.message}`;
				logger.error(errorMsg);
				results.errors.push({
					id: task.id,
					title: task.title,
					error: errorMsg
				});
			}
		}
		
		// Write updated data back to file
		writeJSON(tasksJsonPath, data);
		
		// Set success based on errors
		results.success = results.errors.length === 0;
		
		return results;
	} catch (error) {
		logger.error(`Error during ticket synchronization: ${error.message}`);
		return {
			success: false,
			error: `Error during ticket synchronization: ${error.message}`
		};
	}
}

/**
 * Register the sync-tickets tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerSyncTicketsTool(server) {
	server.addTool({
		name: 'sync-tickets',
		description:
			'Synchronize Task Master tasks with the configured external ticketing system (e.g., Jira). Creates tickets for tasks that do not have associated tickets yet.',
		parameters: z.object({
			taskId: z
				.string()
				.optional()
				.describe('Optional specific task ID to synchronize. If not provided, syncs all tasks.'),
			force: z
				.boolean()
				.optional()
				.describe('Force re-sync even if tickets already exist'),
			file: z
				.string()
				.optional()
				.describe('Path to the tasks file relative to project root'),
			projectRoot: z
				.string()
				.optional()
				.describe(
					'The directory of the project. (Optional, usually from session)'
				)
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			const toolName = 'sync-tickets';
			const { taskId, force, file, projectRoot } = args;

			try {
				log.info(
					`Executing ${toolName} tool with normalized root: ${projectRoot}`
				);

				let tasksJsonPath;
				try {
					tasksJsonPath = findTasksJsonPath({ projectRoot, file }, log);
					log.info(`${toolName}: Resolved tasks path: ${tasksJsonPath}`);
				} catch (error) {
					log.error(`${toolName}: Error finding tasks.json: ${error.message}`);
					return createErrorResponse(
						`Failed to find tasks.json within project root '${projectRoot}': ${error.message}`
					);
				}

				const result = await syncTicketsDirect(
					{
						tasksJsonPath,
						projectRoot,
						taskId,
						force: force === true
					},
					log
				);

				log.info(
					`${toolName}: Direct function result: success=${result.success}`
				);
				return handleApiResult(result, log, 'Error synchronizing tickets');
			} catch (error) {
				log.error(
					`Critical error in ${toolName} tool execute: ${error.message}`
				);
				return createErrorResponse(
					`Internal tool error (${toolName}): ${error.message}`
				);
			}
		})
	});
}
