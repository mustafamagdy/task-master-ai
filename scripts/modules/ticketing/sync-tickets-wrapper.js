/**
 * sync-tickets-wrapper.js
 * A wrapper around the sync-tickets.js module that provides additional error handling
 * and debugging capabilities for ticket synchronization.
 */

import { syncTickets } from './sync-tickets.js';
import { getTaskTicketId } from './ticket-id-helper.js';
import { log } from '../utils.js';

/**
 * Enhanced ticket synchronization with better error handling and debugging
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @returns {Promise<Object>} Synchronization result
 */
export async function syncTicketsWithErrorHandling(tasksPath, options = {}) {
    // Create custom logger
    const customLog = options.mcpLog || {
        info: log.bind(null, 'info'),
        warn: log.bind(null, 'warn'),
        error: log.bind(null, 'error'),
        success: log.bind(null, 'success')
    };

    try {
        customLog.info('Starting enhanced ticket synchronization...');
        
        // Add additional debug logging if requested
        if (options.debug) {
            customLog.info('Debug mode enabled for ticket synchronization');
        }
        
        // Call the original syncTickets function with our options
        const result = await syncTickets(tasksPath, options);
        
        // Check if the synchronization was successful
        if (result.success) {
            customLog.success('Ticket synchronization completed successfully');
        } else {
            customLog.warn(`Ticket synchronization completed with issues: ${result.message}`);
        }
        
        return result;
    } catch (error) {
        // Handle any unexpected errors
        customLog.error(`Critical error during ticket synchronization: ${error.message}`);
        
        // Log the stack trace for debugging
        if (options.debug) {
            console.error('Error stack trace:', error.stack);
        }
        
        return {
            success: false,
            stats: { errors: 1 },
            message: `Critical error: ${error.message}`
        };
    }
}

/**
 * Synchronize a specific task with the ticketing system
 * @param {Object} task - The task to synchronize
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @returns {Promise<Object>} Synchronization result
 */
export async function syncSingleTask(task, tasksPath, options = {}) {
    const customLog = options.mcpLog || {
        info: log.bind(null, 'info'),
        warn: log.bind(null, 'warn'),
        error: log.bind(null, 'error'),
        success: log.bind(null, 'success')
    };
    
    try {
        customLog.info(`Synchronizing single task: ${task.id} - ${task.title}`);
        
        // Check if the task has a valid ticketId
        const ticketId = getTaskTicketId(task);
        if (!ticketId) {
            customLog.warn(`Task ${task.id} has no ticketId, cannot synchronize`);
            return {
                success: false,
                message: `Task ${task.id} has no ticketId`
            };
        }
        
        // For now, just call the full sync function
        // In a future enhancement, this could be optimized to only sync the specific task
        customLog.info(`Using full sync for task ${task.id} with ticketId ${ticketId}`);
        return await syncTicketsWithErrorHandling(tasksPath, options);
    } catch (error) {
        customLog.error(`Error synchronizing task ${task.id}: ${error.message}`);
        return {
            success: false,
            message: `Error: ${error.message}`
        };
    }
}

/**
 * Export the enhanced synchronization functions
 */
export default {
    syncTicketsWithErrorHandling,
    syncSingleTask
};
