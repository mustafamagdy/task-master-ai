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
    formatTitleForTicket
} from './utils/index.js';
import { 
    getTicketId, 
    storeTicketId, 
    synchronizeTaskStatus as syncTaskStatus,
    createTicketForTask,
    createSubtaskTicket,
    displaySyncTable
} from './utils/index.js';

// Default debug mode - set to false in production
const DEBUG = false;

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
        // Get the configured ticketing system
        let ticketingSystem;
        try {
            ticketingSystem = await getTicketingSystem(projectRoot);
            if (!ticketingSystem) {
                customLog.error('No ticketing system configured');
                return {
                    success: false,
                    message: 'Error: No ticketing system configured',
                    stats: {
                        tasksCreated: 0,
                        subtasksCreated: 0,
                        tasksUpdated: 0,
                        subtasksUpdated: 0,
                        ticketsUpdated: 0,
                        tasksWithTimestampsAdded: 0,
                        errors: 0
                    },
                    formattedDisplay: false // Flag indicating that formatted display has not been shown
                };
            }
        } catch (error) {
            customLog.error(`Error getting ticketing system: ${error.message}`);
            return {
                success: false,
                message: `Error: ${error.message}`,
                stats: {
                    tasksCreated: 0,
                    subtasksCreated: 0,
                    tasksUpdated: 0,
                    subtasksUpdated: 0,
                    ticketsUpdated: 0,
                    tasksWithTimestampsAdded: 0,
                    errors: 1
                },
                formattedDisplay: false // Flag indicating that formatted display has not been shown
            };
        }
        
        // Define a helper function for synchronizing task status
        const synchronizeTaskStatus = async (taskItem, ticketIdentifier, isSubtaskItem) => {
            try {
                debugLog(`Synchronizing status for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} with ticket ${ticketIdentifier}...`);
                
                if (!ticketingSystem) {
                    customLog.error(`Ticketing system is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
                    return false;
                }
                
                if (!ticketIdentifier) {
                    customLog.error(`Ticket identifier is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
                    return false;
                }
                
                // Use the centralized utility function for status synchronization
                const result = await syncTaskStatus(taskItem, ticketIdentifier, ticketingSystem, {
                    isSubtaskItem,
                    projectRoot,
                    logger: customLog,
                    debug: debug,
                    onStatusChanged: (task, newStatus, originalTicketStatus) => {
                        customLog.success(`Updated ${isSubtaskItem ? 'subtask' : 'task'} ${task.id} status from "${task.status}" to "${newStatus}" (original ticket status: "${originalTicketStatus}")`);
                        
                        // Update last status update timestamp
                        task.metadata = task.metadata || {};
                        task.metadata.lastStatusUpdate = new Date().toISOString();
                        
                        if (isSubtaskItem) {
                            stats.subtasksUpdated++;
                        } else {
                            stats.tasksUpdated++;
                        }
                        
                        // Save the updated status to tasks.json
                        debugLog('Saving updated status to tasks.json');
                        options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                    }
                });
                
                if (!result) {
                    debugLog(`No status change needed for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
                }
                
                return result;
            } catch (error) {
                customLog.error(`Error synchronizing status for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${error.message}`);
                stats.errors++;
                return false;
            }
        };

        // Check if ticketing is enabled
        let enabled = false;
        try {
            enabled = await getTicketingSystemEnabled(projectRoot);
        } catch (error) {
            customLog.error(`Error checking if ticketing is enabled: ${error.message}`);
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

        customLog.info(
            `Processing ${data.tasks.length} tasks from ${tasksPath}...`
        );

        // Process each task
        for (const task of data.tasks) {
            // Variables declared outside try block for proper scope
            let originalParentTicketId = null;
            let finalTicketId = null;
            
            try {
                customLog.info(`Processing task ${task.id}: ${task.title}`);

                // Store the original parent task ticketId before processing subtasks
                originalParentTicketId = getTicketId(task);
                console.log(`[PARENT-DEBUG] Original parent task ${task.id} ticketId: ${originalParentTicketId || 'undefined'}`);

                // Get reference ID for the task
                const refId = getRefId(task);
                debugLog(`Task ${task.id} reference ID: ${refId || 'undefined'}`);
                
                if (!refId) {
                    customLog.warn(
                        `Task ${task.id} has no reference ID, skipping`
                    );
                    continue;
                }

                // Check if task already has a ticket ID
                let ticketId = getTicketId(task);
                debugLog(`Task ${task.id} initial ticketId check: ${ticketId || 'undefined'}`);

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
                        // Use the centralized ticket creation utility
                        ticketId = await createTicketForTask(task, ticketingSystem, {
                            projectRoot,
                            logger: customLog,
                            debug
                        });
                        
                        if (ticketId) {
                            customLog.success(`Created ticket ${ticketId} for task ${task.id}`);
                            
                            // Save the updated tasks file
                            debugLog('Saving updated metadata to tasks.json');
                            options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                            stats.tasksCreated++;
                        } else {
                            customLog.error(`Failed to create ticket for task ${task.id}`);
                            stats.errors++;
                        }
                    } catch (error) {
                        customLog.error(`Failed to create ticket for task ${task.id}: ${error.message}`);
                        stats.errors++;
                    }
                }

                // Process subtasks if present
                if (task.subtasks && task.subtasks.length > 0 && ticketId) {
                    customLog.info(
                        `Processing ${task.subtasks.length} subtasks for task ${task.id}...`
                    );
                    
                    // Store the parent task's ticketId explicitly before processing subtasks
                    const parentTaskTicketId = getTicketId(task);
                    console.log(`[PARENT-DEBUG] Parent task ${task.id} ticketId: ${parentTaskTicketId || 'undefined'}`);
                    
                    // Check if we have a valid parent ticketId before proceeding
                    if (!parentTaskTicketId) {
                        customLog.error(`Synchronization error: parentTicketId is not defined`);
                        customLog.warn(`Ticket synchronization skipped: Error: parentTicketId is not defined`);
                    } else {
                        // Process each subtask
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
                                let subtaskTicketId = getTicketId(subtask, { parentTask: task, debug });
                                
                                // Log the subtask ticket ID for debugging
                                console.log(`[SUBTASK-DEBUG] Subtask ${subtask.id} ticketId: ${subtaskTicketId || 'undefined'}`);

                                // If subtask has a ticket ID, synchronize its status
                                if (subtaskTicketId) {
                                    debugLog(`Synchronizing status for subtask ${subtask.id} with ticket ${subtaskTicketId}...`);
                                    await synchronizeTaskStatus(subtask, subtaskTicketId, true);
                                }

                                // If no ticket ID in metadata, try to find it by reference ID
                                if (!subtaskTicketId) {
                                    customLog.info(
                                        `No ticket ID found in metadata for subtask ${subtask.id}. Searching by reference ID ${subtaskRefId}...`
                                    );
                                    try {
                                        subtaskTicketId = await ticketingSystem.findSubtaskByRefId(
                                            subtaskRefId,
                                            ticketId,
                                            projectRoot
                                        );
                                        if (subtaskTicketId) {
                                            customLog.success(
                                                `Found subtask ticket ${subtaskTicketId} for subtask ${subtask.id} by reference ID ${subtaskRefId}`
                                            );
                                            // Store the ticket ID in subtask metadata
                                            debugLog(
                                                `Storing ticket ID ${subtaskTicketId} in subtask ${subtask.id} metadata`
                                            );
                                            storeTicketId(subtask, subtaskTicketId);

                                            // Save the updated metadata
                                            debugLog('Saving updated metadata to tasks.json');
                                            options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                                            stats.subtasksUpdated++;
                                        }
                                    } catch (error) {
                                        customLog.error(
                                            `Error finding subtask by reference ID ${subtaskRefId}: ${error.message}`
                                        );
                                        stats.errors++;
                                    }
                                }
                                
                                // Create a new subtask ticket if not found
                                if (!subtaskTicketId) {
                                    customLog.info(`Creating new subtask ticket for subtask ${subtask.id} under parent ${ticketId}...`);
                                    try {
                                        // Use the centralized subtask ticket creation utility
                                        subtaskTicketId = await createSubtaskTicket(subtask, task, ticketingSystem, {
                                            projectRoot,
                                            logger: customLog,
                                            debug
                                        });
                                        
                                        if (subtaskTicketId) {
                                            customLog.success(`Created subtask ticket ${subtaskTicketId} for subtask ${subtask.id} under parent ${ticketId}`);
                                            
                                            // Save the updated tasks file
                                            debugLog('Saving updated metadata to tasks.json');
                                            options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                                            stats.subtasksCreated++;
                                        } else {
                                            customLog.error(`Failed to create subtask ticket for subtask ${subtask.id}`);
                                            stats.errors++;
                                        }
                                    } catch (error) {
                                        customLog.error(`Failed to create subtask ticket for subtask ${subtask.id}: ${error.message}`);
                                        stats.errors++;
                                    }
                                }
                            } catch (subtaskError) {
                                customLog.error(`Error processing subtask ${subtask.id}: ${subtaskError.message}`);
                                stats.errors++;
                            }
                        }
                    }
                }
                
                // After processing subtasks, synchronize status for main task
                finalTicketId = getTicketId(task, { debug });
                console.log(`[FINAL-DEBUG] Task ${task.id} - finalTicketId: ${finalTicketId || 'undefined'}`);
                console.log(`[FINAL-DEBUG] Task ${task.id} - originalParentTicketId: ${originalParentTicketId || 'undefined'}`);
                
                if (finalTicketId) {
                    await synchronizeTaskStatus(task, finalTicketId, false);
                } else {
                    customLog.warn(`Skipping main task sync for task ${task.id} - No ticketId available in metadata`);
                }
            } catch (taskError) {
                customLog.error(`Error processing task ${task.id || 'unknown'}: ${taskError.message}`);
                stats.errors++;
            }
        }

        // Display the sync stats in a stylish table format
        displaySyncTable(stats, { logger: customLog.info, colorize: true });
        
        // Return success with statistics
        const message = `Synchronization complete: ${stats.tasksCreated} tasks created, ${stats.subtasksCreated} subtasks created, ${stats.tasksUpdated} tasks updated, ${stats.subtasksUpdated} subtasks updated, ${stats.ticketsUpdated} tickets updated, ${stats.tasksWithTimestampsAdded} timestamps initialized, ${stats.errors} errors`;
        customLog.success(message);

        return {
            success: true,
            stats,
            message,
            formattedDisplay: true // Flag indicating that formatted display has been shown
        };
    } catch (error) {
        customLog.error(`Synchronization error: ${error.message}`);
        // Display error stats in table format
    displaySyncTable(stats, { logger: customLog.info, colorize: true });
    
    return {
            success: false,
            stats,
            message: `Error: ${error.message}`,
            formattedDisplay: true // Flag indicating that formatted display has been shown
        };
    }
}

/**
 * Export the syncTickets function
 */
export { syncTickets };
