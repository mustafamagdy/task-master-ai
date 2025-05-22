/**
 * mapping-utils.js
 * Centralized utilities for mapping between TaskMaster and ticketing system fields
 */

/**
 * Map TaskMaster status to ticketing system status with adaptable mapping
 * @param {string} taskmasterStatus - TaskMaster status (e.g., 'pending', 'in-progress', 'done')
 * @param {Object} mappingConfig - The mapping configuration
 * @param {Object} mappingConfig.statusMap - Object mapping TaskMaster statuses to ticketing system statuses
 * @param {string} mappingConfig.defaultStatus - Default status to use if no mapping is found
 * @returns {string} Ticketing system status
 */
export function mapStatusToTicket(taskmasterStatus, mappingConfig = {}) {
    // Default mapping if none provided
    const defaultMap = {
        'pending': 'To Do',
        'in-progress': 'In Progress',
        'review': 'In Review',
        'done': 'Done',
        'deferred': 'Backlog',
        'cancelled': 'Won\'t Do'
    };
    
    const statusMap = mappingConfig.statusMap || defaultMap;
    const defaultStatus = mappingConfig.defaultStatus || 'To Do';
    
    return statusMap[taskmasterStatus] || defaultStatus;
}

/**
 * Map ticketing system status to TaskMaster status with adaptable mapping
 * @param {string} ticketStatus - Ticketing system status
 * @param {Object} mappingConfig - The mapping configuration
 * @param {Object} mappingConfig.reverseStatusMap - Object mapping ticketing system statuses to TaskMaster statuses
 * @param {string} mappingConfig.defaultStatus - Default status to use if no mapping is found
 * @returns {string} TaskMaster status
 */
export function mapTicketStatusToTaskmaster(ticketStatus, mappingConfig = {}) {
    // Default mapping if none provided
    const defaultMap = {
        'To Do': 'pending',
        'In Progress': 'in-progress',
        'In Review': 'review',
        'Done': 'done',
        'Resolved': 'done',
        'Closed': 'done',
        'Backlog': 'deferred',
        'Won\'t Do': 'cancelled',
        'Won\'t Fix': 'cancelled'
    };
    
    const reverseStatusMap = mappingConfig.reverseStatusMap || defaultMap;
    const defaultStatus = mappingConfig.defaultStatus || 'pending';
    
    return reverseStatusMap[ticketStatus] || defaultStatus;
}

/**
 * Map TaskMaster priority to ticketing system priority with adaptable mapping
 * @param {string} taskmasterPriority - TaskMaster priority (e.g., 'high', 'medium', 'low')
 * @param {Object} mappingConfig - The mapping configuration
 * @param {Object} mappingConfig.priorityMap - Object mapping TaskMaster priorities to ticketing system priorities
 * @param {string} mappingConfig.defaultPriority - Default priority to use if no mapping is found
 * @returns {string} Ticketing system priority
 */
export function mapPriorityToTicket(taskmasterPriority, mappingConfig = {}) {
    // Default mapping if none provided
    const defaultMap = {
        'high': 'High',
        'medium': 'Medium',
        'low': 'Low'
    };
    
    const priorityMap = mappingConfig.priorityMap || defaultMap;
    const defaultPriority = mappingConfig.defaultPriority || 'Medium';
    
    return priorityMap[taskmasterPriority] || defaultPriority;
}

/**
 * Map ticketing system priority to TaskMaster priority with adaptable mapping
 * @param {string} ticketPriority - Ticketing system priority
 * @param {Object} mappingConfig - The mapping configuration
 * @param {Object} mappingConfig.reversePriorityMap - Object mapping ticketing system priorities to TaskMaster priorities
 * @param {string} mappingConfig.defaultPriority - Default priority to use if no mapping is found
 * @returns {string} TaskMaster priority
 */
export function mapTicketPriorityToTaskmaster(ticketPriority, mappingConfig = {}) {
    // Default mapping if none provided
    const defaultMap = {
        'Highest': 'high',
        'High': 'high',
        'Medium': 'medium',
        'Low': 'low',
        'Lowest': 'low'
    };
    
    const reversePriorityMap = mappingConfig.reversePriorityMap || defaultMap;
    const defaultPriority = mappingConfig.defaultPriority || 'medium';
    
    return reversePriorityMap[ticketPriority] || defaultPriority;
}
