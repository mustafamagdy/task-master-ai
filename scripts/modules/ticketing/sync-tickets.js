/**
 * sync-tickets.js
 * Fixed version of sync-tickets.js with proper syntax
 * Generic task synchronization with ticketing systems
 */

import fs from 'fs';
import path from 'path';
import { log, readJSON, writeJSON } from '../utils.js';
import {
	getTicketingSystem,
	getTicketingSystemEnabled,
	getJiraProjectKey,
	getJiraBaseUrl,
	getJiraEmail,
	getJiraApiToken,
	getTicketingSystemType
} from '../config-manager.js';
import generateTaskFiles from '../task-manager/generate-task-files.js';
// Import directly from utils
import { 
	getRefId, 
	formatTitleForTicket,
	generateUserStoryRefId,
	generateSubtaskRefId
} from './utils/index.js';
import {
	getTicketId,
	storeTicketId,
	synchronizeTaskStatus,
	pushTaskStatusToTicket,
	createTicketForTask,
	createSubtaskTicket,
	bidirectionalSync,
	pullTicketUpdatesToTask
} from './utils/index.js';

// Default debug mode - set to false in production
const DEBUG = false;

// Define sync directions
const SYNC_DIRECTIONS = {
	UP: 'up', // Tasks to tickets (push)
	DOWN: 'down', // Tickets to tasks (pull)
	BIDIRECTIONAL: 'bidirectional' // Both ways
};

/**
 * Helper function to debug and create a ticket for a task
 * This wraps the actual ticket creation with additional logging
 * @param {Object} task - Task object
 * @param {Object} ticketingSystem - Ticketing system instance
 * @param {Object} options - Options object
 * @returns {Promise<string|null>} - Ticket ID or null if creation failed
 */
async function debugCreateTicketForTask(task, ticketingSystem, options) {
	const { logger, debug, projectRoot } = options;
	const customLog = logger || console;
	
	try {
		customLog.info(`DEBUG CREATE TICKET: Starting ticket creation for task ${task.id}`);
		customLog.info(`DEBUG CREATE TICKET: Task title: "${task.title}"`);
		customLog.info(`DEBUG CREATE TICKET: Task reference ID: ${getRefId(task) || 'undefined'}`);
		
		// Check ticketing system type
		customLog.info(`DEBUG CREATE TICKET: Ticketing system type: ${ticketingSystem.constructor.name}`);
		
		// Check if the task already has a ticket
		const existingTicketId = getTicketId(task);
		if (existingTicketId) {
			customLog.info(`DEBUG CREATE TICKET: Task already has ticket ID: ${existingTicketId}`);
			return existingTicketId;
		}
		
		// Check task status
		customLog.info(`DEBUG CREATE TICKET: Task status: ${task.status || 'undefined'}`);
		
		// Perform the actual ticket creation
		customLog.info(`DEBUG CREATE TICKET: Calling actual createTicketForTask function`);
		const startTime = Date.now();
		
		// Handle any errors during creation
		let ticketId = null;
		try {
			customLog.info(`DEBUG CREATE TICKET: Calling createStory on ticketing system`);
			const createResult = await ticketingSystem.createStory(task, projectRoot);
			customLog.info(`DEBUG CREATE TICKET: createStory result: ${JSON.stringify(createResult)}`);
			
			if (createResult && createResult.key) {
				ticketId = createResult.key;
				customLog.info(`DEBUG CREATE TICKET: Successfully created ticket: ${ticketId}`);
				
				// Store the ticket ID in the task
				task.metadata = task.metadata || {};
				task.metadata.jiraKey = ticketId;
				customLog.info(`DEBUG CREATE TICKET: Updated task metadata with jiraKey: ${ticketId}`);
			} else {
				customLog.error(`DEBUG CREATE TICKET: No valid ticket key returned from createStory`);
			}
		} catch (error) {
			customLog.error(`DEBUG CREATE TICKET ERROR: ${error.message}`);
			customLog.error(`DEBUG CREATE TICKET STACK: ${error.stack}`);
			return null;
		}
		
		const endTime = Date.now();
		customLog.info(`DEBUG CREATE TICKET: Ticket creation took ${endTime - startTime}ms`);
		
		return ticketId;
	} catch (outerError) {
		customLog.error(`DEBUG CREATE TICKET OUTER ERROR: ${outerError.message}`);
		customLog.error(`DEBUG CREATE TICKET OUTER STACK: ${outerError.stack}`);
		return null;
	}
}

/**
 * Create tasks and subtasks from Jira tickets
 * This imports all tickets from Jira and creates/updates tasks in tasks.json
 * @param {Object} data - The tasks.json data object
 * @param {Object} ticketingSystem - The ticketing system instance
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Stats about imported tickets
 */
