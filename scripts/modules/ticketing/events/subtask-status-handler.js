/**
 * subtask-status-handler.js
 * Handles subtask status change events
 */

import { log, findTaskById, findProjectRoot } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to subtask status changes
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSubtaskStatus(subscribe) {
    return subscribe(
        EVENT_TYPES.SUBTASK_STATUS_CHANGED,
        async ({ taskId, subtaskId, newStatus, data, tasksPath }) => {
            try {
                log(
                    'debug',
                    `Processing status update for subtask ${taskId}.${subtaskId} to status: ${newStatus}`
                );

                // Find the parent task
                const { task: foundParent } = findTaskById(data.tasks, taskId);
                if (!foundParent) {
                    log(
                        'warn',
                        `Parent task ${taskId} not found. Skipping ticketing update.`
                    );
                    return;
                }

                // Parent task found
                const parentTask = foundParent;
                log('debug', `Found parent task: ${parentTask.id}`);

                // Find the subtask within the parent task
                const subtask = parentTask.subtasks?.find((st) => st.id === subtaskId);
                if (!subtask) {
                    log(
                        'warn',
                        `Subtask ${subtaskId} not found in parent task ${taskId}. Skipping ticketing update.`
                    );
                    return;
                }

                // For logging and reference, create the compound ID format
                const compoundId = `${taskId}.${subtaskId}`;

                // Get ticketing instance with explicit project root
                const projectRoot = findProjectRoot();
                const ticketing = await getTicketingInstance(null, projectRoot);
                if (!ticketing) {
                    log('warn', 'No ticketing system available. Skipping update.');
                    return;
                }

                // Get the ticket ID from the subtask metadata, passing parent task info
                const subtaskTicketId = ticketing.getTicketId(subtask, {
                    parentTask
                });

                log(
                    'debug',
                    `Got ticket ID for subtask ${compoundId}: ${subtaskTicketId}`
                );
                if (!subtaskTicketId) {
                    log(
                        'debug',
                        `No ticket ID found for subtask ${compoundId}. Skipping ticketing update.`
                    );
                    return;
                }

                // Update the ticket status
                log(
                    'debug',
                    `Updating subtask ${compoundId} with ticket ${subtaskTicketId} to status: ${newStatus}`
                );

                const success = await ticketing.updateTicketStatus(
                    subtaskTicketId,
                    newStatus,
                    null,
                    subtask
                );

                if (!success) {
                    log(
                        'warn',
                        `Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${compoundId}`
                    );
                } else {
                    log(
                        'success',
                        `Successfully updated ticketing system issue ${subtaskTicketId} for subtask ${compoundId}`
                    );
                }
            } catch (error) {
                log(
                    'error',
                    `Error handling subtask status change event: ${error.message}`
                );
            }
        }
    );
}
