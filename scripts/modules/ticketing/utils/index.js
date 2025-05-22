/**
 * index.js
 * Exports all ticket management utilities for easy importing
 */

// ID management (combined ticket IDs and reference IDs)
export {
    // Ticket ID functions
    getTicketId,
    storeTicketId,
    
    // Reference ID functions
    generateUserStoryRefId,
    generateSubtaskRefId,
    extractRefIdFromTitle,
    storeRefId,
    getRefId,
    formatTitleForJira,
    formatTitleForTicket,
    findTaskByRefId
} from './id-utils.js';

// Status synchronization
export { synchronizeTaskStatus } from './status-utils.js';

// Task file utilities
export { findTasksFile } from './task-file-utils.js';

// Ticket operations
export { createTicketForTask, createSubtaskTicket } from './ticket-operations-utils.js';

// Mapping utilities
export {
    mapStatusToTicket,
    mapTicketStatusToTaskmaster,
    mapPriorityToTicket,
    mapTicketPriorityToTaskmaster
} from './mapping-utils.js';