async function importAllTicketsFromJira(data, ticketingSystem, options) {
	const { projectRoot, customLog, debug, debugLog } = options;
	
	// Stats for reporting
	const stats = {
		tasksCreated: 0,
		subtasksCreated: 0,
		tasksUpdated: 0,
		subtasksUpdated: 0,
		ticketsImported: 0,
		errors: 0
	};
	
	try {
		// Check if ticketing system has getAllTickets method
		if (!ticketingSystem || typeof ticketingSystem.getAllTickets !== 'function') {
			customLog.error('Ticketing system does not support the getAllTickets method.');
			stats.errors++;
			return stats;
		}
		
		// Get all tickets from Jira
		customLog.info('Fetching all tickets from Jira...');
		let allTickets = [];
		try {
			allTickets = await ticketingSystem.getAllTickets(projectRoot);
		} catch (error) {
			customLog.error(`Error fetching tickets: ${error.message}`);
			if (debug) console.error(error.stack);
			stats.errors++;
			return stats;
		}
		
		if (!allTickets || allTickets.length === 0) {
			customLog.warn('No tickets found in Jira.');
			return stats;
		}
		
		customLog.info(`Found ${allTickets.length} tickets in Jira.`);
		
		// Process parent tickets (stories/epics) first
		const mainTickets = allTickets.filter(ticket => 
			ticket.fields && 
			ticket.fields.issuetype && 
			ticket.fields.issuetype.name && 
			ticket.fields.issuetype.name.toLowerCase() !== 'sub-task');
		
		// Process subtasks separately
		const subTasks = allTickets.filter(ticket => 
			ticket.fields && 
			ticket.fields.issuetype && 
			ticket.fields.issuetype.name && 
			ticket.fields.issuetype.name.toLowerCase() === 'sub-task');
		
		customLog.info(`Processing ${mainTickets.length} main tickets and ${subTasks.length} subtasks.`);
		
		// Track which Jira ticket IDs map to which task IDs
		const jiraToTaskMap = new Map();
		
		// Create a map of parent tickets to their subtasks
		const parentToSubtasksMap = new Map();
		
		// Group subtasks by parent ticket key
		for (const subtask of subTasks) {
			if (!subtask.key || !subtask.fields?.parent?.key) continue;
			
			const parentKey = subtask.fields.parent.key;
			if (!parentToSubtasksMap.has(parentKey)) {
				parentToSubtasksMap.set(parentKey, []);
			}
			parentToSubtasksMap.get(parentKey).push(subtask);
		}
		
		debugLog(`Created parent-to-subtasks map with ${parentToSubtasksMap.size} parent tickets`);
		
		// Process main tickets first
		for (const ticket of mainTickets) {
			try {
				if (!ticket.key) {
					customLog.warn('Skipping ticket with missing key');
					continue;
				}
				
				const ticketId = ticket.key;
				
				// Check if a task with this ticket ID already exists
				const existingTaskIndex = data.tasks.findIndex(task => {
					const metadata = task.metadata || {};
					return metadata.jiraKey === ticketId;
				});
				
				let taskToUpdate;
				let taskIndex;
				
				if (existingTaskIndex >= 0) {
					// Update existing task
					taskIndex = existingTaskIndex;
					taskToUpdate = data.tasks[existingTaskIndex];
					customLog.info(`Updating existing task ${taskToUpdate.id} from ticket ${ticketId}`);
					
					// Update task from ticket data
					const updatedTask = await updateTaskFromTicket(taskToUpdate, ticket, ticketingSystem, {
						projectRoot,
						logger: customLog,
						debug
					});
					
					if (updatedTask) {
						data.tasks[existingTaskIndex] = updatedTask;
						taskToUpdate = updatedTask; // Update the reference
						stats.tasksUpdated++;
						jiraToTaskMap.set(ticketId, updatedTask.id);
					}
				} else {
					// Create new task from ticket
					customLog.info(`Creating new task from ticket ${ticketId}`);
					
					const nextTaskId = getNextTaskId(data.tasks);
					const newTask = await createTaskFromTicket(ticket, ticketingSystem, {
						projectRoot,
						logger: customLog,
						debug,
						nextTaskId
					});
					
					if (newTask) {
						data.tasks.push(newTask);
						taskIndex = data.tasks.length - 1;
						taskToUpdate = newTask;
						stats.tasksCreated++;
						jiraToTaskMap.set(ticketId, newTask.id);
						customLog.success(`Created task ${newTask.id} from ticket ${ticketId}`);
					} else {
						customLog.error(`Failed to create task from ticket ${ticketId}`);
						stats.errors++;
					}
				}
				
				// Process any subtasks associated with this ticket immediately
				if (taskToUpdate && parentToSubtasksMap.has(ticketId)) {
					const subtasks = parentToSubtasksMap.get(ticketId);
					customLog.info(`Processing ${subtasks.length} subtasks for ticket ${ticketId}`);
					
					// Ensure task has subtasks array
					if (!taskToUpdate.subtasks) {
						taskToUpdate.subtasks = [];
					}
					
					// Process each subtask
					for (const subtask of subtasks) {
						const subtaskId = subtask.key;
						
						// Check if subtask already exists in the task
						const existingSubtaskIndex = taskToUpdate.subtasks.findIndex(st => {
							const metadata = st.metadata || {};
							return metadata.jiraKey === subtaskId;
						});
						
						if (existingSubtaskIndex >= 0) {
							// Update existing subtask
							const existingSubtask = taskToUpdate.subtasks[existingSubtaskIndex];
							customLog.info(`Updating existing subtask ${taskToUpdate.id}.${existingSubtask.id} from ticket ${subtaskId}`);
							
							const updatedSubtask = await updateSubtaskFromTicket(existingSubtask, subtask, ticketingSystem, {
								projectRoot,
								logger: customLog,
								debug
							});
							
							if (updatedSubtask) {
								taskToUpdate.subtasks[existingSubtaskIndex] = updatedSubtask;
								stats.subtasksUpdated++;
							}
						} else {
							// Create new subtask
							customLog.info(`Creating new subtask under task ${taskToUpdate.id} from ticket ${subtaskId}`);
							
							const nextSubtaskId = getNextSubtaskId(taskToUpdate.subtasks);
							const newSubtask = await createSubtaskFromTicket(subtask, ticketingSystem, {
								projectRoot,
								logger: customLog,
								debug,
								nextSubtaskId,
								parentTaskId: taskToUpdate.id
							});
							
							if (newSubtask) {
								taskToUpdate.subtasks.push(newSubtask);
								stats.subtasksCreated++;
								customLog.success(`Created subtask ${taskToUpdate.id}.${newSubtask.id} from ticket ${subtaskId}`);
							} else {
								customLog.error(`Failed to create subtask from ticket ${subtaskId}`);
								stats.errors++;
							}
						}
					}
					
					// Update the task in the data array with its new subtasks
					data.tasks[taskIndex] = taskToUpdate;
				}
				
				stats.ticketsImported++;
			} catch (ticketError) {
				customLog.error(`Error processing ticket ${ticket.key || 'unknown'}: ${ticketError.message}`);
				if (debug) console.error(ticketError.stack);
				stats.errors++;
				continue; // Continue with next ticket
			}
		}
		
		// Process orphaned subtasks (those whose parents weren't found in the main ticket processing)
		const processedParentKeys = new Set(jiraToTaskMap.keys());
		const orphanedSubtasks = [];
		
		for (const [parentKey, subtasks] of parentToSubtasksMap.entries()) {
			if (!processedParentKeys.has(parentKey)) {
				customLog.warn(`Parent ticket ${parentKey} not processed, checking if it exists in tasks.json...`);
				
				// Try to find a task with this Jira key in the existing data
				const existingTaskIndex = data.tasks.findIndex(task => {
					const metadata = task.metadata || {};
					return metadata.jiraKey === parentKey;
				});
				
				if (existingTaskIndex >= 0) {
					const parentTask = data.tasks[existingTaskIndex];
					customLog.info(`Found existing task ${parentTask.id} for parent ticket ${parentKey}`);
					
					// Process subtasks for this parent
					for (const subtask of subtasks) {
						const subtaskId = subtask.key;
						
						// Ensure parent task has subtasks array
						if (!parentTask.subtasks) {
							parentTask.subtasks = [];
						}
						
						// Check if subtask already exists
						const existingSubtaskIndex = parentTask.subtasks.findIndex(st => {
							const metadata = st.metadata || {};
							return metadata.jiraKey === subtaskId;
						});
						
						if (existingSubtaskIndex >= 0) {
							// Update existing subtask
							const existingSubtask = parentTask.subtasks[existingSubtaskIndex];
							customLog.info(`Updating existing subtask ${parentTask.id}.${existingSubtask.id} from ticket ${subtaskId}`);
							
							const updatedSubtask = await updateSubtaskFromTicket(existingSubtask, subtask, ticketingSystem, {
								projectRoot,
								logger: customLog,
								debug
							});
							
							if (updatedSubtask) {
								parentTask.subtasks[existingSubtaskIndex] = updatedSubtask;
								stats.subtasksUpdated++;
							}
						} else {
							// Create new subtask
							customLog.info(`Creating new subtask under task ${parentTask.id} from ticket ${subtaskId}`);
							
							const nextSubtaskId = getNextSubtaskId(parentTask.subtasks);
							const newSubtask = await createSubtaskFromTicket(subtask, ticketingSystem, {
								projectRoot,
								logger: customLog,
								debug,
								nextSubtaskId,
								parentTaskId: parentTask.id
							});
							
							if (newSubtask) {
								parentTask.subtasks.push(newSubtask);
								stats.subtasksCreated++;
								customLog.success(`Created subtask ${parentTask.id}.${newSubtask.id} from ticket ${subtaskId}`);
							} else {
								customLog.error(`Failed to create subtask from ticket ${subtaskId}`);
								stats.errors++;
							}
						}
					}
					
					// Update the parent task in the data
					data.tasks[existingTaskIndex] = parentTask;
				} else {
					// Parent task not found, collect these subtasks as orphaned
					orphanedSubtasks.push(...subtasks);
				}
			}
		}
		
		// Report any orphaned subtasks
		if (orphanedSubtasks.length > 0) {
			customLog.warn(`Found ${orphanedSubtasks.length} subtasks with parent tickets not in the system`);
			for (const orphan of orphanedSubtasks) {
				customLog.warn(`Orphaned subtask: ${orphan.key}, parent: ${orphan.fields?.parent?.key}`);
			}
		}
		
		return stats;
	} catch (error) {
		customLog.error(`Error importing tickets from Jira: ${error.message}`);
		if (debug) {
			console.error(error.stack);
		}
		stats.errors++;
		return stats;
	}
}

