/**
 * sync-tickets.js
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
import { getRefId, formatTitleForTicket } from './reference-id-service.js';
import generateTaskFiles from '../task-manager/generate-task-files.js';

// Add DEBUG constant at the top of the file
const DEBUG = true; // Set to true to enable debug logs

/**
 * Fetch all tickets from the ticketing system
 * @param {Object} ticketingSystem - Ticketing system implementation
 * @param {string} projectRoot - Project root
 * @param {Object} logger - Custom logger
 * @param {Function} debugLog - Debug logger
 * @returns {Promise<Array>} Array of tickets
 */
async function fetchAllTicketsFromSystem(ticketingSystem, projectRoot, logger, debugLog) {
	try {
		if (!ticketingSystem.getAllTickets) {
			logger.warn('Ticketing system does not support fetching all tickets');
			return [];
		}

		logger.info('Fetching all tickets from ticketing system...');
		debugLog('About to call getAllTickets...');
		const tickets = await ticketingSystem.getAllTickets(projectRoot);
		logger.success(`Fetched ${tickets.length} tickets from ticketing system`);
		return tickets;
	} catch (error) {
		logger.error(`Error fetching tickets: ${error.message}`);
		return [];
	}
}

/**
 * Convert a ticket from the ticketing system to a TaskMaster task
 * @param {Object} ticket - Ticket data
 * @param {Object} ticketingSystem - Ticketing system implementation
 * @returns {Object|null} Task data or null if conversion failed
 */
function convertTicketToTask(ticket, ticketingSystem) {
	try {
		// Basic task structure
		const task = {
			id: String(Math.floor(Math.random() * 1000) + 1000), // Temporary ID
			title: ticket.summary || ticket.title || 'Imported Task',
			description: ticket.description || '',
			details: ticket.details || '',
			status: ticketingSystem.mapTicketStatusToTaskmaster ? 
				ticketingSystem.mapTicketStatusToTaskmaster(ticket.status) : 'pending',
			priority: ticketingSystem.mapTicketPriorityToTaskmaster ? 
				ticketingSystem.mapTicketPriorityToTaskmaster(ticket.priority) : 'medium',
			metadata: {
				jiraKey: ticket.key || ticket.id, // Store the ticket ID
				importedAt: new Date().toISOString(), // Mark as imported
				source: 'ticketing-system'
			}
		};

		// If this is a subtask, set parentId if available
		if (ticket.isSubtask && ticket.parentKey) {
			task.isSubtask = true;
			task.parentKey = ticket.parentKey;
		}

		return task;
	} catch (error) {
		console.error(`Error converting ticket to task: ${error.message}`);
		return null;
	}
}

/**
 * Synchronize tasks with the configured ticketing system
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force synchronization even if not enabled
 * @param {boolean} options.debug - Enable debug logging for troubleshooting
 * @param {Object} options.mcpLog - MCP logger functions
 * @returns {Promise<Object>} Synchronization result
 */
