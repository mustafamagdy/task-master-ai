/**
 * subtask-deletion-handler.js
 * Handles subtask deletion events
 */

import { log, findTaskById, findProjectRoot } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to subtask deletion events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSubtaskDeletion(subscribe) {
    return subscribe(
        EVENT_TYPES.SUBTASK_DELETED,
        async ({ taskId, subtask, data, tasksPath }) => {
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
                        'No ticketing system available. Skipping update for deleted subtask.'
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

                // Try to get ticket ID from subtask object, passing parent task info
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
                    `Subtask ${taskId} with ticket ${subtaskTicketId} was deleted. Deleting from ticketing system...`
                );

                // Delete the ticket from the ticketing system
                const success = await ticketing.deleteTicket(subtaskTicketId, null);

                if (success) {
                    log(
                        'success',
                        `Successfully deleted ticket ${subtaskTicketId} for subtask ${taskId} from ticketing system`
                    );
                } else {
                    log(
                        'warn',
                        `Failed to delete ticket ${subtaskTicketId} for subtask ${taskId} from ticketing system`
                    );
                }
            } catch (error) {
                log('error', `Error handling subtask deleted event: ${error.message}`);
            }
        }
    );
}
