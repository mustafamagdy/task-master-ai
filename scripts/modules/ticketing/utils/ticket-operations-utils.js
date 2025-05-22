/**
 * ticket-operations-utils.js
 * Centralized utilities for common ticket operations across ticketing systems
 */

import { getTicketId, storeTicketId } from './ticket-id-utils.js';
import { log } from '../../utils.js';

/**
 * Create a ticket in the ticketing system for a task
 * @param {Object} task - The task object
 * @param {Object} ticketingSystem - The ticketing system instance
 * @param {Object} options - Additional options
 * @param {string} options.projectRoot - The project root path
 * @param {Object} options.logger - Custom logger
 * @param {boolean} options.debug - Whether to enable debug logging
 * @returns {Promise<string|null>} The created ticket ID or null if creation failed
 */
export async function createTicketForTask(task, ticketingSystem, options = {}) {
    const { projectRoot, logger = log, debug = false } = options;
    
    try {
        if (!task) {
            logger.error('Cannot create ticket: task is null or undefined');
            return null;
        }
        
        if (!ticketingSystem) {
            logger.error('Cannot create ticket: ticketing system is null or undefined');
            return null;
        }
        
        // Check if task already has a ticket ID
        const existingTicketId = getTicketId(task, { debug });
        if (existingTicketId) {
            if (debug) {
                logger.info(`Task ${task.id} already has ticket ID: ${existingTicketId}`);
            }
            
            // Verify that the ticket exists in the ticketing system
            const exists = await ticketingSystem.ticketExists(existingTicketId, projectRoot);
            if (exists) {
                if (debug) {
                    logger.info(`Ticket ${existingTicketId} already exists in the ticketing system`);
                }
                return existingTicketId;
            } else {
                logger.warn(`Ticket ${existingTicketId} does not exist in the ticketing system, will create a new one`);
            }
        }
        
        // Prepare task data for the ticketing system
        const isSubtask = task.id && task.id.toString().includes('.');
        
        if (isSubtask) {
            // This is a subtask, so we need to find the parent task's ticket ID
            // This function would typically be called recursively for parent tasks first
            logger.error(`Cannot create ticket for subtask ${task.id} directly, parent task ticket must be created first`);
            return null;
        }
        
        // Create a story (top-level task) in the ticketing system
        logger.info(`Creating ticket for task ${task.id}: ${task.title}`);
        
        const result = await ticketingSystem.createStory(task, projectRoot);
        
        if (!result) {
            logger.error(`Failed to create ticket for task ${task.id}`);
            return null;
        }
        
        // Extract ticket ID from result
        const ticketId = result.key || result.id;
        
        if (!ticketId) {
            logger.error(`Created ticket for task ${task.id}, but no ticket ID was returned`);
            return null;
        }
        
        // Store the ticket ID in the task
        storeTicketId(task, ticketId);
        
        logger.success(`Created ticket ${ticketId} for task ${task.id}`);
        return ticketId;
    } catch (error) {
        logger.error(`Error creating ticket for task ${task?.id || 'unknown'}: ${error.message}`);
        return null;
    }
}

/**
 * Create a subtask ticket in the ticketing system
 * @param {Object} subtask - The subtask object
 * @param {Object} parentTask - The parent task object
 * @param {Object} ticketingSystem - The ticketing system instance
 * @param {Object} options - Additional options
 * @param {string} options.projectRoot - The project root path
 * @param {Object} options.logger - Custom logger
 * @param {boolean} options.debug - Whether to enable debug logging
 * @returns {Promise<string|null>} The created subtask ticket ID or null if creation failed
 */
export async function createSubtaskTicket(subtask, parentTask, ticketingSystem, options = {}) {
    const { projectRoot, logger = log, debug = false } = options;
    
    try {
        if (!subtask) {
            logger.error('Cannot create subtask ticket: subtask is null or undefined');
            return null;
        }
        
        if (!parentTask) {
            logger.error('Cannot create subtask ticket: parent task is null or undefined');
            return null;
        }
        
        if (!ticketingSystem) {
            logger.error('Cannot create subtask ticket: ticketing system is null or undefined');
            return null;
        }
        
        // Check if subtask already has a ticket ID
        const existingTicketId = getTicketId(subtask, { debug, parentTask });
        if (existingTicketId) {
            if (debug) {
                logger.info(`Subtask ${subtask.id} already has ticket ID: ${existingTicketId}`);
            }
            
            // Verify that the ticket exists in the ticketing system
            const exists = await ticketingSystem.ticketExists(existingTicketId, projectRoot);
            if (exists) {
                if (debug) {
                    logger.info(`Ticket ${existingTicketId} already exists in the ticketing system`);
                }
                return existingTicketId;
            } else {
                logger.warn(`Ticket ${existingTicketId} does not exist in the ticketing system, will create a new one`);
            }
        }
        
        // Get the parent task's ticket ID
        const parentTicketId = getTicketId(parentTask, { debug });
        
        if (!parentTicketId) {
            logger.error(`Cannot create subtask ticket: parent task ${parentTask.id} does not have a ticket ID`);
            return null;
        }
        
        // Create a subtask in the ticketing system
        logger.info(`Creating subtask ticket for subtask ${subtask.id}: ${subtask.title} under parent ${parentTask.id} (${parentTicketId})`);
        
        const result = await ticketingSystem.createTask(subtask, parentTicketId, projectRoot);
        
        if (!result) {
            logger.error(`Failed to create subtask ticket for subtask ${subtask.id}`);
            return null;
        }
        
        // Extract ticket ID from result
        const ticketId = result.key || result.id;
        
        if (!ticketId) {
            logger.error(`Created subtask ticket for subtask ${subtask.id}, but no ticket ID was returned`);
            return null;
        }
        
        // Store the ticket ID in the subtask
        storeTicketId(subtask, ticketId);
        
        logger.success(`Created subtask ticket ${ticketId} for subtask ${subtask.id}`);
        return ticketId;
    } catch (error) {
        logger.error(`Error creating subtask ticket for subtask ${subtask?.id || 'unknown'}: ${error.message}`);
        return null;
    }
}
