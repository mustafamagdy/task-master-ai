/**
 * sync-tickets-fixed.js
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
import { getRefId, formatTitleForTicket } from './reference-id-service.js';
import generateTaskFiles from '../task-manager/generate-task-files.js';
import { getTaskTicketId, storeTaskTicketId } from './ticket-id-helper.js';

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
        
        // Define a helper function for synchronizing task status
        const synchronizeTaskStatus = async (taskItem, ticketIdentifier, isSubtaskItem) => {
            try {
                console.log(`[SYNC-DEBUG] Starting synchronization for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} with ticket ${ticketIdentifier}...`);
                
                if (!ticketingSystem) {
                    console.log(`[SYNC-ERROR] ticketingSystem is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
                    return;
                }
                
                if (!ticketIdentifier) {
                    console.log(`[SYNC-ERROR] ticketIdentifier is undefined for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
                    return;
                }
                
                // Get current status from ticketing system
                console.log(`[SYNC-DEBUG] Getting status for ticket ${ticketIdentifier}...`);
                const ticketStatus = await ticketingSystem.getTicketStatus(
                    ticketIdentifier,
                    projectRoot
                );
                
                console.log(`[SYNC-DEBUG] Ticket status result for ${ticketIdentifier}: ${JSON.stringify(ticketStatus) || 'null'}`);
                
                if (!ticketStatus) {
                    console.log(`[SYNC-WARN] No status found for ticket ${ticketIdentifier}`);
                    return;
                }
                
                // Handle case where ticketStatus might be a string (for backward compatibility or mock API)
                let statusObj = ticketStatus;
                if (typeof ticketStatus === 'string') {
                    console.log(`[SYNC-WARN] Ticket status is a string, converting to object format`);
                    statusObj = {
                        status: ticketStatus,
                        updated: new Date().toISOString() // Use current time as fallback
                    };
                }
                
                // Map the ticketing system status to TaskMaster status
                const jiraStatusInTaskmaster = ticketingSystem.mapTicketStatusToTaskmaster(statusObj.status);
                console.log(`[SYNC-DEBUG] Mapped Jira status '${statusObj.status}' to TaskMaster status '${jiraStatusInTaskmaster}'`);
                
                // Get current status of the task/subtask
                const currentTaskStatus = taskItem.status || 'pending';
                console.log(`[SYNC-DEBUG] Current ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} status: ${currentTaskStatus}`);
                
                // Get last update timestamps
                const jiraLastUpdated = statusObj.updated || null;
                let taskLastUpdated = (taskItem.metadata && taskItem.metadata.lastStatusUpdate) || null;
                console.log(`[SYNC-DEBUG] Jira last updated: ${jiraLastUpdated || 'null'}, Task last updated: ${taskLastUpdated || 'null'}`);
                
                // For debugging - add additional info about the task
                if (isSubtaskItem) {
                    console.log(`[SYNC-DEBUG] Subtask details - ID: ${taskItem.id}, Title: ${taskItem.title || 'N/A'}, Status: ${taskItem.status || 'N/A'}`);
                }
                
                // Initialize task timestamp if missing
                if (!taskLastUpdated) {
                    taskItem.metadata = taskItem.metadata || {};
                    
                    // For subtasks without timestamps, use a timestamp older than Jira's
                    // This ensures that Jira's status will be preferred for the first sync
                    if (isSubtaskItem && jiraLastUpdated) {
                        // Create a date 1 day before Jira's update
                        const jiraDate = new Date(jiraLastUpdated);
                        const olderDate = new Date(jiraDate);
                        olderDate.setDate(olderDate.getDate() - 1); // 1 day older than Jira update
                        taskItem.metadata.lastStatusUpdate = olderDate.toISOString();
                        console.log(`[SYNC-DEBUG] Added older timestamp to subtask ${taskItem.id}: ${taskItem.metadata.lastStatusUpdate} (before Jira's ${jiraLastUpdated})`);
                    } else {
                        // For main tasks or if no Jira timestamp, use current time
                        taskItem.metadata.lastStatusUpdate = new Date().toISOString();
                        console.log(`[SYNC-DEBUG] Added current timestamp to ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${taskItem.metadata.lastStatusUpdate}`);
                    }
                    
                    taskLastUpdated = taskItem.metadata.lastStatusUpdate;
                    stats.tasksWithTimestampsAdded++;
                }
                
                // If statuses are different, decide which one to update
                if (currentTaskStatus !== jiraStatusInTaskmaster) {
                    console.log(`[SYNC-DEBUG] Status mismatch: TaskMaster=${currentTaskStatus}, Jira=${jiraStatusInTaskmaster}`);
                    
                    // Determine which status to use based on timestamps
                    // Case 1: If task has no timestamp, always prefer Jira status (especially for subtasks)
                    // Case 2: If task has timestamp but Jira doesn't, prefer task status
                    // Case 3: If both have timestamps, prefer the more recent one
                    
                    const shouldUpdateJira = taskLastUpdated && 
                                            (!jiraLastUpdated || new Date(taskLastUpdated) > new Date(jiraLastUpdated));
                    
                    // Special handling for subtasks without timestamps
                    const isSubtaskWithoutTimestamp = isSubtaskItem && !taskLastUpdated;
                    
                    if (shouldUpdateJira && !isSubtaskWithoutTimestamp) {
                        console.log(`[SYNC-DEBUG] TaskMaster has more recent update (${taskLastUpdated}), updating Jira ticket`);
                        
                        try {
                            const updated = await ticketingSystem.updateTicketStatus(
                                ticketIdentifier,
                                currentTaskStatus,
                                projectRoot,
                                taskItem
                            );
                            
                            if (updated) {
                                customLog.success(`Updated Jira ticket ${ticketIdentifier} status to match TaskMaster ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} status: ${currentTaskStatus}`);
                                stats.ticketsUpdated = (stats.ticketsUpdated || 0) + 1;
                            } else {
                                customLog.error(`Failed to update Jira ticket ${ticketIdentifier} status, but will preserve local ${isSubtaskItem ? 'subtask' : 'task'} status`);
                            }
                        } catch (error) {
                            customLog.error(`Error updating Jira ticket status: ${error.message}`);
                            console.log(`[SYNC-ERROR] Full error updating Jira ticket: ${error.stack || error}`);
                        }
                    } 
                    // Case 2: Jira was updated more recently than task - update task
                    // OR subtask has no timestamp - always prefer Jira status
                    else {
                        if (isSubtaskWithoutTimestamp) {
                            console.log(`[SYNC-DEBUG] Subtask has no timestamp, preferring Jira status`);
                        } else {
                            console.log(`[SYNC-DEBUG] Jira has more recent update (${jiraLastUpdated}), updating TaskMaster ${isSubtaskItem ? 'subtask' : 'task'}`);
                        }
                        
                        // Update task status
                        taskItem.status = jiraStatusInTaskmaster;
                        
                        // Update last status update timestamp
                        taskItem.metadata = taskItem.metadata || {};
                        taskItem.metadata.lastStatusUpdate = new Date().toISOString();
                        
                        customLog.success(`Updated TaskMaster ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} status to match Jira ticket ${ticketIdentifier} status: ${jiraStatusInTaskmaster}`);
                        
                        // Save the updated status
                        console.log('[SYNC-DEBUG] Saving updated status to tasks.json');
                        options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                        
                        if (isSubtaskItem) {
                            stats.subtasksUpdated++;
                            console.log(`[SYNC-DEBUG] Incremented subtasksUpdated to ${stats.subtasksUpdated}`);
                        } else {
                            stats.tasksUpdated++;
                            console.log(`[SYNC-DEBUG] Incremented tasksUpdated to ${stats.tasksUpdated}`);
                        }
                    }
                } else {
                    console.log(`[SYNC-DEBUG] Status for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id} and ticket ${ticketIdentifier} are in sync: ${currentTaskStatus}`);
                }
                
                console.log(`[SYNC-DEBUG] Completed synchronization for ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}`);
            } catch (syncError) {
                customLog.error(`Error synchronizing ${isSubtaskItem ? 'subtask' : 'task'} ${taskItem.id}: ${syncError.message}`);
                console.log(`[SYNC-ERROR] Full synchronization error: ${syncError.stack || syncError}`);
                stats.errors++;
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
                originalParentTicketId = getTaskTicketId(task);
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
                let ticketId = getTaskTicketId(task);
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
                            storeTaskTicketId(task, ticketId);

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
                    customLog.info(
                        `Creating new ticket for task ${task.id} (${refId})...`
                    );
                    try {
                        const title = formatTitleForTicket(task);
                        customLog.info(`Creating story with title: ${title}`);

                        const result = await ticketingSystem.createTicket(
                            {
                                title,
                                description: task.description || '',
                                refId,
                                status: task.status || 'pending',
                                priority: task.priority || 'medium'
                            },
                            projectRoot
                        );

                        if (!result) {
                            throw new Error(
                                'Failed to create ticket in Jira. API call returned no result.'
                            );
                        }

                        // Extract ticket ID from result
                        ticketId = result.key || result.id;
                        customLog.success(`Created ticket ${ticketId} for task ${task.id}`);

                        // Store the ticket ID in task metadata
                        debugLog(
                            `Storing ticket ID ${ticketId} in task ${task.id} metadata`
                        );
                        storeTaskTicketId(task, ticketId);

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

                // Process subtasks if present
                if (task.subtasks && task.subtasks.length > 0 && ticketId) {
                    customLog.info(
                        `Processing ${task.subtasks.length} subtasks for task ${task.id}...`
                    );
                    
                    // Store the parent task's ticketId explicitly before processing subtasks
                    const parentTaskTicketId = getTaskTicketId(task);
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
                                let subtaskTicketId = getTaskTicketId(subtask, task);
                                
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
                                            storeTaskTicketId(subtask, subtaskTicketId);

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
                                    customLog.info(
                                        `Creating new subtask ticket for subtask ${subtask.id} (${subtaskRefId}) under parent ${ticketId}...`
                                    );
                                    try {
                                        const title = formatTitleForTicket(subtask);
                                        customLog.info(`Creating subtask with title: ${title}`);

                                        const result = await ticketingSystem.createSubtask(
                                            {
                                                title,
                                                description: subtask.description || '',
                                                refId: subtaskRefId,
                                                status: subtask.status || 'pending',
                                                priority: subtask.priority || 'medium'
                                            },
                                            ticketId,
                                            projectRoot
                                        );

                                        if (!result) {
                                            throw new Error(
                                                'Failed to create subtask in Jira. API call returned no result.'
                                            );
                                        }

                                        // Extract ticket ID from result
                                        subtaskTicketId = result.key || result.id;
                                        customLog.success(
                                            `Created subtask ticket ${subtaskTicketId} for subtask ${subtask.id} under parent ${ticketId}`
                                        );

                                        // Store the ticket ID in subtask metadata
                                        debugLog(
                                            `Storing ticket ID ${subtaskTicketId} in subtask ${subtask.id} metadata`
                                        );
                                        storeTaskTicketId(subtask, subtaskTicketId);

                                        // Save the updated metadata
                                        debugLog('Saving updated metadata to tasks.json');
                                        options.writeJSON?.(tasksPath, data) || writeJSON(tasksPath, data);
                                        stats.subtasksCreated++;
                                    } catch (error) {
                                        customLog.error(
                                            `Failed to create subtask ticket for subtask ${subtask.id}: ${error.message}`
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
                }
                
                // After processing subtasks, synchronize status for main task
                finalTicketId = getTaskTicketId(task);
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
}

/**
 * Export the syncTickets function
 */
export { syncTickets };
