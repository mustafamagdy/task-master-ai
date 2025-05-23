/**
 * task-creation-handler.js
 * Handles task creation events
 */

import { log, findTaskById, findProjectRoot, writeJSON } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';
import { generateUserStoryRefId, storeRefId } from '../utils/id-utils.js';

/**
 * Subscribe to task creation events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskCreation(subscribe) {
    return subscribe(
        EVENT_TYPES.TASK_CREATED,
        async ({ taskId, data, tasksPath, task }) => {

            log('debug', `Received task created event for task ${taskId}`);
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

                // Instead of relying on getTicketingSystemEnabled which looks for the config file,
                // check if a ticketing instance can be created directly
                let ticketingInstance;
                try {
                    ticketingInstance = await getTicketingInstance(null, projectRoot);
                    if (!ticketingInstance) {
                        log(
                            'info',
                            'No ticketing system available. Skipping ticket creation.'
                        );
                        return;
                    }
                } catch (configError) {
                    log(
                        'error',
                        `Error getting ticketing instance: ${configError.message}`
                    );
                    return;
                }

                log('info', 'Creating user story in ticketing system for new task...');

                // Get the task to create a ticket for
                if (!task) {
                    log(
                        'warn',
                        `Task object not found in event data. Skipping ticket creation.`
                    );
                    return;
                }

                // Ensure the task has a valid reference ID before creating a ticket
                let updatedTask = { ...task };
                if (!updatedTask.metadata?.refId) {
                    log(
                        'info',
                        'Task is missing a reference ID. Attempting to generate one...'
                    );
                    try {
                        const refId = await generateUserStoryRefId(taskId, projectRoot);
                        if (refId) {
                            updatedTask = storeRefId(updatedTask, refId);
                            log(
                                'info',
                                `Generated and stored reference ID ${refId} in task metadata`
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
                            log('warn', 'Could not generate a reference ID for the task');
                        }
                    } catch (error) {
                        log('error', `Error generating reference ID: ${error.message}`);
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