async function syncTickets(tasksPath, options = {}) {
	const { force = false, debug = DEBUG, mcpLog = null } = options;

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
			console.log(`\n===== SYNC-TICKETS DEBUG: ${message} =====\n`);
		}
	};

	debugLog('Function started');
	customLog.info('Starting task synchronization with ticketing system...');

	// Extract project root from the tasks path
	const projectRoot = tasksPath.replace(/[\\/]tasks[\\/]tasks\.json$/, '');

	customLog.info(`Starting task synchronization with ticketing system...`);

	// Get the configured ticketing system
	debugLog('About to get ticketing system implementation...');
	let ticketingSystem;
	try {
		ticketingSystem = await getTicketingSystem(projectRoot);
		debugLog(`Ticketing system result: ${ticketingSystem ? ticketingSystem.constructor.name : 'NONE'}`);
		
		if (ticketingSystem) {
			// Check if getTicketId method exists
			const hasGetTicketId = typeof ticketingSystem.getTicketId === 'function';
			debugLog(`ticketingSystem.getTicketId exists: ${hasGetTicketId}`);
			
			// Check if createStory method exists
			const hasCreateStory = typeof ticketingSystem.createStory === 'function';
			debugLog(`ticketingSystem.createStory exists: ${hasCreateStory}`);
			
			// Check config
			const isConfigured = ticketingSystem.isConfigured ? ticketingSystem.isConfigured(projectRoot) : false;
			debugLog(`ticketingSystem.isConfigured result: ${isConfigured}`);
			
			// Check ticketing system type directly
			const ticketingType = getTicketingSystemType(projectRoot);
			debugLog(`Ticketing system type from config: ${ticketingType}`);
			
			// Check Jira configuration
			if (ticketingType === 'jira') {
				const jiraConfig = {
					projectKey: getJiraProjectKey(projectRoot),
					baseUrl: getJiraBaseUrl(projectRoot),
					email: getJiraEmail(projectRoot),
					apiToken: getJiraApiToken(projectRoot) ? 'SET' : 'NOT SET'
				};
				debugLog(`Jira configuration: ${JSON.stringify(jiraConfig)}`);
			}
		}
	} catch (error) {
		debugLog(`Error getting ticketing system: ${error.message}`);
		customLog.error(`Error getting ticketing system: ${error.message}`);
		return { success: false, message: `Error getting ticketing system: ${error.message}` };
	}

	// Exit if no ticketing system or not enabled (unless force=true)
	if (!ticketingSystem) {
		customLog.warn(`No ticketing system configured.`);
		return { success: false, message: 'No ticketing system configured' };
	}

	// Check if ticketing is enabled
	customLog.info('Checking if ticketing system integration is enabled...');
	let enabled;
	try {
		enabled = getTicketingSystemEnabled(projectRoot);
		customLog.info(`Ticketing integration enabled: ${enabled}`);
	} catch (error) {
		customLog.error(`Error checking if ticketing is enabled: ${error.message}`);
		return { success: false, message: `Ticketing system error: ${error.message}` };
	}

	// Return if not enabled and not forced
	if (!force && !enabled) {
		customLog.info('Ticketing system integration is not enabled and not forced');
		customLog.warn('Ticketing system integration is not enabled.');
		return {
			success: false,
			message: 'Ticketing system integration is not enabled. Use --force to override or update your .taskmasterconfig file to enable ticketing integration.'
		};
	}

	// Check if ticketing system is properly configured
	if (!ticketingSystem.isConfigured(projectRoot)) {
		customLog.warn(`Ticketing system is not properly configured.`);
		return {
			success: false,
			message: 'Ticketing system is not properly configured'
		};
	}

	// Statistics for reporting
	const stats = {
		tasksCreated: 0,
		subtasksCreated: 0,
		tasksUpdated: 0,
		subtasksUpdated: 0,
		errors: 0
	};

	try {
		// Read tasks data
		customLog.info(`Reading tasks from ${tasksPath}...`);
		const data = options.readJSON?.(tasksPath) || readJSON(tasksPath);

		if (!data || !data.tasks || !Array.isArray(data.tasks)) {
			customLog.error(`Invalid tasks data in ${tasksPath}`);
			return { success: false, message: 'Error: Invalid tasks data' };
		}

		customLog.info(`Processing ${data.tasks.length} tasks from ${tasksPath}...`);
		
		// Process each task
		for (const task of data.tasks) {
			try {
				customLog.info(`Processing task ${task.id}: ${task.title}`);
				
				// Get reference ID for the task
				const refId = getRefId(task);
				customLog.info(`Reference ID for task ${task.id}: ${refId || 'NONE'}`);
				
				if (!refId) {
					customLog.warn(
						`Task ${task.id || 'unknown'} has no reference ID, skipping`
					);
					continue;
				}

				// Check if task already has a ticket ID
				let ticketId = ticketingSystem.getTicketId(task);

				debugLog(`Ticket ID for task ${task.id}: ${ticketId || 'NONE'}`);

				// If ticket ID exists, verify it actually exists in Jira
				if (ticketId) {
					try {
						debugLog(`Verifying ticket ${ticketId} exists in Jira...`);
						const ticketExists = await ticketingSystem.ticketExists(ticketId, projectRoot);
						if (!ticketExists) {
							debugLog(`Ticket ${ticketId} does not exist in Jira! Clearing ID to recreate.`);
							customLog.warn(`Ticket ${ticketId} referenced in task ${task.id} does not exist in Jira. Will recreate.`);
							task.metadata = task.metadata || {};
							delete task.metadata.jiraKey;
							ticketId = null;
						} else {
							debugLog(`Ticket ${ticketId} verified to exist in Jira.`);
						}
					} catch (error) {
						debugLog(`Error verifying ticket ${ticketId}: ${error.message}`);
						customLog.error(`Error verifying ticket ${ticketId}: ${error.message}`);
						// For safety, assume ticket doesn't exist and try to recreate
						task.metadata = task.metadata || {};
						delete task.metadata.jiraKey;
						ticketId = null;
					}
				}

				// If no ticket ID in metadata, try to find it by reference ID
				if (!ticketId) {
					debugLog(`No ticket ID found in metadata for task ${task.id}, searching by reference ID ${refId}...`);
					customLog.info(
						`No ticket ID found in metadata for task ${task.id}. Searching by reference ID ${refId}...`
					);
					try {
						debugLog(`About to call findTicketByRefId with refId ${refId}...`);
						// DEBUG: Log state right before the call
						console.log(`CRITICAL DEBUG: About to search for ticket with refId ${refId}`);
						console.log(`CRITICAL DEBUG: Current ticketId before search: ${ticketId}`);
						
						ticketId = await ticketingSystem.findTicketByRefId(
							refId,
							projectRoot
						);
						debugLog(`findTicketByRefId returned: ${ticketId || 'NONE'}`);
						// DEBUG: Log state right after the call
						console.log(`CRITICAL DEBUG: findTicketByRefId returned: ${ticketId || 'NONE'}`);

						if (ticketId) {
							customLog.success(
								`Found ticket ${ticketId} by reference ID ${refId}`
							);
							// Store the ticket ID in task metadata
							ticketingSystem.storeTicketId(task, ticketId);
							// Save the updated metadata
							options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
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
					log('info', `ATTEMPTING TO CREATE TICKET for task ${task.id} with reference ID ${refId}`);
					customLog.info(
						`Creating new ticket for task ${task.id} (${refId})...`
					);
					try {
						const title = formatTitleForTicket(task);
						log('info', `Creating story with title: ${title}`);
						customLog.info(`Creating story with title: ${title}`);

						// Actually call the Jira API to create the ticket
						debugLog(`Calling createStory for task ${task.id} with title: ${title}`);
						
						// Use the API to create the ticket in Jira
						const result = await ticketingSystem.createStory(task, projectRoot);
						debugLog(`createStory result: ${JSON.stringify(result)}`);
						
						if (!result) {
							throw new Error('Failed to create ticket in Jira. API call returned no result.');
						}
						
						// Extract ticket ID from result
						ticketId = result.key || result.id;
						customLog.success(`Created ticket ${ticketId} for task ${task.id}`);

						// Store the ticket ID in task metadata
						log('info', `Storing ticket ID ${ticketId} in task ${task.id} metadata`);
						ticketingSystem.storeTicketId(task, ticketId);
						
						// Save the updated metadata
						log('info', 'Saving updated metadata to tasks.json');
						options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
						stats.tasksCreated++;
					} catch (error) {
						log('error', `Failed to create ticket for task ${task.id}: ${error.message}`);
						customLog.error(
							`Failed to create ticket for task ${task.id}: ${error.message}`
						);
						stats.errors++;
					}
				}

				debugLog('checking subtasks...');

				// Process subtasks if present
				if (task.subtasks && task.subtasks.length > 0 && ticketId) {
					customLog.info(
						`Processing ${task.subtasks.length} subtasks for task ${task.id}...`
					);

					for (const subtask of task.subtasks) {
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
							let subtaskTicketId = ticketingSystem.getTicketId(subtask);

							// If no ticket ID in metadata, try to find it by reference ID
							if (!subtaskTicketId) {
								debugLog(`No ticket ID found in metadata for subtask ${subtask.id}, searching by reference ID ${subtaskRefId}...`);
								customLog.info(
									`No ticket ID found in metadata for subtask ${subtask.id}. Searching by reference ID ${subtaskRefId}...`
								);
								try {
									debugLog(`About to call findTicketByRefId with refId ${subtaskRefId}...`);
									// DEBUG: Log state right before the call
									console.log(`CRITICAL DEBUG: About to search for ticket with refId ${subtaskRefId}`);
									console.log(`CRITICAL DEBUG: Current ticketId before search: ${subtaskTicketId}`);
									
									subtaskTicketId = await ticketingSystem.findTicketByRefId(
										subtaskRefId,
										projectRoot
									);
									debugLog(`findTicketByRefId returned: ${subtaskTicketId || 'NONE'}`);
									// DEBUG: Log state right after the call
									console.log(`CRITICAL DEBUG: findTicketByRefId returned: ${subtaskTicketId || 'NONE'}`);

									if (subtaskTicketId) {
										customLog.success(
											`Found ticket ${subtaskTicketId} by reference ID ${subtaskRefId}`
										);
										// Store the ticket ID in subtask metadata
										ticketingSystem.storeTicketId(subtask, subtaskTicketId);
										// Save the updated metadata
										options.writeJSON?.(tasksPath, data) ||
											writeJSON(tasksPath, data);
										stats.subtasksUpdated++;
									}
								} catch (error) {
									customLog.error(
										`Error finding ticket by reference ID ${subtaskRefId}: ${error.message}`
									);
									stats.errors++;
								}
							}

							// Create a new subtask ticket if not found
							if (!subtaskTicketId) {
								customLog.info(
									`Creating subtask for ${subtask.id} (${subtaskRefId})...`
								);
								try {
									debugLog(`About to format title for subtask ${subtask.id}`);
									const subtaskTitle = formatTitleForTicket(subtask);
									debugLog(`Formatted title: ${subtaskTitle}`);
									customLog.info(`Creating subtask with title: ${subtaskTitle}`);
									
									// Prepare subtask data for createStory
									const subtaskData = {
										...subtask,
										// Ensure these fields are present
										id: subtask.id,
										title: subtask.title || `Subtask ${subtask.id}`,
										description: subtask.description || '',
										details: subtask.details || '',
										priority: subtask.priority || task.priority || 'medium',
										status: subtask.status || 'pending',
										metadata: subtask.metadata || { refId: subtaskRefId },
										// Add parent info for subtasks
										parentId: task.id,
										parentTicketId: ticketId, // This is crucial for linking as subtask
										parentRefId: refId
									};
									debugLog(`Subtask data: ${JSON.stringify(subtaskData, null, 2)}`);
									debugLog(`Parent ticket ID for linking: ${ticketId || 'NONE'}`);
									
									debugLog('=== CALLING createStory for subtask... ===');
									const result = await ticketingSystem.createStory(subtaskData, projectRoot);
									debugLog(`=== createStory returned: ${JSON.stringify(result)} ===`);
									
									if (result) {
										subtaskTicketId = result.key || result.id;
										customLog.success(
											`Created ticket ${subtaskTicketId} for subtask ${subtask.id}`
										);

										// Store the ticket ID in subtask metadata
										ticketingSystem.storeTicketId(subtask, subtaskTicketId);
										// Save the updated metadata
										options.writeJSON?.(tasksPath, data) ||
											writeJSON(tasksPath, data);
										stats.subtasksCreated++;
									}
								} catch (error) {
									customLog.error(
										`Failed to create ticket for subtask ${subtask.id}: ${error.message}`
									);
									stats.errors++;
								}
							}

							
						} catch (subtaskError) {
							customLog.error(
								`Error processing subtask ${subtask.id}: ${subtaskError.message}`
							);
							stats.errors++;
						}
					}
				}
			} catch (taskError) {
				customLog.error(
					`Error processing task ${task.id || 'unknown'}: ${taskError.message}`
				);
				stats.errors++;
			}
		}

		// After processing existing tasks, fetch tickets from ticketing system for two-way sync
		debugLog('Starting two-way sync by fetching tickets from ticketing system');
		customLog.info('Starting two-way sync with ticketing system...');

		// Fetch all tickets from the ticketing system
		const allTickets = await fetchAllTicketsFromSystem(ticketingSystem, projectRoot, customLog, debugLog);
		debugLog(`Fetched ${allTickets.length} tickets from system`);

		// Build maps for quick lookup
		const existingTasksMap = new Map();
		const existingTicketIds = new Set();

		// Map tasks by ID and collect existing ticket IDs
		for (const task of data.tasks) {
			existingTasksMap.set(task.id, task);
			const ticketId = ticketingSystem.getTicketId(task);
			if (ticketId) {
				existingTicketIds.add(ticketId);
			}
			
			// Also check subtasks
			if (task.subtasks && Array.isArray(task.subtasks)) {
				for (const subtask of task.subtasks) {
					const subtaskTicketId = ticketingSystem.getTicketId(subtask);
					if (subtaskTicketId) {
						existingTicketIds.add(subtaskTicketId);
					}
				}
			}
		}

		// New arrays for tasks to be added
		const tasksToAdd = [];
		const subtasksToAdd = new Map(); // Map of parent ID to array of subtasks

		// Process tickets not in tasks.json
		for (const ticket of allTickets) {
			const ticketId = ticket.key || ticket.id;
			debugLog(`Processing ticket ${ticketId} from ticketing system`);
			
			// Skip if ticket already exists in tasks.json
			if (existingTicketIds.has(ticketId)) {
				debugLog(`Ticket ${ticketId} already exists in tasks.json, skipping`);
				continue;
			}
			
			// Convert ticket to task
			const newTask = convertTicketToTask(ticket, ticketingSystem);
			if (!newTask) {
				debugLog(`Failed to convert ticket ${ticketId} to task`);
				continue;
			}
			
			// Handle subtasks separately
			if (newTask.isSubtask && newTask.parentKey) {
				// Find the parent task ID by its ticket ID
				let parentTaskId = null;
				for (const task of data.tasks) {
					if (ticketingSystem.getTicketId(task) === newTask.parentKey) {
						parentTaskId = task.id;
						break;
					}
				}
				
				if (parentTaskId) {
					// Store subtask for later addition to parent
					if (!subtasksToAdd.has(parentTaskId)) {
						subtasksToAdd.set(parentTaskId, []);
					}
					
					// Format subtask ID to follow parent.subtask format
					const subtaskId = `${parentTaskId}.${subtasksToAdd.get(parentTaskId).length + 1}`;
					newTask.id = subtaskId;
					subtasksToAdd.get(parentTaskId).push(newTask);
					customLog.info(`Adding new subtask ${subtaskId} from ticket ${ticketId} to task ${parentTaskId}`);
					stats.subtasksUpdated++;
				} else {
					// Can't find parent, treat as regular task
					debugLog(`Could not find parent task for subtask ${ticketId}, adding as normal task`);
					delete newTask.isSubtask;
					delete newTask.parentKey;
					tasksToAdd.push(newTask);
					customLog.info(`Adding new task from ticket ${ticketId}`);
					stats.tasksUpdated++;
				}
			} else {
				// Add regular task
				tasksToAdd.push(newTask);
				customLog.info(`Adding new task from ticket ${ticketId}`);
				stats.tasksUpdated++;
			}
		}

		// Add new tasks to data.tasks
		if (tasksToAdd.length > 0) {
			// Generate proper sequential IDs
			let maxId = 0;
			for (const task of data.tasks) {
				const taskId = parseInt(task.id, 10);
				if (!isNaN(taskId) && taskId > maxId) {
					maxId = taskId;
				}
			}
			
			// Assign sequential IDs
			for (let i = 0; i < tasksToAdd.length; i++) {
				tasksToAdd[i].id = String(maxId + i + 1);
			}
			
			// Add the new tasks
			data.tasks = [...data.tasks, ...tasksToAdd];
			customLog.success(`Added ${tasksToAdd.length} new tasks from ticketing system`);
		}

		// Add subtasks to their parent tasks
		for (const [parentId, subtasks] of subtasksToAdd.entries()) {
			// Find the parent task
			const parentTask = data.tasks.find(task => task.id === parentId);
			if (parentTask) {
				// Initialize subtasks array if it doesn't exist
				if (!parentTask.subtasks) {
					parentTask.subtasks = [];
				}
				
				// Add the subtasks
				parentTask.subtasks = [...parentTask.subtasks, ...subtasks];
				customLog.success(`Added ${subtasks.length} subtasks to task ${parentId}`);
			}
		}

		// Save the final data
		options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);

		// Generate or update individual task files if tasks were added or updated
		if (stats.tasksCreated > 0 || stats.tasksUpdated > 0 || stats.subtasksCreated > 0 || stats.subtasksUpdated > 0) {
			customLog.info('Generating individual task files...');
			debugLog('Calling generateTaskFiles to update task text files');
			try {
				// The outputDir is the directory containing the tasks.json file
				const outputDir = path.dirname(tasksPath);
				await generateTaskFiles(tasksPath, outputDir, { mcpLog: customLog });
				customLog.success('Successfully generated individual task files');
			} catch (error) {
				debugLog(`Error generating task files: ${error.message}`);
				customLog.error(`Failed to generate task files: ${error.message}`);
			}
		}

		// Return success with statistics
		const message = `Synchronization complete: ${stats.tasksCreated} tasks created, ${stats.subtasksCreated} subtasks created, ${stats.tasksUpdated} tasks updated, ${stats.subtasksUpdated} subtasks updated, ${stats.errors} errors`;
		customLog.success(message);

		return {
			success: true,
			stats,
			message
		};
	} catch (error) {
		customLog.error(`Synchronization error: ${error.message}`);
		return {
			success: false,
			stats,
			message: `Error: ${error.message}`
		};
	}
}

export { syncTickets };
