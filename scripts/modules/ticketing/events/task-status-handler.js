/**
 * task-status-handler.js
 * Handles task status change events
 */

import { log } from '../../utils.js';
import { EVENT_TYPES } from '../../events/event-emitter.js';
import { updateTicketStatus } from './ticket-status-updater.js';

/**
 * Subscribe to task status changes
 * @param {Function} subscribe - Event subscription function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskStatus(subscribe) {
    return subscribe(
        EVENT_TYPES.TASK_STATUS_CHANGED,
        async ({ taskId, newStatus, data, tasksPath }) => {
            try {
                log(
                    'debug',
                    `Updating ticketing status for task ${taskId} to ${newStatus}`
                );
                await updateTicketStatus(taskId, newStatus, data, tasksPath);
            } catch (error) {
                log(
                    'error',
                    `Error handling task status change event: ${error.message}`
                );
            }
        }
    );
}
