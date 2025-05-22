/**
 * jira-mapping.js
 * Handles mapping between TaskMaster and Jira statuses, priorities, and other fields
 */

import {
    getIssueTypeMapping,
    getFieldMapping,
    shouldIgnoreField,
    getRelationshipMapping,
    initializeDefaultMappings
} from '../mapping-manager.js';

/**
 * Map TaskMaster priority to Jira priority
 * @param {string} priority - TaskMaster priority (high, medium, low)
 * @returns {string|null} Jira priority or null if disabled
 */
export function mapPriorityToTicket(priority) {
    // Get the mapping from the config or use defaults
    const mapping = {
        high: 'High',
        medium: 'Medium',
        low: 'Low'
    };

    // If priority is disabled in the mapping, return null
    if (priority && mapping[priority.toLowerCase()] === false) {
        return null;
    }

    // Return the mapped priority or the original if no mapping exists
    return priority && mapping[priority.toLowerCase()]
        ? mapping[priority.toLowerCase()]
        : priority;
}

/**
 * Format a task title for Jira
 * @param {Object} task - Task object
 * @returns {string} Formatted title
 */
export function formatTitleForTicket(task) {
    // Use the formatTitleForJira function if available, otherwise just return the title
    return task.title;
}

/**
 * Map TaskMaster status to Jira status
 * @param {string} status - TaskMaster status (pending, in-progress, review, done, etc.)
 * @returns {string} Jira status
 */
export function mapStatusToTicket(status) {
    // Default mapping
    const mapping = {
        'pending': 'To Do',
        'in-progress': 'In Progress',
        'review': 'In Review',
        'done': 'Done'
    };

    // Return the mapped status or the original if no mapping exists
    return status && mapping[status.toLowerCase()]
        ? mapping[status.toLowerCase()]
        : status;
}

/**
 * Map Jira status to TaskMaster status
 * @param {string} jiraStatus - Jira status
 * @returns {string} TaskMaster status
 */
export function mapTicketStatusToTaskmaster(jiraStatus) {
    if (!jiraStatus) return 'pending';

    // Normalize the status by converting to lowercase
    const normalizedStatus = jiraStatus.toLowerCase();

    // Define mappings from Jira statuses to TaskMaster statuses
    // These are common Jira workflow statuses, but may need to be customized
    // based on the specific Jira instance's workflow
    if (normalizedStatus.includes('to do') || normalizedStatus.includes('open') || normalizedStatus.includes('backlog')) {
        return 'pending';
    }

    if (normalizedStatus.includes('in progress') || normalizedStatus.includes('started')) {
        return 'in-progress';
    }

    if (normalizedStatus.includes('review') || normalizedStatus.includes('reviewing')) {
        return 'review';
    }

    if (normalizedStatus.includes('done') || normalizedStatus.includes('closed') || normalizedStatus.includes('resolved') || normalizedStatus.includes('complete')) {
        return 'done';
    }

    if (normalizedStatus.includes('blocked') || normalizedStatus.includes('impediment')) {
        return 'blocked';
    }

    // Default to pending if we can't map the status
    return 'pending';
}

/**
 * Map Jira priority to TaskMaster priority
 * @param {string} jiraPriority - Jira priority
 * @returns {string} TaskMaster priority
 */
export function mapTicketPriorityToTaskmaster(jiraPriority) {
    if (!jiraPriority) return 'medium';

    // Normalize the priority by converting to lowercase
    const normalizedPriority = jiraPriority.toLowerCase();

    // Map Jira priorities to TaskMaster priorities
    if (normalizedPriority.includes('highest') || normalizedPriority.includes('critical') || normalizedPriority.includes('blocker')) {
        return 'high';
    }

    if (normalizedPriority.includes('high')) {
        return 'high';
    }

    if (normalizedPriority.includes('medium') || normalizedPriority.includes('normal')) {
        return 'medium';
    }

    if (normalizedPriority.includes('low') || normalizedPriority.includes('minor') || normalizedPriority.includes('trivial')) {
        return 'low';
    }

    // Default to medium if we can't map the priority
    return 'medium';
}
