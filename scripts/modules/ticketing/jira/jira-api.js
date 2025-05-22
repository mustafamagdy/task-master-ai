/**
 * jira-api.js
 * Handles direct API interactions with Jira
 */

import { log } from '../../utils.js';
import { getAuthHeaders } from './jira-config.js';

// API version to use consistently across all endpoints
export const JIRA_API_VERSION = '3';

/**
 * Get all tickets from Jira for the configured project
 * @param {Object} config - Jira configuration object
 * @returns {Promise<Array>} Array of Jira tickets
 */
export async function getAllTickets(config) {
    if (!config) return [];

    const { projectKey, baseUrl, email, apiToken } = config;

    try {
        // JQL query to get all issues for the project
        const jql = encodeURIComponent(`project = ${projectKey} ORDER BY created DESC`);
        const url = `${baseUrl}/rest/api/${JIRA_API_VERSION}/search?jql=${jql}&maxResults=100`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders(email, apiToken)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log('error', `Error fetching Jira tickets: ${response.status} ${errorText}`);
            return [];
        }

        const data = await response.json();
        return data.issues || [];
    } catch (error) {
        log('error', `Error fetching Jira tickets: ${error.message}`);
        return [];
    }
}

/**
 * Get current status of a Jira ticket
 * @param {string} ticketId - The Jira ticket ID
 * @param {Object} config - Jira configuration object
 * @returns {Promise<Object|null>} - Object with status and updated properties or null if couldn't be fetched
 */
export async function getTicketStatus(ticketId, config) {
    if (!ticketId || !config) return null;

    const { baseUrl, email, apiToken } = config;

    try {
        // Request status and updated fields
        const url = `${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${encodeURIComponent(ticketId)}?fields=status,updated`;
        console.log(`[API-DEBUG] Fetching ticket status from URL: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders(email, apiToken)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log('error', `Error fetching Jira ticket status: ${response.status} ${errorText}`);
            console.log(`[API-ERROR] Failed to fetch ticket status: ${response.status} ${errorText}`);
            return null;
        }

        const data = await response.json();
        console.log(`[API-DEBUG] Received Jira data: ${JSON.stringify(data.fields || {})}`);
        
        // Return object with status and updated timestamp
        return {
            status: data.fields?.status?.name || null,
            updated: data.fields?.updated || null
        };
    } catch (error) {
        log('error', `Error fetching Jira ticket status: ${error.message}`);
        console.log(`[API-ERROR] Exception fetching ticket status: ${error.message}`);
        return null;
    }
}

/**
 * Update the status of a Jira ticket
 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
 * @param {string} jiraStatus - Jira status to set
 * @param {Object} config - Jira configuration object
 * @returns {Promise<boolean>} True if the update was successful, false otherwise
 */
export async function updateTicketStatus(ticketId, jiraStatus, config) {
    if (!ticketId || !jiraStatus || !config) return false;

    const { baseUrl, email, apiToken } = config;

    try {
        // First, get the available transitions for this ticket
        const transitionsUrl = `${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${encodeURIComponent(ticketId)}/transitions`;
        
        const transitionsResponse = await fetch(transitionsUrl, {
            method: 'GET',
            headers: getAuthHeaders(email, apiToken)
        });

        if (!transitionsResponse.ok) {
            const errorText = await transitionsResponse.text();
            log('error', `Error fetching Jira transitions: ${transitionsResponse.status} ${errorText}`);
            return false;
        }

        const transitionsData = await transitionsResponse.json();
        const transitions = transitionsData.transitions || [];

        // Find the transition that matches our target status
        const transition = transitions.find(t => 
            t.to.name.toLowerCase() === jiraStatus.toLowerCase() ||
            t.name.toLowerCase() === jiraStatus.toLowerCase()
        );

        if (!transition) {
            log('error', `No transition found for status: ${jiraStatus}`);
            log('info', 'Available transitions: ' + transitions.map(t => t.name).join(', '));
            return false;
        }

        // Apply the transition
        const updateUrl = `${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${encodeURIComponent(ticketId)}/transitions`;
        const payload = {
            transition: {
                id: transition.id
            }
        };

        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: getAuthHeaders(email, apiToken),
            body: JSON.stringify(payload)
        });

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            log('error', `Error updating Jira status: ${updateResponse.status} ${errorText}`);
            return false;
        }

        log('success', `Updated Jira ticket ${ticketId} to status: ${jiraStatus}`);
        return true;
    } catch (error) {
        log('error', `Error updating Jira status: ${error.message}`);
        return false;
    }
}

/**
 * Create an issue in Jira
 * @param {Object} issueData - Issue data to create
 * @param {Object} config - Jira configuration object
 * @returns {Promise<Object|null>} Created issue data or null if failed
 */
export async function createIssue(issueData, config) {
    if (!issueData || !config) return null;

    const { baseUrl, email, apiToken } = config;

    try {
        const response = await fetch(
            `${baseUrl}/rest/api/${JIRA_API_VERSION}/issue`,
            {
                method: 'POST',
                headers: getAuthHeaders(email, apiToken),
                body: JSON.stringify(issueData)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            log('error', `Error creating Jira issue: ${response.status} ${errorText}`);
            return null;
        }

        const data = await response.json();
        log('success', `Created Jira issue: ${data.key}`);
        return data;
    } catch (error) {
        log('error', `Error creating Jira issue: ${error.message}`);
        return null;
    }
}

/**
 * Check if a ticket exists in the Jira system
 * @param {string} ticketId - Jira ticket ID/key (e.g., 'PROJ-123')
 * @param {Object} config - Jira configuration object
 * @returns {Promise<boolean>} True if the ticket exists, false otherwise
 */
export async function ticketExists(ticketId, config) {
    if (!ticketId || !config) return false;

    const { baseUrl, email, apiToken } = config;

    try {
        // Use the issue API to check if the ticket exists
        const url = `${baseUrl}/rest/api/${JIRA_API_VERSION}/issue/${encodeURIComponent(ticketId)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders(email, apiToken)
        });

        // If we get a 200 OK response, the ticket exists
        if (response.ok) {
            return true;
        }

        // If we get a 404 Not Found, the ticket doesn't exist
        if (response.status === 404) {
            return false;
        }

        // For other errors, log them but assume the ticket doesn't exist for safety
        log('error', `Error checking if ticket exists: ${response.status} ${response.statusText}`);
        return false;
    } catch (error) {
        log('error', `Error checking if ticket exists: ${error.message}`);
        return false;
    }
}
