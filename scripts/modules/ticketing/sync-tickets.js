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

// Default debug mode - set to false in production
const DEBUG = false;

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
			console.log(`[SYNC-TICKETS DEBUG] ${message}`);
		}
	};

	debugLog('Function started');

	// Extract project root from the tasks path
	const projectRoot = tasksPath.replace(/[\/]tasks[\/]tasks\.json$/, '');

	customLog.info('Starting task synchronization with ticketing system...');

	// Get the configured ticketing system
	let ticketingSystem;
	try {
		ticketingSystem = await getTicketingSystem(projectRoot);
	} catch (error) {
		customLog.error(`Error getting ticketing system: ${error.message}`);
		return { success: false, message: `Error getting ticketing system: ${error.message}` };
	}

	// Exit if no ticketing system or not enabled (unless force=true)
	if (!ticketingSystem) {
		customLog.warn(`No ticketing system configured.`);
		return { success: false, message: 'No ticketing system configured' };
	}

	// Check if ticketing is enabled
	let enabled;
	try {
		enabled = getTicketingSystemEnabled(projectRoot);
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
		ticketsUpdated: 0,
		tasksWithTimestampsAdded: 0,
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
				if (!refId) {
					customLog.warn(
						`Task ${task.id || 'unknown'} has no reference ID, skipping`
					);
					continue;
				}

				// Check if task already has a ticket ID
				let ticketId = ticketingSystem.getTicketId(task);

				// If ticket ID exists, verify it actually exists in Jira
				if (ticketId) {
					try {
						const ticketExists = await ticketingSystem.ticketExists(ticketId, projectRoot);
						if (!ticketExists) {
							customLog.warn(`Ticket ${ticketId} referenced in task ${task.id} does not exist in Jira. Will recreate.`);
							task.metadata = task.metadata || {};
							delete task.metadata.jiraKey;
							ticketId = null;
						}
					} catch (error) {
						customLog.error(
							`Error verifying ticket ${ticketId}: ${error.message}`
						);
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
						ticketId = await ticketingSystem.findTicketByRefId(refId, projectRoot);
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
					customLog.info(`Creating new ticket for task ${task.id} (${refId})...`);
					try {
						const title = formatTitleForTicket(task);
						customLog.info(`Creating story with title: ${title}`);

						// Actually call the Jira API to create the ticket
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
						debugLog(`Storing ticket ID ${ticketId} in task ${task.id} metadata`);
						ticketingSystem.storeTicketId(task, ticketId);
						
						// Save the updated metadata
						debugLog('Saving updated metadata to tasks.json');
						options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
						stats.tasksCreated++;
					} catch (error) {
						
						customLog.error(
							`Failed to create ticket for task ${task.id}: ${error.message}`
						);
						stats.errors++;
					}
				}

				debugLog('checking subtasks...');

				/**
				 * Synchronizes status between TaskMaster and ticketing system
				 * @param {Object} taskItem - The task or subtask object
				 * @param {string} ticketIdentifier - The ticket ID in the ticketing system
				 * @param {boolean} isSubtaskItem - Whether this is a subtask
				 * @returns {Promise<void>}
				 */
				async function synchronizeTaskStatus(taskItem, ticketIdentifier, isSubtaskItem) {
					debugLog(`Syncing status for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} with ticket ${ticketIdentifier}`);
					
					try {
						// Get the current status from the ticketing system
						const ticketStatus = await ticketingSystem.getTicketStatus(ticketIdentifier, projectRoot);
						if (!ticketStatus) {
							debugLog(`No status found for ticket ${ticketIdentifier}`);
							return;
						}
						
						// Map the ticketing system status to TaskMaster status
						const jiraStatusInTaskmaster = ticketingSystem.mapTicketStatusToTaskmaster(
							ticketStatus.status
						);
						
						// Get current status of the task/subtask
						const currentTaskStatus = taskItem.status || 'pending';
						
						// Get last update timestamps
						const jiraLastUpdated = ticketStatus.updated || null;
						let taskLastUpdated = (taskItem.metadata && taskItem.metadata.lastStatusUpdate) || null;
						
						// Initialize task timestamp if missing
						if (!taskLastUpdated && jiraLastUpdated) {
							debugLog(`No timestamp in TaskMaster, initializing from Jira's updated time: ${jiraLastUpdated}`);
							if (!taskItem.metadata) taskItem.metadata = {};
							taskItem.metadata.lastStatusUpdate = jiraLastUpdated;
							taskLastUpdated = jiraLastUpdated;
							stats.tasksWithTimestampsAdded = (stats.tasksWithTimestampsAdded || 0) + 1;
						}
						
						debugLog(`${isSubtaskItem ? 'Subtask' : 'Task'} ${taskItem.id} status: ${currentTaskStatus} (last updated: ${taskLastUpdated || 'never'})`);
						debugLog(`Jira status: ${jiraStatusInTaskmaster} (last updated: ${jiraLastUpdated || 'never'})`);
						
						// Different status detected, determine which is more recent
						if (currentTaskStatus !== jiraStatusInTaskmaster) {
							// Case 1: Task was updated more recently than Jira - update Jira
							if (taskLastUpdated && (!jiraLastUpdated || new Date(taskLastUpdated) > new Date(jiraLastUpdated))) {
								debugLog(`TaskMaster has more recent update (${taskLastUpdated}), updating Jira ticket`);
								
								try {
									const updated = await ticketingSystem.updateTicketStatus(ticketIdentifier, currentTaskStatus, projectRoot, taskItem);
									if (updated) {
										customLog.success(`Updated Jira ticket ${ticketIdentifier} status to match TaskMaster ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} status: ${currentTaskStatus}`);
										stats.ticketsUpdated = (stats.ticketsUpdated || 0) + 1;
									} else {
										customLog.error(`Failed to update Jira ticket ${ticketIdentifier} status, but will preserve local ${isSubtaskItem ? 'subtask' : 'task'} status`);
									}
								} catch (error) {
									customLog.error(`Error updating Jira ticket status: ${error.message}`);
								}
							}
							// Case 2: Jira was updated more recently than TaskMaster - update TaskMaster
							else if (jiraLastUpdated && (!taskLastUpdated || new Date(jiraLastUpdated) > new Date(taskLastUpdated))) {
								debugLog(`Jira has more recent update (${jiraLastUpdated}), updating TaskMaster ${isSubtaskItem ? 'subtask' : 'task'}`);
								
								// Update task status and set the timestamp to match Jira's
								taskItem.status = jiraStatusInTaskmaster;
								if (!taskItem.metadata) taskItem.metadata = {};
								taskItem.metadata.lastStatusUpdate = jiraLastUpdated;
								
								if (isSubtaskItem) {
									customLog.success(`Updated subtask ${taskItem.id} status to ${jiraStatusInTaskmaster} from Jira ticket ${ticketIdentifier}`);
									stats.subtasksUpdated++;
								} else {
									customLog.success(`Updated task ${taskItem.id} status to ${jiraStatusInTaskmaster} from Jira ticket ${ticketIdentifier}`);
									stats.tasksUpdated++;
								}
							} 
							// Case 3: Cannot determine which is more recent - use TaskMaster as source of truth
							else {
								debugLog(`Cannot determine which status is more recent, using TaskMaster as source of truth`);
								
								try {
									const updated = await ticketingSystem.updateTicketStatus(ticketIdentifier, currentTaskStatus, projectRoot, taskItem);
									if (updated) {
										customLog.success(`Updated Jira ticket ${ticketIdentifier} status to match TaskMaster status: ${currentTaskStatus}`);
										stats.ticketsUpdated = (stats.ticketsUpdated || 0) + 1;
									}
								} catch (error) {
									customLog.error(`Error updating Jira ticket status: ${error.message}`);
								}
							}
						} else {
							debugLog(`${isSubtaskItem ? 'Subtask' : 'Task'} and Jira status match (${currentTaskStatus}), no update needed`);
						}
					} catch (error) {
						customLog.error(`Error synchronizing status for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${error.message}`);
					}
				}

				// Process subtasks if present
				if (task.subtasks && task.subtasks.length > 0 && ticketId) {
					customLog.info(`Processing ${task.subtasks.length} subtasks for task ${task.id}...`);

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
								customLog.info(`No ticket ID found in metadata for subtask ${subtask.id}. Searching by reference ID ${subtaskRefId}...`);
								try {
									
									subtaskTicketId = await ticketingSystem.findTicketByRefId(subtaskRefId, projectRoot);

									if (subtaskTicketId) {
										customLog.success(
											`Found ticket ${subtaskTicketId} by reference ID ${subtaskRefId}`
										);
										// Store the ticket ID in subtask metadata
										ticketingSystem.storeTicketId(subtask, subtaskTicketId);

										// Try to get ticket status to retrieve updated timestamp
										try {
											const ticketStatus = await ticketingSystem.getTicketStatus(subtaskTicketId, projectRoot);
											if (ticketStatus && ticketStatus.updated) {
												// Initialize metadata if needed
												if (!subtask.metadata) subtask.metadata = {};
												
												// Add timestamp from Jira if not present in subtask
												if (!subtask.metadata.lastStatusUpdate) {
													subtask.metadata.lastStatusUpdate = ticketStatus.updated;
													stats.tasksWithTimestampsAdded++;
													debugLog(`Added timestamp from Jira to subtask ${subtask.id}: ${ticketStatus.updated}`);
												}
											}
										} catch (e) {
											debugLog(`Could not get ticket status for subtask timestamp: ${e.message}`);
										}

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
									const subtaskTitle = formatTitleForTicket(subtask);
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
									const result = await ticketingSystem.createStory(subtaskData, projectRoot);
									
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

						}
					} catch (subtaskError) {
						customLog.error(
							`Error processing subtask ${subtask.id}: ${subtaskError.message}`
						);
						stats.errors++;
					}
				}

				// After all subtasks are processed, synchronize their statuses with tickets
				if (task.subtasks && task.subtasks.length > 0) {
					customLog.info(`Synchronizing status for ${task.subtasks.length} subtasks of task ${task.id}...`);
					
					for (const subtask of task.subtasks) {
						try {
							// Get the ticket ID for this subtask
							const subtaskTicketId = ticketingSystem.getTicketId(subtask);
							if (subtaskTicketId) {
								// Get current subtask status
								const subtaskStatus = subtask.status || 'pending';
								
								// Get Jira status for comparison
								let jiraSubtaskStatus = null;
								try {
									const ticketStatus = await ticketingSystem.getTicketStatus(subtaskTicketId, projectRoot);
									if (ticketStatus) {
										jiraSubtaskStatus = ticketingSystem.mapTicketStatusToTaskmaster(ticketStatus.status);
										
										// Initialize metadata if needed
										if (!subtask.metadata) subtask.metadata = {};
										
										// Get last update timestamps
										const jiraLastUpdated = ticketStatus.updated || null;
										let subtaskLastUpdated = subtask.metadata.lastStatusUpdate || null;
										
										// If subtask doesn't have a timestamp but Jira does, populate it
										if (!subtaskLastUpdated && jiraLastUpdated) {
											debugLog(`No timestamp in subtask, initializing from Jira's updated time: ${jiraLastUpdated}`);
											subtask.metadata.lastStatusUpdate = jiraLastUpdated;
											subtaskLastUpdated = jiraLastUpdated;
											stats.tasksWithTimestampsAdded++;
										}
										
										// Different status detected, determine which is more recent
										if (subtaskStatus !== jiraSubtaskStatus) {
											// Case 1: Subtask was updated more recently than Jira - update Jira
											if (subtaskLastUpdated && (!jiraLastUpdated || new Date(subtaskLastUpdated) > new Date(jiraLastUpdated))) {
												debugLog(`Subtask has more recent update (${subtaskLastUpdated}), updating Jira ticket`);
												
												// Use the updated updateTicketStatus with subtask data
												const updated = await ticketingSystem.updateTicketStatus(subtaskTicketId, subtaskStatus, projectRoot, subtask);
												
												if (updated) {
													customLog.success(`Updated Jira ticket ${subtaskTicketId} status to match subtask ${subtask.id} status: ${subtaskStatus}`);
													stats.ticketsUpdated++;
												} else {
													customLog.error(`Failed to update Jira ticket ${subtaskTicketId} status, but will preserve local subtask status`);
												}
											}
											// Case 2: Jira was updated more recently than subtask - update subtask
											else if (jiraLastUpdated && (!subtaskLastUpdated || new Date(jiraLastUpdated) > new Date(subtaskLastUpdated))) {
												debugLog(`Jira has more recent update (${jiraLastUpdated}), updating subtask`);
												
												// Update subtask status and set the timestamp to match Jira's
												subtask.status = jiraSubtaskStatus;
												subtask.metadata.lastStatusUpdate = jiraLastUpdated;
												
												customLog.success(`Updated subtask ${subtask.id} status to ${jiraSubtaskStatus} from Jira ticket ${subtaskTicketId}`);
												stats.subtasksUpdated++;
											}
											// Case 3: Cannot determine which is more recent - use subtask as source of truth
											else {
												debugLog(`Cannot determine which status is more recent, using subtask as source of truth`);
												
												// Use the updated updateTicketStatus with subtask data
												const updated = await ticketingSystem.updateTicketStatus(subtaskTicketId, subtaskStatus, projectRoot, subtask);
												
												if (updated) {
													customLog.success(`Updated Jira ticket ${subtaskTicketId} status to match subtask status: ${subtaskStatus}`);
													stats.ticketsUpdated++;
												}
											}
										} else {
											debugLog(`Subtask and Jira status match (${subtaskStatus}), no update needed`);
										}
									}
								} catch (ticketError) {
									customLog.error(`Error getting ticket status for subtask ${subtask.id}: ${ticketError.message}`);
								}
							}
						} catch (syncError) {
							customLog.error(`Error synchronizing subtask ${subtask.id}: ${syncError.message}`);
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

				// Synchronize status for main task
				if (ticketId) {
					await synchronizeTaskStatus(task, ticketId, false);
				}
			} catch (taskError) {
				customLog.error(
					`Error processing task ${task.id || 'unknown'}: ${taskError.message}`
				);
				stats.errors++;
			}
		}

		// After processing existing tasks, fetch tickets from ticketing system for two-way sync
		customLog.info('Starting two-way sync with ticketing system...');

		// Fetch all tickets from the ticketing system
		const allTickets = await fetchAllTicketsFromSystem(ticketingSystem, projectRoot, customLog, debugLog);

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
			// Check if ticket exists in tasks.json
			if (existingTicketIds.has(ticketId)) {
				
				// Find the corresponding task to update its status
				let taskToUpdate = null;
				let isSubtask = false;
				
				// Search in main tasks
				for (const task of data.tasks) {
					if (ticketingSystem.getTicketId(task) === ticketId) {
						taskToUpdate = task;
						break;
					}
					
					// Search in subtasks
					if (!taskToUpdate && task.subtasks && Array.isArray(task.subtasks)) {
						for (const subtask of task.subtasks) {
							if (ticketingSystem.getTicketId(subtask) === ticketId) {
								taskToUpdate = subtask;
								isSubtask = true;
								break;
							}
						}
					}
				}
				
				// If task found, handle status synchronization based on timestamps
				if (taskToUpdate) {
						// Synchronize the main task status with the ticket
					await synchronizeTaskStatus(taskToUpdate, ticketId, isSubtask);
					continue;
				}
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

		// Always generate task files after a sync operation, particularly when tasks are added from Jira
		// This ensures even tasks that were added via two-way sync get their text files
		{
			customLog.info('Generating individual task files...');
			try {
				// The outputDir is the directory containing the tasks.json file
				const outputDir = path.dirname(tasksPath);
				await generateTaskFiles(tasksPath, outputDir, { mcpLog: customLog });
				customLog.success('Successfully generated individual task files');
			} catch (error) {
				customLog.error(`Failed to generate task files: ${error.message}`);
			}
		}

		// Return success with statistics
		const message = `Synchronization complete: ${stats.tasksCreated} tasks created, ${stats.subtasksCreated} subtasks created, ${stats.tasksUpdated} tasks updated, ${stats.subtasksUpdated} subtasks updated, ${stats.ticketsUpdated} tickets updated, ${stats.tasksWithTimestampsAdded} timestamps initialized, ${stats.errors} errors`;
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
};

/**
 * Export the syncTickets function
 */
export { syncTickets };
