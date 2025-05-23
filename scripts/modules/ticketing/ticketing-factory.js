/**
 * ticketing-factory.js
 * Factory pattern for creating ticketing system implementation instances
 */

import { log } from '../utils.js';

// Import implementations
import JiraTicketing from './jira/jira-ticketing.js';
import AzureDevOpsTicketing from './azdevops/azure-devops-ticketing.js';
import GitHubProjectsTicketing from './github/github-projects-ticketing.js';

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
		// DEBUG: Log initial creation attempt
		log('debug', `[TICKETING-DEBUG] Factory creating ticketing system type: ${type}`);
		log('debug', `[TICKETING-DEBUG] Factory config available: ${!!config}`);
		
		// Default to null (no ticketing system)
		if (!type || type.toLowerCase() === 'none') {
			log('debug', `[TICKETING-DEBUG] No ticketing type specified or 'none' selected`);
			return null;
		}

		try {
			log('debug', `[TICKETING-DEBUG] Creating ticketing system for type: ${type.toLowerCase()}`);
			switch (type.toLowerCase()) {
				case 'jira':
					log('debug', `[TICKETING-DEBUG] Creating Jira ticketing instance`);
					const jiraInstance = new JiraTicketing(config);
					log('debug', `[TICKETING-DEBUG] Jira instance created successfully: ${!!jiraInstance}`);
					return jiraInstance;

				case 'azure':
				case 'azuredevops':
					log('debug', `[TICKETING-DEBUG] Creating Azure DevOps ticketing instance`);
					const azureInstance = new AzureDevOpsTicketing(config);
					log('debug', `[TICKETING-DEBUG] Azure DevOps instance created successfully: ${!!azureInstance}`);
					return azureInstance;

				case 'github':
				case 'githubprojects':
					log('debug', `[TICKETING-DEBUG] Creating GitHub Projects ticketing instance`);
					const githubInstance = new GitHubProjectsTicketing(config);
					log('debug', `[TICKETING-DEBUG] GitHub Projects instance created successfully: ${!!githubInstance}`);
					return githubInstance;

				default:
					log('warn', `Unknown ticketing system type: ${type}`);
					return null;
			}
		} catch (error) {
			log('error', `Error creating ticketing system: ${error.message}`);
			log('debug', `[TICKETING-DEBUG] Factory creation error details: ${JSON.stringify({name: error.name, message: error.message, stack: error.stack})}`);
			console.error('[TICKETING-DEBUG] Factory creation full error:', error);
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
	log('debug', `[TICKETING-DEBUG] getTicketingInstance called with explicitType=${explicitType}, explicitRoot=${explicitRoot}`);
	
	try {
		// Dynamically import to avoid circular dependencies
		log('debug', `[TICKETING-DEBUG] Importing config-manager.js`);
		const { getConfig, getTicketingIntegrationEnabled } = await import(
			'../config-manager.js'
		);
		log('debug', `[TICKETING-DEBUG] Successfully imported config-manager.js`);

		// Check if ticketing integration is enabled
		const ticketingEnabled = getTicketingIntegrationEnabled(explicitRoot);
		log('debug', `[TICKETING-DEBUG] Ticketing integration enabled: ${ticketingEnabled}, explicitType: ${explicitType}`);
		
		if (!ticketingEnabled && !explicitType) {
			log('debug', `[TICKETING-DEBUG] Ticketing integration disabled and no explicit type, returning null`);
			return null;
		}

		// Get the configuration
		const config = getConfig(explicitRoot);
		log('debug', `[TICKETING-DEBUG] Config retrieved: ${!!config}`);
		log('debug', `[TICKETING-DEBUG] Ticketing config present: ${!!config?.ticketing}`);
		if (config?.ticketing) {
			log('debug', `[TICKETING-DEBUG] Ticketing system in config: ${config.ticketing.system || 'not set'}`);
		}

		// Get the ticketing system type
		const type = explicitType || config?.ticketing?.system || 'none';
		log('debug', `[TICKETING-DEBUG] Final ticketing type to create: ${type}`);

		// Create and return the appropriate implementation
		log('debug', `[TICKETING-DEBUG] Calling factory create with type=${type}`);
		const instance = TicketingSystemFactory.create(type, config);
		log('debug', `[TICKETING-DEBUG] Factory create returned instance: ${!!instance}`);
		return instance;
	} catch (error) {
		log('error', `Error getting ticketing system instance: ${error.message}`);
		log('debug', `[TICKETING-DEBUG] Get instance error details: ${JSON.stringify({name: error.name, message: error.message, stack: error.stack})}`);
		console.error('[TICKETING-DEBUG] Get instance full error:', error);
		return null;
	}
}

export default TicketingSystemFactory;
export { getTicketingInstance };
