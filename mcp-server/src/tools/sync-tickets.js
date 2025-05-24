/**
 * tools/sync-tickets.js
 * Tool to synchronize tasks with external ticketing systems
 * Uses the proven CLI implementation for reliability
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse,
	withNormalizedProjectRoot
} from './utils.js';
import { findTasksJsonPath } from '../core/utils/path-utils.js';
import { syncTicketsDirect } from '../core/task-master-core.js';

/**
 * Register the sync-tickets tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerSyncTicketsTool(server) {
	server.addTool({
		name: 'sync-tickets',
		description:
			'Synchronize Task Master tasks with the configured external ticketing system (e.g., Jira). Creates tickets for tasks that do not have associated tickets yet.',
		parameters: z.object({
			taskId: z
				.string()
				.optional()
				.describe('Optional specific task ID to synchronize. Note: Currently syncs all tasks regardless of this parameter.'),
			force: z
				.boolean()
				.optional()
				.describe('Force re-sync even if tickets already exist'),
			file: z
				.string()
				.optional()
				.describe('Path to the tasks file relative to project root'),
			projectRoot: z
				.string()
				.optional()
				.describe(
					'The directory of the project. (Optional, usually from session)'
				)
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			const toolName = 'sync-tickets';
			const { taskId, force, file, projectRoot } = args;

			try {
				log.info(
					`Executing ${toolName} tool with normalized root: ${projectRoot}`
				);

				let tasksJsonPath;
				try {
					tasksJsonPath = findTasksJsonPath({ projectRoot, file }, log);
					log.info(`${toolName}: Resolved tasks path: ${tasksJsonPath}`);
				} catch (error) {
					log.error(`${toolName}: Error finding tasks.json: ${error.message}`);
					return createErrorResponse(
						`Failed to find tasks.json within project root '${projectRoot}': ${error.message}`
					);
				}

				// Call the direct function
				const result = await syncTicketsDirect(
					{
						tasksJsonPath,
						projectRoot,
						taskId,
						force: force === true
					},
					log,
					{ session }
				);

				log.info(
					`${toolName}: Direct function result: success=${result.success}`
				);
				
				return handleApiResult(result, log, 'Error synchronizing tickets');
			} catch (error) {
				log.error(
					`Critical error in ${toolName} tool execute: ${error.message}`
				);
				return createErrorResponse(
					`Internal tool error (${toolName}): ${error.message}`
				);
			}
		})
	});
}
