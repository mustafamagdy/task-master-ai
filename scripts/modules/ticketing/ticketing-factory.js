/**
 * ticketing-factory.js
 * Factory pattern for creating ticketing system implementation instances
 */

import { log } from '../utils.js';

// Import implementations
import JiraTicketing from './jira-ticketing.js';
import AzureDevOpsTicketing from './azure-devops-ticketing.js';
import GitHubProjectsTicketing from './github-projects-ticketing.js';

/**
 * Factory class for creating ticketing system implementations
 */
class TicketingSystemFactory {
	/**
	 * Create the appropriate ticketing system implementation based on type
	 * @param {string} type - Type of ticketing system ('jira', 'azure', 'github', 'none')
	 * @param {Object} config - Configuration object
	 * @returns {Object|null} Ticketing system implementation or null
	 */
	static create(type, config) {
		// Default to null (no ticketing system)
		if (!type || type.toLowerCase() === 'none') {
			return null;
		}

		try {
			switch (type.toLowerCase()) {
				case 'jira':
					return new JiraTicketing(config);

				case 'azure':
				case 'azuredevops':
					return new AzureDevOpsTicketing(config);

				case 'github':
				case 'githubprojects':
					return new GitHubProjectsTicketing(config);

				default:
					log('warn', `Unknown ticketing system type: ${type}`);
					return null;
			}
		} catch (error) {
			log('error', `Error creating ticketing system: ${error.message}`);
			return null;
		}
	}
}

/**
 * Get the appropriate ticketing system instance based on configuration
 * @param {string} [explicitType=null] - Optional override of ticketing system type
 * @param {string|null} [explicitRoot=null] - Optional explicit path to the project root
 * @returns {Object|null} Ticketing system implementation instance or null
 */
async function getTicketingInstance(explicitType = null, explicitRoot = null) {
	try {
		// Dynamically import to avoid circular dependencies
		const { getConfig, getTicketingIntegrationEnabled } = await import(
			'../config-manager.js'
		);

		// Check if ticketing integration is enabled
		if (!getTicketingIntegrationEnabled(explicitRoot) && !explicitType) {
			return null;
		}

		// Get the configuration
		const config = getConfig(explicitRoot);

		// Get the ticketing system type
		const type = explicitType || config?.global?.ticketingSystem || 'none';

		// Create and return the appropriate implementation
		return TicketingSystemFactory.create(type, config);
	} catch (error) {
		log('error', `Error getting ticketing system instance: ${error.message}`);
		return null;
	}
}

export default TicketingSystemFactory;
export { getTicketingInstance };
