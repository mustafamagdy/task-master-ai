/**
 * jira-ticket-operations.js
 * Handles ticket creation, updating, and management operations
 */

import { log } from '../../utils.js';
import { validateConfig } from './jira-config.js';
import { 
    mapPriorityToTicket, 
    mapStatusToTicket, 
    mapTicketStatusToTaskmaster,
    mapTicketPriorityToTaskmaster
} from './jira-mapping.js';
import { 
    createIssue, 
    getTicketStatus, 
    updateTicketStatus, 
    ticketExists as checkTicketExists,
    getAllTickets as fetchAllTickets
} from './jira-api.js';
import {
    getIssueTypeMapping,
    getFieldMapping,
    shouldIgnoreField,
    getRelationshipMapping
} from '../mapping-manager.js';
import {
    extractRefIdFromTitle,
    formatTitleForJira,
    getRefId
} from '../utils/id-utils.js';
import { getTicketId as getTicketIdFromUtils, storeTicketId as storeTicketIdInUtils } from '../utils/id-utils.js';

/**
 * Store Jira key in task metadata
 * @param {Object} task - Task object
 * @param {string} ticketId - Jira issue key
 * @returns {Object} Updated task object
 */
export function storeTicketId(task, ticketId) {
    return storeTicketIdInUtils(task, ticketId);
}

/**
 * Get Jira key from task metadata
 * @param {Object} task - Task object
 * @param {Object} options - Optional parameters
 * @param {Object} options.parentTask - Parent task object for subtasks
 * @returns {string|null} Jira issue key or null if not found
 */
export function getTicketId(task, options = {}) {
    return getTicketIdFromUtils(task, { ...options, debug: true });
}

/**
 * Create a user story in Jira
 * @param {Object} taskData - Task data
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<Object>} Created issue data
 */
export async function createStory(taskData, explicitRoot = null) {
    // Validate configuration
    const config = validateConfig(explicitRoot);
    if (!config) {
        return null;
    }

    const { projectKey } = config;

    try {
        // Check if we have the required data
        if (!taskData || !taskData.title) {
            log('error', 'Missing required task data for creating Jira story');
            return null;
        }

        // Format the title for Jira if needed
        const title = formatTitleForJira ? formatTitleForJira(taskData.title) : taskData.title;

        // Prepare the issue data
        const issueData = {
            fields: {
                project: {
                    key: projectKey
                },
                summary: title,
                description: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: taskData.description || ''
                                }
                            ]
                        }
                    ]
                },
                issuetype: {
                    name: 'Story' // Default to Story, can be customized
                }
            }
        };

        // Add priority if specified
        if (taskData.priority) {
            const jiraPriority = mapPriorityToTicket(taskData.priority);
            if (jiraPriority) {
                issueData.fields.priority = {
                    name: jiraPriority
                };
            }
        }

        // Create the issue in Jira
        const result = await createIssue(issueData, config);
        return result;
    } catch (error) {
        log('error', `Error creating Jira story: ${error.message}`);
        return null;
    }
}

/**
 * Create a task/subtask in the Jira system
 * @param {Object} subtaskData - Subtask data
 * @param {string} parentTicketId - Parent ticket ID in the ticketing system
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<Object>} Created ticket data
 */
