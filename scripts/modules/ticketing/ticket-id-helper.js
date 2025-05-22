/**
 * ticket-id-helper.js
 * Helper functions for working with ticket IDs in TaskMaster
 */

import { getTicketId } from './jira/jira-ticket-operations.js';

/**
 * Get the ticket ID for a task or subtask, with special handling for subtasks
 * @param {Object} task - The task or subtask
 * @param {Object} parentTask - Optional parent task (for subtasks)
 * @param {Object} options - Additional options
 * @param {boolean} options.debug - Whether to log debug information
 * @returns {string|null} The ticket ID or null if not found
 */
export function getTaskTicketId(task, parentTask = null, options = {}) {
    const { debug = true } = options;
    const isSubtask = task && task.id && task.id.toString().includes('.');
    
    if (debug) {
        console.log(`[TICKET-HELPER] Getting ticket ID for ${isSubtask ? 'subtask' : 'task'}: ${task?.id || 'undefined'}`);
    }
    
    // First try to get the ticket ID directly from the task
    let ticketId = getTicketId(task);
    
    // If this is a subtask and we don't have a ticket ID, try to use the parent task's ticket ID
    if (isSubtask && !ticketId && parentTask) {
        if (debug) {
            console.log(`[TICKET-HELPER] Subtask ${task.id} has no ticket ID, trying parent task ${parentTask.id}`);
        }
        
        // Get the parent task's ticket ID
        const parentTicketId = getTicketId(parentTask);
        
        if (parentTicketId) {
            if (debug) {
                console.log(`[TICKET-HELPER] Using parent task ${parentTask.id} ticket ID for subtask ${task.id}: ${parentTicketId}`);
            }
            return parentTicketId;
        } else if (debug) {
            console.log(`[TICKET-HELPER] Parent task ${parentTask.id} has no ticket ID either`);
        }
    }
    
    return ticketId;
}

/**
 * Store a ticket ID in a task's metadata
 * @param {Object} task - The task or subtask
 * @param {string} ticketId - The ticket ID to store
 * @returns {boolean} Whether the operation was successful
 */
export function storeTaskTicketId(task, ticketId) {
    if (!task) {
        console.log('[TICKET-HELPER] Cannot store ticket ID: task is null or undefined');
        return false;
    }
    
    // Initialize metadata if it doesn't exist
    if (!task.metadata) {
        task.metadata = {};
    }
    
    // Store the ticket ID
    task.metadata.jiraKey = ticketId;
    console.log(`[TICKET-HELPER] Stored ticket ID ${ticketId} in task ${task.id}`);
    return true;
}
