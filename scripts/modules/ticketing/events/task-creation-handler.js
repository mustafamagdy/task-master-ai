/**
 * task-creation-handler.js
 * Handles task creation events
 */

import { log, findTaskById, findProjectRoot, writeJSON } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';
import { getTicketingIntegrationEnabled } from '../../config-manager.js';
import { generateUserStoryRefId, storeRefId } from '../utils/id-utils.js';

/**
 * Subscribe to task creation events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskCreation(subscribe) {
    log('debug', '[TICKETING] Setting up task creation event handler');
    
    // First verify that ticketing is enabled before even subscribing
    try {
        const projectRoot = findProjectRoot();
        
        const ticketingEnabled = getTicketingIntegrationEnabled(projectRoot);
        
        if (!ticketingEnabled) {
            log('debug', '[TICKETING] Ticketing integration is disabled, not subscribing to task creation events');
            return () => {}; // Return no-op function if ticketing is disabled
        }
        
        log('debug', '[TICKETING] Ticketing integration is enabled, subscribing to task creation events');
    } catch (error) {
        log('error', `[TICKETING] Error checking ticketing status: ${error.message}`);
        return () => {}; // Return no-op function on error
    }
    
    // If we get here, ticketing is enabled, so subscribe to the event
    return subscribe(
        EVENT_TYPES.TASK_CREATED,
        async ({ taskId, data, tasksPath, task }) => {

            log('debug', `[TICKETING] Received task created event for task ${taskId}`);
            
            // Double-check ticketing is still enabled at event time
            try {
                const projectRoot = findProjectRoot();
                const ticketingEnabled = getTicketingIntegrationEnabled(projectRoot);
                
                if (!ticketingEnabled) {
                    log('debug', '[TICKETING] Ticketing integration is disabled, ignoring task creation event');
                    return; // Early return if ticketing is disabled
                }
            } catch (error) {
                log('error', `[TICKETING] Error checking ticketing status during event: ${error.message}`);
                return; // Early return on error
            }
            try {
                // Only proceed with task if it was provided directly
                if (!task) {
                    const projectRoot = findProjectRoot();

                    // Find the task by ID
                    task = findTaskById(data.tasks, taskId);
                    if (!task) {
                        log('warn', `Task ${taskId} not found. Skipping ticket creation.`);
                        return;
                    }
                }

                // Use findProjectRoot for consistent path resolution
                const projectRoot = findProjectRoot();
                log('debug', `[TICKETING] Using project root: ${projectRoot}`);

                // Instead of relying on getTicketingSystemEnabled which looks for the config file,
                // check if a ticketing instance can be created directly
                let ticketingInstance;
                try {
                    log('debug', '[TICKETING] Attempting to get ticketing instance');
                    ticketingInstance = await getTicketingInstance(null, projectRoot);
                    if (!ticketingInstance) {
                        log(
                            'info',
                            '[TICKETING] No ticketing system available. Skipping ticket creation.'
                        );
                        return;
                    }
                    
                    log('debug', `[TICKETING] Successfully obtained ticketing instance: ${ticketingInstance.constructor.name}`);
                } catch (configError) {
                    log(
                        'error',
                        `[TICKETING] Error getting ticketing instance: ${configError.message}`
                    );
                    console.error('[TICKETING] Full error getting ticketing instance:', configError);
                    return;
                }

                log('info', '[TICKETING] Creating user story in ticketing system for new task...');

                // Get the task to create a ticket for
                if (!task) {
                    log(
                        'warn',
                        `[TICKETING] Task object not found in event data. Skipping ticket creation.`
                    );
                    return;
                }

                // Ensure the task has a valid reference ID before creating a ticket
                let updatedTask = { ...task };
                if (!updatedTask.metadata?.refId) {
                    log(
                        'info',
                        '[TICKETING] Task is missing a reference ID. Attempting to generate one...'
                    );
                    try {
                        const refId = await generateUserStoryRefId(taskId, projectRoot);
                        if (refId) {
                            updatedTask = storeRefId(updatedTask, refId);
                            log(
                                'info',
                                `[TICKETING] Generated and stored reference ID ${refId} in task metadata`
                            );

                            // Update the task in the data
                            const taskIndex = data.tasks.findIndex(
                                (t) => t.id === parseInt(taskId, 10)
                            );
                            if (taskIndex !== -1) {
                                data.tasks[taskIndex] = updatedTask;
                                // Write changes back to file
                                writeJSON(tasksPath, data);
                            }
                        } else {
                            log('warn', '[TICKETING] Could not generate a reference ID for the task');
                        }
                    } catch (error) {
                        log('error', `[TICKETING] Error generating reference ID: ${error.message}`);
                    }
                }

                try {
                    // Already have ticketing instance from earlier check
                    if (!ticketingInstance) {
                        throw new Error('No ticketing system configured');
                    }

                    // Create a task representation that matches what the ticketing system expects
                    const ticketData = {
                        id: updatedTask.id,
                        title: updatedTask.title,
                        description: updatedTask.description,
                        details: updatedTask.details,
                        priority: updatedTask.priority,
                        status: updatedTask.status,
                        metadata: updatedTask.metadata
                    };

                    const ticketingIssue = await ticketingInstance.createStory(
                        ticketData,
                        projectRoot
                    );
                    log(
                        'debug',
                        `Ticket creation result: ${JSON.stringify(ticketingIssue)}`
                    );

                    if (ticketingIssue && ticketingIssue.key) {
                        // Store ticketing issue key in task metadata
                        log(
                            'debug',
                            `Storing ticket key ${ticketingIssue.key} in task metadata`
                        );

                        // Make sure task has metadata object
                        if (!updatedTask.metadata) {
                            updatedTask.metadata = {};
                        }

                        // Directly store the Jira key in metadata
                        updatedTask.metadata.jiraKey = ticketingIssue.key;

                        // Also use the ticketing system's method if available
                        if (typeof ticketingInstance.storeTicketId === 'function') {
                            updatedTask = ticketingInstance.storeTicketId(
                                updatedTask,
                                ticketingIssue.key
                            );
                        }

                        // Update the task in the data
                        const taskIndex = data.tasks.findIndex(
                            (t) => t.id === parseInt(taskId, 10)
                        );
                        if (taskIndex !== -1) {
                            data.tasks[taskIndex] = updatedTask;
                            // Write changes back to file
                            writeJSON(tasksPath, data);
                        }

                        log(
                            'success',
                            `Created ticketing user story: ${ticketingIssue.key}`
                        );
                    } else {
                        log('warn', 'Failed to create ticketing user story');
                    }
                } catch (ticketingError) {
                    log(
                        'error',
                        `Error creating ticketing user story: ${ticketingError.message}`
                    );
                }
            } catch (error) {
                log('error', `Error handling task created event: ${error.message}`);
            }
        }
    );
}