/**
 * Create a new task object from a Jira ticket
 * @param {Object} ticket - Jira ticket object
 * @param {Object} ticketingSystem - Ticketing system instance
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} New task object or null if creation failed
 */
async function createTaskFromTicket(ticket, ticketingSystem, options) {
	const { projectRoot, logger = console, debug = false, nextTaskId } = options;
	
	try {
		// Extract essential data from ticket
		const ticketId = ticket.key;
		const summary = ticket.fields.summary;
		const description = (ticket.fields.description && typeof ticket.fields.description === 'string') 
			? ticket.fields.description 
			: '';
		const status = ticket.fields.status?.name || 'To Do';
		const priority = ticket.fields.priority?.name || 'Medium';
		
		// Map Jira status to task status
		const taskStatus = ticketingSystem.mapTicketStatusToTaskmaster(status);
		
		// Map Jira priority to task priority
		const taskPriority = ticketingSystem.mapTicketPriorityToTaskmaster(priority);
		
		// Generate a reference ID for the task
		const refId = generateUserStoryRefId(nextTaskId, true);
		
		// Create the new task
		const newTask = {
			id: nextTaskId,
			title: summary,
			description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
			status: taskStatus || 'pending',
			priority: taskPriority || 'medium',
			dependencies: [],
			details: description,
			testStrategy: '',
			subtasks: [],
			metadata: {
				jiraKey: ticketId,
				refId: refId, // Add the reference ID
				lastTicketSync: new Date().toISOString()
			}
		};
		
		return newTask;
	} catch (error) {
		logger.error(`Error creating task from ticket ${ticket.key}: ${error.message}`);
		return null;
	}
}

