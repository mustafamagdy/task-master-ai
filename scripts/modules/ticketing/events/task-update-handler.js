/**
 * task-update-handler.js
 * Handles task update events (non-status changes)
 */

import { log, findProjectRoot } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingInstance } from '../ticketing-factory.js';

/**
 * Subscribe to task update events
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskUpdate(subscribe) {
    return subscribe(
        EVENT_TYPES.TASK_UPDATED,
        async ({ taskId, task, previousTask, data, tasksPath }) => {
            try {
                const projectRoot = findProjectRoot();

                // Get ticketing instance
                const ticketing = await getTicketingInstance(null, projectRoot);
                if (!ticketing) {
                    log(
                        'warn',
                        'No ticketing system available. Skipping update for task changes.'
                    );
                    return;
                }

                // Check if task has a ticket ID
                const ticketId =
                    task && typeof ticketing.getTicketId === 'function'
                        ? ticketing.getTicketId(task)
                        : null;

                if (!ticketId) {
                    log(
                        'debug',
                        `No ticket ID found for task ${taskId}. Skipping ticketing update.`
                    );
                    return;
                }

                log(
                    'debug',
                    `Task ${taskId} with ticket ${ticketId} was updated. Syncing with ticketing system...`
                );

                // Update the ticket details in the ticketing system
                if (typeof ticketing.updateTicketDetails === 'function') {
                    const success = await ticketing.updateTicketDetails(
                        ticketId,
                        task,
                        previousTask
                    );

                    if (success) {
                        log(
                            'success',
                            `Updated ticketing system issue ${ticketId} for task ${taskId}`
                        );
                    } else {
                        log(
                            'warn',
                            `Failed to update ticketing system issue ${ticketId} for task ${taskId}`
                        );
                    }
                } else {
                    log(
                        'warn',
                        `Ticketing system doesn't support updating ticket details. Skipping update.`
                    );
                }
            } catch (error) {
                log('error', `Error handling task update event: ${error.message}`);
            }
        }
    );
}
