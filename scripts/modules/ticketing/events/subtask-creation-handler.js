/**
 * subtask-creation-handler.js
 * Handles subtask creation events
 */

import { log, findTaskById, findProjectRoot, writeJSON } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to subtask creation events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSubtaskCreation(subscribe) {
    return subscribe(
        EVENT_TYPES.SUBTASK_CREATED,
        async ({ taskId, subtask, data, tasksPath }) => {
            try {
                log('info', `Received SUBTASK_CREATED event for subtask ${taskId}`);
                const projectRoot = findProjectRoot();

                // Extract parent task ID and subtask ID directly from the task ID
                let parentTask = null;
                let parentTaskId = null;
                let subtaskId = null;
                let subtaskObj = subtask;

                // Parse compound ID (e.g., "1.2")
                if (taskId && taskId.toString().includes('.')) {
                    const idParts = taskId.toString().split('.');
                    if (idParts.length === 2) {
                        parentTaskId = idParts[0];
                        subtaskId = idParts[1];
                        log(
                            'info',
                            `Extracted parent task ID ${parentTaskId} and subtask ID ${subtaskId} from ${taskId}`
                        );

                        // Get the parent task using the extracted ID
                        const { task: foundParent } = findTaskById(
                            data.tasks,
                            parentTaskId
                        );
                        if (foundParent) {
                            parentTask = foundParent;
                            log('info', `Found parent task: ${parentTask.id}`);
                        } else {
                            log(
                                'warn',
                                `Parent task ${parentTaskId} not found for subtask ${taskId}. Skipping ticket creation.`
                            );
                            return;
                        }
                    }
                }

                // If we don't have a subtask object yet, try to find it
                if (!subtaskObj && taskId) {
                    // Find the subtask using findTaskById which handles compound IDs
                    const { task: foundTask } = findTaskById(data.tasks, taskId);
                    if (foundTask && foundTask.isSubtask) {
                        subtaskObj = foundTask;
                        // If we don't have parent task ID yet, extract it from the subtask
                        if (!parentTaskId && subtaskObj.parentTask) {
                            parentTaskId = subtaskObj.parentTask.id;
                            subtaskId = subtaskObj.id;

                            // Get the parent task if we haven't already
                            if (!parentTask) {
                                const { task: foundParent } = findTaskById(
                                    data.tasks,
                                    parentTaskId
                                );
                                if (foundParent) {
                                    parentTask = foundParent;
                                } else {
                                    log(
                                        'warn',
                                        `Parent task ${parentTaskId} not found for subtask ${taskId}. Skipping ticket creation.`
                                    );
                                    return;
                                }
                            }
                        }
                    } else {
                        log(
                            'warn',
                            `Subtask ${taskId} not found or is not a valid subtask. Skipping ticket creation.`
                        );
                        return;
                    }
                } else if (taskId && !subtaskObj) {
                    log(
                        'warn',
                        `Missing subtask data for ID ${taskId}. Skipping ticket creation.`
                    );
                    return;
                }

                // At this point we still need to make sure we have the parent task ID
                if (!parentTaskId && taskId) {
                    log(
                        'warn',
                        `Unable to determine parent task ID for subtask ${taskId}. Skipping ticket creation.`
                    );
                    return;
                }

                // We already have projectRoot from earlier import, use it consistently
                // Get ticketing instance directly without checking config
                const ticketingInstance = await getTicketingInstance(null, projectRoot);
                if (!ticketingInstance) {
                    log(
                        'info',
                        'No ticketing system available. Skipping subtask ticket creation.'
                    );
                    return;
                }

                // If we don't have a parentTask object yet, we need to get it
                if (!parentTask && subtaskObj && subtaskObj.parentTask) {
                    const { task: foundParent } = findTaskById(
                        data.tasks,
                        subtaskObj.parentTask.id
                    );
                    if (foundParent) {
                        parentTask = foundParent;
                        parentTaskId = foundParent.id;
                    } else {
                        log(
                            'warn',
                            `Parent task ${subtaskObj.parentTask.id} not found. Skipping subtask ticket creation.`
                        );
                        return;
                    }
                } else if (!parentTask && taskId && taskId.toString().includes('.')) {
                    // Parse the task ID as a fallback
                    const idParts = taskId.toString().split('.');
                    if (idParts.length === 2) {
                        const parsedParentId = parseInt(idParts[0], 10);
                        const { task: foundParent } = findTaskById(
                            data.tasks,
                            parsedParentId
                        );
                        if (foundParent) {
                            parentTask = foundParent;
                            parentTaskId = parsedParentId;
                        } else {
                            log(
                                'warn',
                                `Parent task ${parsedParentId} not found. Skipping subtask ticket creation.`
                            );
                            return;
                        }
                    }
                }

                // We must have a parent task by now
                if (!parentTask) {
                    log(
                        'warn',
                        `Unable to determine parent task for subtask ${taskId}. Skipping subtask ticket creation.`
                    );
                    return;
                }

                const parentTicketId = ticketingInstance.getTicketId(parentTask);
                if (!parentTicketId) {
                    log(
                        'warn',
                        `No ticket ID found for parent task ${parentTaskId}. Skipping subtask ticket creation.`
                    );
                    return;
                }

                // Make sure we have subtaskId
                if (!subtaskId && subtaskObj) {
                    subtaskId = subtaskObj.id;
                }

                // Create a subtask representation for the ticketing system
                const subtaskData = {
                    id: subtaskId,
                    parentId: parentTaskId,
                    title: subtaskObj.title,
                    description: subtaskObj.description || '',
                    status: subtaskObj.status || 'pending',
                    parentTicketId
                };

                // Create the subtask in the ticketing system
                try {
                    log(
                        'info',
                        `Creating ticketing subtask for subtask ${subtaskId} of task ${parentTaskId}...`
                    );
                    const ticketingIssue = await ticketingInstance.createTask(
                        subtaskData,
                        parentTicketId,
                        projectRoot
                    );
                    log(
                        'debug',
                        `Subtask ticket creation result: ${JSON.stringify(ticketingIssue)}`
                    );

                    if (ticketingIssue && ticketingIssue.key) {
                        // Store ticketing issue key in subtask metadata
                        log(
                            'debug',
                            `Storing ticket key ${ticketingIssue.key} in subtask metadata for subtask ${subtaskId} of task ${parentTaskId}`
                        );

                        // Make sure subtask has metadata object
                        if (!subtaskObj.metadata) {
                            subtaskObj.metadata = {};
                        }

                        // Store the ticketing key in metadata
                        subtaskObj.metadata.jiraKey = ticketingIssue.key;

                        // Also use the ticketing system's method if available
                        if (typeof ticketingInstance.storeTicketId === 'function') {
                            subtaskObj = ticketingInstance.storeTicketId(
                                subtaskObj,
                                ticketingIssue.key
                            );
                        }

                        // Update the subtask in the parent task
                        const subtaskIndex = parentTask.subtasks.findIndex(
                            (st) => st.id === subtaskId
                        );
                        if (subtaskIndex !== -1) {
                            parentTask.subtasks[subtaskIndex] = subtaskObj;

                            // Update the parent task in the data
                            const taskIndex = data.tasks.findIndex(
                                (t) => t.id === parentTaskId
                            );
                            if (taskIndex !== -1) {
                                data.tasks[taskIndex] = parentTask;
                                // Write changes back to file
                                log(
                                    'info',
                                    `Updating tasks.json with new ticket ID ${ticketingIssue.key} for subtask ${taskId}`
                                );
                                writeJSON(tasksPath, data);
                            } else {
                                log(
                                    'warn',
                                    `Could not find parent task ${parentTaskId} in tasks data to update. Changes may not be saved.`
                                );
                            }
                        }

                        log(
                            'success',
                            `Created ticketing subtask ${ticketingIssue.key} for subtask ${subtaskId} of task ${parentTaskId}`
                        );
                    } else {
                        log(
                            'warn',
                            `Failed to create ticketing subtask for subtask ${subtaskId} of task ${parentTaskId}`
                        );
                    }
                } catch (ticketingError) {
                    log(
                        'error',
                        `Error creating ticketing subtask: ${ticketingError.message}`
                    );
                }
            } catch (error) {
                log('error', `Error handling subtask created event: ${error.message}`);
            }
        }
    );
}