/**
 * Create a new subtask object from a Jira subtask ticket
 * @param {Object} subtask - Jira subtask ticket
 * @param {Object} ticketingSystem - Ticketing system instance
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} New subtask object or null if creation failed
 */
async function createSubtaskFromTicket(subtask, ticketingSystem, options) {
	const { projectRoot, logger = console, debug = false, nextSubtaskId, parentTaskId } = options;
	
	try {
		// Extract essential data from subtask
		const subtaskId = subtask.key;
		const summary = subtask.fields.summary;
		const description = (subtask.fields.description && typeof subtask.fields.description === 'string') 
			? subtask.fields.description 
			: '';
		const status = subtask.fields.status?.name || 'To Do';
		
		// Map Jira status to task status
		const subtaskStatus = ticketingSystem.mapTicketStatusToTaskmaster(status);
		
		// Generate a reference ID for the subtask if parent task ID is provided
		const refId = parentTaskId ? generateSubtaskRefId(parentTaskId, nextSubtaskId, true) : null;
		
		// Create the new subtask
		const newSubtask = {
			id: nextSubtaskId,
			title: summary,
			description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
			status: subtaskStatus || 'pending',
			details: description,
			metadata: {
				jiraKey: subtaskId,
				refId: refId, // Add the reference ID
				lastTicketSync: new Date().toISOString()
			}
		};
		
		return newSubtask;
	} catch (error) {
		logger.error(`Error creating subtask from ticket ${subtask.key}: ${error.message}`);
		return null;
	}
}

/**
 * Update an existing task with data from a Jira ticket
 * @param {Object} task - Task object to update
 * @param {Object} ticket - Jira ticket object
 * @param {Object} ticketingSystem - Ticketing system instance
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Updated task object or null if update failed
 */
async function updateTaskFromTicket(task, ticket, ticketingSystem, options) {
	const { projectRoot, logger = console, debug = false } = options;
	
	try {
		// Extract essential data from ticket
		const summary = ticket.fields.summary;
		const description = (ticket.fields.description && typeof ticket.fields.description === 'string') 
			? ticket.fields.description 
			: '';
		const status = ticket.fields.status?.name || 'To Do';
		const priority = ticket.fields.priority?.name || 'Medium';
		
		// Map Jira status to task status
		const taskStatus = ticketingSystem.mapTicketStatusToTaskmaster(status);
		
		// Map Jira priority to task priority
		const taskPriority = ticketingSystem.mapTicketPriorityToTaskmaster(priority);
		
		// Create a copy of the task to update
		const updatedTask = { ...task };
		
		// Update title if significantly different
		if (summary && summary !== task.title) {
			updatedTask.title = summary;
		}
		
		// Update status if different
		if (taskStatus && taskStatus !== task.status) {
			updatedTask.status = taskStatus;
		}
		
		// Update priority if different
		if (taskPriority && taskPriority !== task.priority) {
			updatedTask.priority = taskPriority;
		}
		
		// Update description/details if significantly changed and description is not empty
		if (description && description.length > 0 && (!task.details || !task.details.includes(description.substring(0, 100)))) {
			// Add the ticket description to the task details with a timestamp
			const timestamp = new Date().toISOString();
			const descriptionUpdate = `\n\n[TICKET UPDATE: ${timestamp}]\n${description}`;
			
			if (!updatedTask.details) {
				updatedTask.details = descriptionUpdate.trim();
			} else {
				updatedTask.details += descriptionUpdate;
			}
		}
		
		// Update metadata
		updatedTask.metadata = updatedTask.metadata || {};
		updatedTask.metadata.lastTicketSync = new Date().toISOString();
		
		return updatedTask;
	} catch (error) {
		logger.error(`Error updating task from ticket: ${error.message}`);
		return null;
	}
}

/**
 * Update an existing subtask with data from a Jira subtask ticket
 * @param {Object} subtask - Subtask object to update
 * @param {Object} ticket - Jira subtask ticket
 * @param {Object} ticketingSystem - Ticketing system instance
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Updated subtask object or null if update failed
 */
