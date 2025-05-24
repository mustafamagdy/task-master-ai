/**
 * sync-tickets.js
 * Direct function implementation for syncing tickets
 */

import {
	enableSilentMode,
	disableSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
// Import the proven CLI implementation
import { syncTickets } from '../../../../scripts/modules/ticketing/sync-tickets.js';

/**
 * Direct function wrapper for syncing tickets with proper error handling.
 *
 * @param {Object} args - Command arguments
 * @param {string} args.tasksJsonPath - Path to the tasks.json file
 * @param {string} [args.taskId] - Optional specific task ID to sync
 * @param {boolean} [args.force=false] - Whether to force re-sync existing tickets
 * @param {string} [args.projectRoot] - Project root path
 * @param {Object} log - Logger object
 * @param {Object} context - Additional context (session)
 * @returns {Promise<Object>} - Result object { success: boolean, data?: any, error?: { code: string, message: string } }
 */
export async function syncTicketsDirect(args, log, context = {}) {
	const { tasksJsonPath, taskId, force = false, projectRoot } = args;
	const { session } = context;

	// Create logger wrapper using the utility
	const mcpLog = createLogWrapper(log);

	try {
		log.info(
			`Starting ticket synchronization with tasksPath: ${tasksJsonPath}`
		);

		// Check if tasksJsonPath was provided
		if (!tasksJsonPath) {
			log.error('syncTicketsDirect called without tasksJsonPath');
			return {
				success: false,
				error: {
					code: 'MISSING_ARGUMENT',
					message: 'tasksJsonPath is required'
				}
			};
		}

		// Note: CLI sync-tickets doesn't support individual task filtering yet
		if (taskId) {
			log.warn(
				`Individual task sync not yet supported by CLI. Syncing all tasks.`
			);
		}

		// Use silent mode to prevent CLI output from interfering with MCP JSON response
		enableSilentMode();

		let cliResult;
		try {
			// Call the proven CLI implementation
			log.info(`Calling CLI sync-tickets implementation...`);
			cliResult = await syncTickets(tasksJsonPath, {
				force,
				debug: false, // Disable debug to prevent console spam
				mcpLog // Pass the MCP logger wrapper
			});
			log.info(`CLI sync-tickets completed with success: ${cliResult.success}`);
		} finally {
			disableSilentMode();
		}

		// Adapt CLI result format to MCP direct function format
		if (cliResult && cliResult.success) {
			// CLI returns { success: true, stats: { ... } }
			const stats = cliResult.stats || {};
			return {
				success: true,
				data: {
					message: 'Synchronization completed successfully',
					syncedTasks: stats.tasksCreated || 0,
					syncedSubtasks: stats.subtasksCreated || 0,
					updatedTasks: stats.tasksUpdated || 0,
					updatedSubtasks: stats.subtasksUpdated || 0,
					errors: stats.errors || 0,
					stats: {
						tasksCreated: stats.tasksCreated || 0,
						subtasksCreated: stats.subtasksCreated || 0,
						tasksUpdated: stats.tasksUpdated || 0,
						subtasksUpdated: stats.subtasksUpdated || 0,
						ticketsUpdated: stats.ticketsUpdated || 0,
						tasksWithTimestampsAdded: stats.tasksWithTimestampsAdded || 0,
						errors: stats.errors || 0
					}
				}
			};
		} else {
			return {
				success: false,
				error: {
					code: 'SYNC_FAILED',
					message: cliResult?.message || 'Synchronization failed'
				}
			};
		}
	} catch (error) {
		// Make sure to restore normal logging
		disableSilentMode();

		log.error(`Error in syncTicketsDirect: ${error.message}`);
		return {
			success: false,
			error: {
				code: error.code || 'SYNC_TICKETS_ERROR',
				message: error.message
			}
		};
	}
}
