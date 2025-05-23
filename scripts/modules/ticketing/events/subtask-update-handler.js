/**
 * subtask-update-handler.js
 * Handles subtask update events (non-status changes)
 */

import { log, findTaskById, findProjectRoot } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to subtask update events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSubtaskUpdate(subscribe) {
    return subscribe(
        EVENT_TYPES.SUBTASK_UPDATED,
        async ({ taskId, subtask, previousSubtask, data, tasksPath }) => {
            try {
                const projectRoot = findProjectRoot();

                // Extract parent task ID and subtask ID
                let parentTaskId = null;
                let subtaskId = null;

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
                    }
                }

                // Use provided subtask or find it using findTaskById
                let foundSubtask = subtask;
                if (!foundSubtask) {
                    // This utility handles compound IDs like "1.2" automatically
                    const { task: foundTask } = findTaskById(data.tasks, taskId);
                    if (!foundTask) {
                        log(
                            'warn',
                            `Subtask ${taskId} not found. Skipping ticketing update.`
                        );
                        return;
                    }
                    foundSubtask = foundTask;
                }

                // Get ticketing instance
                const ticketing = await getTicketingInstance(null, projectRoot);
                if (!ticketing) {
                    log(
                        'warn',
                        'No ticketing system available. Skipping update for subtask changes.'
                    );
                    return;
                }

                // Get the parent task if we have a parent task ID
                let parentTask = null;
                if (parentTaskId) {
                    const { task: foundParent } = findTaskById(data.tasks, parentTaskId);
                    if (foundParent) {
                        parentTask = foundParent;
                        log(
                            'info',
                            `Found parent task ${parentTaskId} for subtask ${taskId}`
                        );
                    }
                }

                // Check if subtask has a ticket ID, passing parent task info
                const subtaskTicketId =
                    foundSubtask && typeof ticketing.getTicketId === 'function'
                        ? ticketing.getTicketId(foundSubtask, { parentTask })
                        : null;

                log('info', `Got ticket ID for subtask ${taskId}: ${subtaskTicketId}`);

                if (!subtaskTicketId) {
                    log(
                        'info',
                        `No ticket ID found for subtask ${taskId}. Skipping ticketing update.`
                    );
                    return;
                }

                log(
                    'info',
                    `Subtask ${taskId} with ticket ${subtaskTicketId} was updated. Syncing with ticketing system...`
                );

                // Update the subtask details in the ticketing system
                if (typeof ticketing.updateTicketDetails === 'function') {
                    const success = await ticketing.updateTicketDetails(
                        subtaskTicketId,
                        foundSubtask,
                        previousSubtask
                    );

                    if (success) {
                        log(
                            'success',
                            `Updated ticketing system issue ${subtaskTicketId} for subtask ${taskId}`
                        );
                    } else {
                        log(
                            'warn',
                            `Failed to update ticketing system issue ${subtaskTicketId} for subtask ${taskId}`
                        );
                    }
                } else {
                    log(
                        'warn',
                        `Ticketing system doesn't support updating ticket details. Skipping subtask update.`
                    );
                }
            } catch (error) {
                log('error', `Error handling subtask update event: ${error.message}`);
            }
        }
    );
}