async function updateSubtaskFromTicket(subtask, ticket, ticketingSystem, options) {
	const { projectRoot, logger = console, debug = false } = options;
	
	try {
		// Extract essential data from ticket
		const summary = ticket.fields.summary;
		const description = (ticket.fields.description && typeof ticket.fields.description === 'string') 
			? ticket.fields.description 
			: '';
		const status = ticket.fields.status?.name || 'To Do';
		
		// Map Jira status to task status
		const subtaskStatus = ticketingSystem.mapTicketStatusToTaskmaster(status);
		
		// Create a copy of the subtask to update
		const updatedSubtask = { ...subtask };
		
		// Update title if significantly different
		if (summary && summary !== subtask.title) {
			updatedSubtask.title = summary;
		}
		
		// Update status if different
		if (subtaskStatus && subtaskStatus !== subtask.status) {
			updatedSubtask.status = subtaskStatus;
		}
		
		// Update description/details if significantly changed and description is not empty
		if (description && description.length > 0 && (!subtask.details || !subtask.details.includes(description.substring(0, 100)))) {
			// Add the ticket description to the subtask details with a timestamp
			const timestamp = new Date().toISOString();
			const descriptionUpdate = `\n\n[TICKET UPDATE: ${timestamp}]\n${description}`;
			
			if (!updatedSubtask.details) {
				updatedSubtask.details = descriptionUpdate.trim();
			} else {
				updatedSubtask.details += descriptionUpdate;
			}
		}
		
		// Update metadata
		updatedSubtask.metadata = updatedSubtask.metadata || {};
		updatedSubtask.metadata.lastTicketSync = new Date().toISOString();
		
		return updatedSubtask;
	} catch (error) {
		logger.error(`Error updating subtask from ticket: ${error.message}`);
		return null;
	}
}

/**
 * Get the next available task ID
 * @param {Array} tasks - Array of tasks
 * @returns {number} Next available task ID
 */
function getNextTaskId(tasks) {
	if (!tasks || tasks.length === 0) return 1;
	
	// Find the highest task ID
	const highestId = Math.max(...tasks.map(task => 
		typeof task.id === 'number' ? task.id : parseInt(task.id, 10)
	));
	
	return highestId + 1;
}

/**
 * Get the next available subtask ID
 * @param {Array} subtasks - Array of subtasks
 * @returns {number} Next available subtask ID
 */
function getNextSubtaskId(subtasks) {
	if (!subtasks || subtasks.length === 0) return 1;
	
	// Find the highest subtask ID
	const highestId = Math.max(...subtasks.map(subtask => 
		typeof subtask.id === 'number' ? subtask.id : parseInt(subtask.id, 10)
	));
	
	return highestId + 1;
}

/**
 * Synchronize tasks with the configured ticketing system
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force synchronization even if not enabled
 * @param {boolean} options.debug - Enable debug logging for troubleshooting
 * @param {Object} options.mcpLog - MCP logger functions
 * @param {string} options.direction - Sync direction: 'up', 'down', or 'bidirectional' (default)
 * @param {string} options.taskIds - Comma-separated list of task IDs to sync (e.g., '1,2,3.1,3.2')
 * @returns {Promise<Object>} Synchronization result
 */