export async function createTask(subtaskData, parentTicketId, explicitRoot = null) {
    // Validate configuration
    const config = validateConfig(explicitRoot);
    if (!config) {
        return null;
    }

    const { projectKey } = config;

    try {
        // Check if parent ticket exists
        const parentExists = await checkTicketExists(parentTicketId, config);
        if (!parentExists) {
            log('error', `Parent ticket ${parentTicketId} does not exist in Jira`);
            return null;
        }

        // Format the title for Jira if needed
        const title = formatTitleForJira ? formatTitleForJira(subtaskData.title) : subtaskData.title;

        // Prepare the issue data
        let payload;
        try {
            // Get available issue types for the project
            const issueTypeMapping = getIssueTypeMapping(explicitRoot);
            const subtaskType = issueTypeMapping?.subtask || 'Sub-task';
            
            // Try to find a suitable issue type
            const selectedType = { name: subtaskType, subtask: true, id: '5' }; // Default fallback

            if (selectedType) {
                payload = {
                    fields: {
                        project: {
                            key: projectKey
                        },
                        summary: title,
                        description: {
                            type: 'doc',
                            version: 1,
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: subtaskData.description || ''
                                        }
                                    ]
                                }
                            ]
                        },
                        issuetype: {
                            id: selectedType.id
                        }
                    }
                };

                // Only add parent field if the issue type supports it (is a subtask)
                if (selectedType.subtask) {
                    payload.fields.parent = {
                        key: parentTicketId
                    };
                } else {
                    // For non-subtask issue types, we don't set the parent
                    log('warn', `Using regular issue type ${selectedType.name} without parent relationship`);
                }
            } else {
                log('error', 'No suitable issue type found in project');
                throw new Error('No suitable issue type found');
            }
        } catch (error) {
            log('error', `Error preparing Jira issue: ${error.message}`);

            // Create a simple task without link - this is a minimal approach but at least creates an issue
            log('info', 'Unable to create subtask. Skipping subtask creation for now.');
            return null; // Return null to indicate we couldn't create the subtask
        }

        // Check if payload is defined
        if (!payload) {
            log('error', 'Failed to create Jira issue payload');
            return null;
        }

        // Add priority if specified
        if (subtaskData.priority) {
            const jiraPriority = mapPriorityToTicket(subtaskData.priority);
            if (jiraPriority) {
                payload.fields.priority = {
                    name: jiraPriority
                };
            }
        }

        // Create the issue in Jira
        const result = await createIssue(payload, config);
        return result;
    } catch (error) {
        log('error', `Error creating Jira subtask: ${error.message}`);
        return null;
    }
}

/**
 * Get all tickets from Jira for the configured project
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<Array>} Array of Jira tickets
 */
export async function getAllTickets(explicitRoot = null) {
    const config = validateConfig(explicitRoot);
    if (!config) {
        return [];
    }

    return fetchAllTickets(config);
}

/**
 * Get current status of a Jira ticket
 * @param {string} ticketId - The Jira ticket ID
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<string|null>} - The status of the ticket or null if it couldn't be fetched
 */
export async function getTicketStatusById(ticketId, explicitRoot = null) {
    const config = validateConfig(explicitRoot);
    if (!config || !ticketId) {
        return null;
    }

    return getTicketStatus(ticketId, config);
}

/**
 * Update the status of a Jira ticket
 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
 * @param {string} taskmasterStatus - TaskMaster status (e.g., 'done', 'in-progress')
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @param {Object|null} taskData - Optional task data for additional updates
 * @returns {Promise<boolean>} True if the update was successful, false otherwise
 */
export async function updateTicketStatusById(
    ticketId,
    taskmasterStatus,
    explicitRoot = null,
    taskData = null
) {
    // Validate configuration
    const config = validateConfig(explicitRoot);
    if (!config) {
        return false;
    }

    // Map TaskMaster status to Jira status
    const jiraStatus = mapStatusToTicket(taskmasterStatus);
    if (!jiraStatus) {
        log('error', `Could not map TaskMaster status "${taskmasterStatus}" to Jira status`);
        return false;
    }

    // Update the ticket status
    return updateTicketStatus(ticketId, jiraStatus, config);
}

/**
 * Check if a ticket exists in the Jira system
 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Promise<boolean>} True if the ticket exists, false otherwise
 */
export async function ticketExists(ticketId, explicitRoot = null) {
    const config = validateConfig(explicitRoot);
    if (!config || !ticketId) {
        return false;
    }

    return checkTicketExists(ticketId, config);
}
