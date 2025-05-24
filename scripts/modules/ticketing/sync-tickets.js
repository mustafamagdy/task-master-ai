/**
 * sync-tickets.js
 * Simplified version using unified ticketing service
 * Generic task synchronization with ticketing systems
 */

import fs from 'fs';
import path from 'path';
import { log, readJSON, writeJSON } from '../utils.js';
import { getTicketingSystemEnabled } from '../config-manager.js';
import ticketingSyncService from './ticketing-sync-service.js';

// Default debug mode - set to false in production
const DEBUG = false;

/**
 * Synchronize tasks with the configured ticketing system
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force synchronization even if not enabled
 * @param {boolean} options.debug - Enable debug logging for troubleshooting
 * @param {Object} options.mcpLog - MCP logger functions
 * @returns {Promise<Object>} Synchronization result
 */
async function syncTickets(tasksPath, options = {}) {
	const { force = false, debug = DEBUG, mcpLog = null } = options;

	// Create custom logger
	const customLog = mcpLog || {
		info: log.bind(null, 'info'),
		warn: log.bind(null, 'warn'),
		error: log.bind(null, 'error'),
		success: log.bind(null, 'success')
	};

	// Extract project root from the tasks path
	const projectRoot = tasksPath.replace(/[\/]tasks[\/]tasks\.json$/, '');

	customLog.info('Starting task synchronization with ticketing system using unified service...');

	try {
		// Check if ticketing is enabled
		let enabled = false;
		try {
			enabled = await getTicketingSystemEnabled(projectRoot);
		} catch (error) {
			customLog.error(
				`Error checking if ticketing is enabled: ${error.message}`
			);
			return {
				success: false,
				message: `Ticketing system error: ${error.message}`
			};
		}

		// Return if not enabled and not forced
		if (!force && !enabled) {
			customLog.info(
				'Ticketing system integration is not enabled and not forced'
			);
			customLog.warn('Ticketing system integration is not enabled.');
			return {
				success: false,
				message:
					'Ticketing system integration is not enabled. Use --force to override.'
			};
		}

		// Read tasks data
		customLog.info(`Reading tasks from ${tasksPath}...`);
		const data = options.readJSON?.(tasksPath) || readJSON(tasksPath);

		if (!data || !data.tasks || !Array.isArray(data.tasks)) {
			customLog.error(`Invalid tasks data in ${tasksPath}`);
			return { success: false, message: 'Error: Invalid tasks data' };
		}

		customLog.info(
			`Processing ${data.tasks.length} tasks using unified ticketing service...`
		);

		// Use the unified ticketing service to sync all tasks
		const syncResult = await ticketingSyncService.syncMultipleTasks(
			data.tasks,
			tasksPath,
			projectRoot
		);

		if (syncResult.success) {
			customLog.success(`Successfully synchronized ${syncResult.created} tickets`);
			
			if (syncResult.errors.length > 0) {
				customLog.warn(`${syncResult.errors.length} errors occurred:`);
				syncResult.errors.forEach(error => customLog.warn(`  - ${error}`));
			}

			return {
				success: true,
				stats: {
					tasksCreated: syncResult.created,
					subtasksCreated: 0, // Will be included in created count
					tasksUpdated: 0,
					subtasksUpdated: 0,
					ticketsUpdated: 0,
					tasksWithTimestampsAdded: 0,
					errors: syncResult.errors.length
				}
			};
		} else {
			customLog.error('Synchronization failed');
			return {
				success: false,
				message: 'Synchronization failed',
				stats: {
					tasksCreated: 0,
					subtasksCreated: 0,
					tasksUpdated: 0,
					subtasksUpdated: 0,
					ticketsUpdated: 0,
					tasksWithTimestampsAdded: 0,
					errors: syncResult.errors?.length || 1
				}
			};
		}
	} catch (error) {
		customLog.error(`Synchronization error: ${error.message}`);
		return {
			success: false,
			message: error.message,
			stats: {
				tasksCreated: 0,
				subtasksCreated: 0,
				tasksUpdated: 0,
				subtasksUpdated: 0,
				ticketsUpdated: 0,
				tasksWithTimestampsAdded: 0,
				errors: 1
			}
		};
	}
}

/**
 * Export the syncTickets function
 */
export { syncTickets }; 