async function syncTickets(tasksPath, options = {}) {
	const { 
		force = false, 
		debug = DEBUG, 
		mcpLog = null,
		direction = SYNC_DIRECTIONS.BIDIRECTIONAL,
		taskIds = null
	} = options;

	// Create custom logger
	const customLog = mcpLog || {
		info: log.bind(null, 'info'),
		warn: log.bind(null, 'warn'),
		error: log.bind(null, 'error'),
		success: log.bind(null, 'success')
	};

	// Debug console logger that bypasses the customLog
	const debugLog = (message) => {
		if (debug) {
			console.log(`[SYNC-TICKETS DEBUG] ${message}`);
		}
	};

	debugLog('Function started');
	debugLog(`Sync direction: ${direction}`);
	debugLog(`Task IDs filter: ${taskIds || 'none (all tasks)'}`);

	// Validate direction
	if (!Object.values(SYNC_DIRECTIONS).includes(direction)) {
		customLog.error(`Invalid direction: ${direction}`);
		return {
			success: false,
			message: `Invalid direction: ${direction}. Must be one of: ${Object.values(SYNC_DIRECTIONS).join(', ')}`
		};
	}

	// Extract project root from the tasks path
	const projectRoot = tasksPath.replace(/[\/]tasks[\/]tasks\.json$/, '');

	customLog.info('Starting task synchronization with ticketing system...');

	// Statistics for reporting
	const stats = {
		tasksCreated: 0,
		subtasksCreated: 0,
		tasksUpdated: 0,
		subtasksUpdated: 0,
		ticketsUpdated: 0,
		tasksWithTicketUpdates: 0,
		subtasksWithTicketUpdates: 0,
		tasksWithTimestampsAdded: 0,
		errors: 0
	};

	try {
		// Get the configured ticketing system
		let ticketingSystem;
		try {
			ticketingSystem = await getTicketingSystem(projectRoot);
			if (!ticketingSystem) {
				customLog.error('No ticketing system configured');
				return {
					success: false,
					message: 'Error: No ticketing system configured'
				};
			}
		} catch (error) {
			customLog.error(`Error getting ticketing system: ${error.message}`);
			return {
				success: false,
				message: `Error: ${error.message}`
			};
		}

		// Check if ticketing is enabled
		let enabled = false;
		try {
			enabled = await getTicketingSystemEnabled(projectRoot);
		} catch (error) {
			customLog.error(
				`Error checking if ticketing is enabled: ${error.message}`
			);
			return {
				success: false,
				message: `Ticketing system error: ${error.message}`
			};
		}

		// Return if not enabled and not forced
		if (!force && !enabled) {
			customLog.info(
				'Ticketing system integration is not enabled and not forced'
			);
			customLog.warn('Ticketing system integration is not enabled.');
			return {
				success: false,
				message:
					'Ticketing system integration is not enabled. Use --force to override.'
			};
		}

		// Read tasks data
		customLog.info(`Reading tasks from ${tasksPath}...`);
		const data = options.readJSON?.(tasksPath) || readJSON(tasksPath);

		if (!data || !data.tasks || !Array.isArray(data.tasks)) {
			customLog.error(`Invalid tasks data in ${tasksPath}`);
			return { success: false, message: 'Error: Invalid tasks data' };
		}
		
		// Special handling for DOWN direction with no specific task IDs
		// Import all tickets from Jira and create/update tasks for them
		if (direction === SYNC_DIRECTIONS.DOWN && !taskIds) {
			customLog.info('Performing full import of all tickets from ticketing system to tasks...');
			
			const importStats = await importAllTicketsFromJira(data, ticketingSystem, {
				projectRoot,
				customLog,
				debug,
				debugLog
			});
			
			// Merge import stats into main stats
			Object.assign(stats, importStats);
			
			// Save the updated tasks file
			customLog.info('Saving updated tasks.json file...');
			options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
			
			// Regenerate task files
			try {
				const outputDir = path.dirname(tasksPath);
				customLog.info(`Preparing to regenerate ${stats.tasksCreated + stats.tasksUpdated} task files`);
				customLog.info('Validating and fixing dependencies');
				await generateTaskFiles(tasksPath, outputDir);
			} catch (error) {
				customLog.error(`Error regenerating task files: ${error.message}`);
				// Not critical, so don't fail the whole operation
			}
			
			// Add ticketing system type to results
			const ticketingSystemType = getTicketingSystemType(projectRoot);
			
			return {
				success: true,
				stats,
				ticketingSystemType
			};
		}

		// Define a helper function for bidirectional synchronization
		const performBidirectionalSync = async (
			taskItem,
			ticketIdentifier,
			isSubtaskItem
		) => {
			try {
				debugLog(
					`Performing ${direction} sync for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} with ticket ${ticketIdentifier}...`
				);

				if (!ticketingSystem) {
					customLog.error(
						`Ticketing system is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`
					);
					return false;
				}

				if (!ticketIdentifier) {
					customLog.error(
						`Ticket identifier is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`
					);
					return false;
				}

				let result = { tasksUpdated: false, ticketsUpdated: false };

				// Perform synchronization based on direction
				if (direction === SYNC_DIRECTIONS.BIDIRECTIONAL) {
					// Use the bidirectional sync utility
					result = await bidirectionalSync(
						taskItem,
						ticketIdentifier,
						ticketingSystem,
						{
							isSubtask: isSubtaskItem,
							projectRoot,
							logger: customLog,
							debug: debug,
							onTaskUpdated: (task) => {
								customLog.success(
									`Updated ${isSubtaskItem ? 'subtask' : 'task'} ${task.id} from ticket ${ticketIdentifier}`
								);

								// Update last sync timestamp
								task.metadata = task.metadata || {};
								task.metadata.lastTicketSync = new Date().toISOString();

								if (isSubtaskItem) {
									stats.subtasksWithTicketUpdates++;
								} else {
									stats.tasksWithTicketUpdates++;
								}

								// Save the updated task to tasks.json
								debugLog('Saving updated task to tasks.json');
								options.writeJSON?.(tasksPath, data) ||
									writeJSON(tasksPath, data);
							},
							onTicketUpdated: (task, ticketId) => {
								customLog.success(
									`Updated ticket ${ticketId} from ${isSubtaskItem ? 'subtask' : 'task'} ${task.id}`
								);
								
								if (isSubtaskItem) {
									stats.subtasksUpdated++;
								} else {
									stats.tasksUpdated++;
								}
								stats.ticketsUpdated++;
							}
						}
					);
				} else if (direction === SYNC_DIRECTIONS.UP) {
					// Push tasks to tickets (up)
					const statusResult = await pushTaskStatusToTicket(
						taskItem,
						ticketIdentifier,
						ticketingSystem,
						{
							isSubtaskItem: isSubtaskItem,
							projectRoot,
							logger: customLog,
							debug,
							onStatusChanged: (updatedTask, newStatus, originalTicketStatus) => {
								result.ticketsUpdated = true;
								
								if (isSubtaskItem) {
									stats.subtasksUpdated++;
								} else {
									stats.tasksUpdated++;
								}
								stats.ticketsUpdated++;
							}
						}
					);
					result.ticketsUpdated = statusResult;
				} else if (direction === SYNC_DIRECTIONS.DOWN) {
					// Pull tickets to tasks (down)
					const pullResult = await pullTicketUpdatesToTask(
						taskItem,
						ticketIdentifier,
						ticketingSystem,
						{
							isSubtask: isSubtaskItem,
							projectRoot,
							logger: customLog,
							debug,
							onTaskUpdated: (task) => {
								result.tasksUpdated = true;
								
								// Update last sync timestamp
								task.metadata = task.metadata || {};
								task.metadata.lastTicketSync = new Date().toISOString();

								if (isSubtaskItem) {
									stats.subtasksWithTicketUpdates++;
								} else {
									stats.tasksWithTicketUpdates++;
								}

								// Save the updated task to tasks.json
								debugLog('Saving updated task to tasks.json');
								options.writeJSON?.(tasksPath, data) ||
									writeJSON(tasksPath, data);
							}
						}
					);
					result.tasksUpdated = pullResult;
				}

				return result.tasksUpdated || result.ticketsUpdated;
			} catch (error) {
				customLog.error(
					`Error during ${direction} sync for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${error.message}`
				);
				stats.errors++;
				return false;
			}
		};

		// Parse task IDs filter if provided
		let taskIdsToSync = null;
		if (taskIds) {
			taskIdsToSync = taskIds.split(',').map(id => id.trim());
			customLog.info(`Filtering to sync only tasks: ${taskIdsToSync.join(', ')}`);
		}

		// Filter tasks if needed
		const tasksToProcess = taskIdsToSync 
			? data.tasks.filter(task => {
				// Check if the task ID is in the list
				if (taskIdsToSync.includes(task.id.toString())) {
					return true;
				}
				
				// Check for subtasks if the task has them
				if (task.subtasks && Array.isArray(task.subtasks)) {
					return task.subtasks.some(subtask => 
						taskIdsToSync.includes(`${task.id}.${subtask.id}`) || 
						taskIdsToSync.includes(subtask.id.toString())
					);
				}
				
				return false;
			})
			: data.tasks;

		customLog.info(
			`Processing ${tasksToProcess.length} tasks from ${tasksPath}...`
		);

		// Process each task
		for (const task of tasksToProcess) {
			// Only process specific tasks if IDs are filtered
			if (taskIdsToSync && !taskIdsToSync.includes(task.id.toString())) {
				// This is a parent task that contains subtasks we want to sync
				// but we don't want to sync the parent itself
				customLog.info(`Skipping parent task ${task.id} (only processing its selected subtasks)`);
			} else {
				// Variables declared outside try block for proper scope
				let originalParentTicketId = null;
				let finalTicketId = null;

				try {
					customLog.info(`Processing task ${task.id}: ${task.title}`);

					// Store the original parent task ticketId before processing subtasks
					originalParentTicketId = getTicketId(task);

					// Get reference ID for the task
					const refId = getRefId(task);
					debugLog(`Task ${task.id} reference ID: ${refId || 'undefined'}`);

					if (!refId) {
						customLog.warn(`Task ${task.id} has no reference ID, skipping`);
						continue;
					}

					// Check if task already has a ticket ID
					let ticketId = getTicketId(task);
					debugLog(
						`Task ${task.id} initial ticketId check: ${ticketId || 'undefined'}`
					);

					// If ticket ID exists, verify it actually exists in Jira
					if (ticketId) {
						try {
							const ticketExists = await ticketingSystem.ticketExists(
								ticketId,
								projectRoot
							);
							if (!ticketExists) {
								customLog.warn(
									`Ticket ${ticketId} for task ${task.id} does not exist in ticketing system, will recreate`
								);
								// For safety, assume ticket doesn't exist and try to recreate
								task.metadata = task.metadata || {};
								delete task.metadata.jiraKey;
								ticketId = null;
							}
						} catch (error) {
							customLog.error(
								`Error checking if ticket ${ticketId} exists: ${error.message}`
							);
							stats.errors++;
							// For safety, assume ticket doesn't exist and try to recreate
							task.metadata = task.metadata || {};
							delete task.metadata.jiraKey;
							ticketId = null;
						}
					}

					// If no ticket ID in metadata, try to find it by reference ID
					if (!ticketId) {
						customLog.info(
							`No ticket ID found in metadata for task ${task.id}. Searching by reference ID ${refId}...`
						);
						try {
							ticketId = await ticketingSystem.findTicketByRefId(
								refId,
								projectRoot
							);
							if (ticketId) {
								customLog.success(
									`Found ticket ${ticketId} for task ${task.id} by reference ID ${refId}`
								);
								// Store the ticket ID in task metadata
								debugLog(
									`Storing ticket ID ${ticketId} in task ${task.id} metadata`
								);
								storeTicketId(task, ticketId);

								// Save the updated metadata
								debugLog('Saving updated metadata to tasks.json');
								options.writeJSON?.(tasksPath, data) ||
									writeJSON(tasksPath, data);
								stats.tasksUpdated++;
							}
						} catch (error) {
							customLog.error(
								`Error finding ticket by reference ID ${refId}: ${error.message}`
							);
							stats.errors++;
						}
					}

					// Create a new ticket if not found
					if (!ticketId) {
						customLog.info(
							`Creating new ticket for task ${task.id} (${refId})...`
						);
						debugLog(`TICKET CREATION: Starting creation for task ${task.id} with refId ${refId}`);
						try {
							// Use the centralized ticket creation utility with extra debugging
							debugLog(`TICKET CREATION: About to call debugCreateTicketForTask for task ${task.id}`);
							ticketId = await debugCreateTicketForTask(task, ticketingSystem, {
								projectRoot,
								logger: customLog,
								debug
							});
							debugLog(`TICKET CREATION: debugCreateTicketForTask returned: ${ticketId || 'undefined'}`);

							if (ticketId) {
								customLog.success(
									`Created ticket ${ticketId} for task ${task.id}`
								);

								// Save the updated tasks file
								debugLog('Saving updated metadata to tasks.json');
								options.writeJSON?.(tasksPath, data) ||
									writeJSON(tasksPath, data);
								stats.tasksCreated++;
							} else {
								customLog.error(`Failed to create ticket for task ${task.id}`);
								debugLog(`TICKET CREATION: No ticketId returned from debugCreateTicketForTask for task ${task.id}`);
								stats.errors++;
							}
						} catch (error) {
							customLog.error(
								`Failed to create ticket for task ${task.id}: ${error.message}`
							);
							debugLog(`TICKET CREATION ERROR: ${error.message}\n${error.stack}`);
							stats.errors++;
						}
					}

					// If we have a ticket ID, perform the sync
					if (ticketId) {
						debugLog(`Performing ${direction} sync for task ${task.id} with ticket ${ticketId}...`);
						await performBidirectionalSync(task, ticketId, false);
					}
				} catch (error) {
					customLog.error(`Error processing task ${task.id}: ${error.message}`);
					stats.errors++;
				}
			}

			// Process subtasks if present
			if (task.subtasks && task.subtasks.length > 0) {
				// Get the parent ticketId
				const parentTicketId = getTicketId(task);

				// Skip subtasks processing if parent doesn't have a ticket and we need one
				if (!parentTicketId) {
					customLog.warn(
						`Parent task ${task.id} has no ticket ID, skipping subtasks`
					);
					continue;
				}

				// Filter subtasks if needed
				const subtasksToProcess = taskIdsToSync 
					? task.subtasks.filter(subtask => {
						const fullSubtaskId = `${task.id}.${subtask.id}`;
						return taskIdsToSync.includes(fullSubtaskId) || 
							taskIdsToSync.includes(subtask.id.toString());
					})
					: task.subtasks;

				customLog.info(
					`Processing ${subtasksToProcess.length} subtasks for task ${task.id}...`
				);

				// Process each subtask
				for (const subtask of subtasksToProcess) {
					try {
						// Get reference ID for subtask
						const subtaskRefId = getRefId(subtask);
						if (!subtaskRefId) {
							customLog.warn(
								`Subtask ${subtask.id} has no reference ID, skipping`
							);
							continue;
						}

						// Check if subtask already has a ticket ID
						let subtaskTicketId = getTicketId(subtask, {
							parentTask: task,
							debug
						});

						// If subtask has a ticket ID, synchronize it
						if (subtaskTicketId) {
							debugLog(
								`Synchronizing ${direction} for subtask ${subtask.id} with ticket ${subtaskTicketId}...`
							);
							await performBidirectionalSync(subtask, subtaskTicketId, true);
						} else {
							// If we're doing "up" or "bidirectional" sync, create the subtask ticket
							if (direction === SYNC_DIRECTIONS.UP || direction === SYNC_DIRECTIONS.BIDIRECTIONAL) {
								// Create subtask ticket if it doesn't exist
								customLog.info(
									`Creating ticket for subtask ${subtask.id} under parent ${parentTicketId}...`
								);
								try {
									subtaskTicketId = await createSubtaskTicket(
										subtask,
										parentTicketId,
										ticketingSystem,
										{
											parentTask: task,
											projectRoot,
											logger: customLog,
											debug
										}
									);

									if (subtaskTicketId) {
										customLog.success(
											`Created subtask ticket ${subtaskTicketId} for subtask ${subtask.id}`
										);
										// Save the updated metadata
										debugLog('Saving updated metadata to tasks.json');
										options.writeJSON?.(tasksPath, data) ||
											writeJSON(tasksPath, data);
										stats.subtasksCreated++;

										// If successful, synchronize the newly created subtask ticket
										if (direction === SYNC_DIRECTIONS.BIDIRECTIONAL) {
											await performBidirectionalSync(subtask, subtaskTicketId, true);
										}
									} else {
										customLog.error(
											`Failed to create ticket for subtask ${subtask.id}`
										);
										stats.errors++;
									}
								} catch (error) {
									customLog.error(
										`Failed to create ticket for subtask ${subtask.id}: ${error.message}`
									);
									stats.errors++;
								}
							}
						}
					} catch (error) {
						customLog.error(
							`Error processing subtask ${subtask.id}: ${error.message}`
						);
						stats.errors++;
					}
				}
			}
		}

		// All tasks processed, save the updated tasks file
		debugLog('Saving final updated tasks.json');
		options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);

		// Also regenerate task files
		try {
			debugLog('Regenerating task files');
			const outputDir = path.dirname(tasksPath);
			await generateTaskFiles(tasksPath, outputDir);
		} catch (error) {
			customLog.error(`Error regenerating task files: ${error.message}`);
			// Not critical, so don't fail the whole operation
		}

		// Add ticketing system type to results
		const ticketingSystemType = getTicketingSystemType(projectRoot);

		return {
			success: true,
			stats,
			ticketingSystemType
		};
	} catch (error) {
		customLog.error(`Unexpected error in syncTickets: ${error.message}`);
		if (debug) {
			console.error(error.stack);
		}
		return {
			success: false,
			message: `Unexpected error: ${error.message}`,
			stats
		};
	}
}

export default syncTickets;
