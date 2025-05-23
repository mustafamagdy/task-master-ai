/**
 * jira-config.js
 * Configuration-related functionality for Jira ticketing
 */

import { log } from '../../utils.js';
import {
	getConfig,
	getJiraProjectKey,
	getJiraBaseUrl,
	getJiraEmail,
	getJiraApiToken
} from '../../config-manager.js';

/**
 * Check if Jira is properly configured
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if configured, false otherwise
 */
export function isConfigured(explicitRoot = null) {
	const jiraProjectKey = getJiraProjectKey(explicitRoot);
	const config = getConfig(explicitRoot);
	const jiraBaseUrl = config?.ticketing?.jiraBaseUrl;
	const jiraEmail = config?.ticketing?.jiraEmail;
	const jiraApiToken = config?.ticketing?.jiraApiToken;

	return !!jiraProjectKey && !!jiraBaseUrl && !!jiraEmail && !!jiraApiToken;
}

/**
 * Validate Jira configuration and log warnings if invalid
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Object|null} Configuration object or null if invalid
 */
export function validateConfig(explicitRoot = null) {
	const projectKey = getJiraProjectKey(explicitRoot);
	const baseUrl = getJiraBaseUrl(explicitRoot);
	const email = getJiraEmail(explicitRoot);
	const apiToken = getJiraApiToken(explicitRoot);

	// Check if all required fields are present
	if (!projectKey) {
		log(
			'error',
			'Jira project key is not configured. Please set jiraProjectKey in your .taskmasterconfig file.'
		);
		return null;
	}

	if (!baseUrl) {
		log(
			'error',
			'Jira base URL is not configured. Please set jiraBaseUrl in your .taskmasterconfig file.'
		);
		return null;
	}

	if (!email) {
		log(
			'error',
			'Jira email is not configured. Please set jiraEmail in your .taskmasterconfig file.'
		);
		return null;
	}

	if (!apiToken) {
		log(
			'error',
			'Jira API token is not configured. Please set jiraApiToken in your .taskmasterconfig file.'
		);
		return null;
	}

	// Check for placeholder values
	if (baseUrl.includes('{{') || baseUrl.includes('}}')) {
		log(
			'error',
			'Jira base URL contains placeholder values. Please update your .taskmasterconfig file.'
		);
		return null;
	}

	if (email.includes('{{') || email.includes('}}')) {
		log(
			'error',
			'Jira email contains placeholder values. Please update your .taskmasterconfig file.'
		);
		return null;
	}

	if (apiToken.includes('{{') || apiToken.includes('}}')) {
		log(
			'error',
			'Jira API token contains placeholder values. Please update your .taskmasterconfig file.'
		);
		return null;
	}

	return { projectKey, baseUrl, email, apiToken };
}

/**
 * Get Jira configuration
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {Object} Configuration object
 */
export function getJiraConfig(explicitRoot = null) {
	// Use validateConfig since it already pulls all these values
	return validateConfig(explicitRoot);
}

/**
 * Helper method to create auth headers for Jira API requests
 * @param {string} email - Jira email
 * @param {string} apiToken - Jira API token
 * @returns {Object} Headers object with Authorization and Content-Type
 */
export function getAuthHeaders(email, apiToken) {
	return {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
	};
}
