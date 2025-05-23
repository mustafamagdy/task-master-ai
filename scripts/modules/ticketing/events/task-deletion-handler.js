/**
 * task-deletion-handler.js
 * Handles task deletion events
 */

import { log, findProjectRoot } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to task deletion events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskDeletion(subscribe) {
    return subscribe(
        EVENT_TYPES.TASK_DELETED,
        async ({ taskId, task, data, tasksPath }) => {
            try {
                // Get ticketing instance with explicit project root
                const projectRoot = findProjectRoot();
                const ticketing = await getTicketingInstance(null, projectRoot);
                if (!ticketing) {
                    log(
                        'warn',
                        'No ticketing system available. Skipping deletion update.'
                    );
                    return;
                }

                // If the task had a ticket ID, delete it from the ticketing system
                const ticketId = task && ticketing.getTicketId(task);
                if (ticketId) {
                    log(
                        'info',
                        `Task ${taskId} with ticket ${ticketId} was deleted. Deleting from ticketing system...`
                    );

                    // Delete the ticket from the ticketing system
                    const success = await ticketing.deleteTicket(ticketId, null);

                    if (success) {
                        log(
                            'success',
                            `Successfully deleted ticket ${ticketId} for task ${taskId} from ticketing system`
                        );
                    } else {
                        log(
                            'warn',
                            `Failed to delete ticket ${ticketId} for task ${taskId} from ticketing system`
                        );
                    }
                } else {
                    log(
                        'info',
                        `No ticketing system issue found for deleted task ${taskId}. No action needed.`
                    );
                }

                // Process subtasks of the deleted task
                if (task && task.subtasks && task.subtasks.length > 0) {
                    log(
                        'info',
                        `Processing ${task.subtasks.length} subtasks of deleted task ${taskId}...`
                    );

                    for (const subtask of task.subtasks) {
                        const subtaskTicketId = ticketing.getTicketId(subtask);

                        if (subtaskTicketId) {
                            log(
                                'info',
                                `Updating ticketing system for subtask ${subtask.id} (ticket ${subtaskTicketId}) of deleted task ${taskId}...`
                            );

                            try {
                                const subtaskSuccess = await ticketing.updateTicketStatus(
                                    subtaskTicketId,
                                    'cancelled', // Same status as main task
                                    null,
                                    subtask
                                );

                                if (subtaskSuccess) {
                                    log(
                                        'success',
                                        `Updated ticketing system issue ${subtaskTicketId} for subtask ${subtask.id} of deleted task ${taskId}`
                                    );
                                } else {
                                    log(
                                        'warn',
                                        `Failed to update ticketing system issue ${subtaskTicketId} for subtask ${subtask.id} of deleted task ${taskId}`
                                    );
                                }
                            } catch (subtaskError) {
                                log(
                                    'error',
                                    `Error updating ticketing for subtask ${subtask.id}: ${subtaskError.message}`
                                );
                            }
                        } else {
                            log(
                                'info',
                                `No ticketing system issue found for subtask ${subtask.id} of deleted task ${taskId}. No action needed.`
                            );
                        }
                    }
                }
            } catch (error) {
                log('error', `Error handling task deleted event: ${error.message}`);
            }
        }
    );
}
