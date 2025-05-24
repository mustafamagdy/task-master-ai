/**
 * task-file-utils.js
 * Utilities for working with task files and paths
 */

import { findTasksJsonPath } from '../../../../mcp-server/src/core/utils/path-utils.js';

/**
 * Find the tasks.json file path based on project root and optional file path
 * @param {Object} options - Options object
 * @param {string} options.projectRoot - The project root directory
 * @param {string} options.file - Optional explicit path to the tasks file
 * @param {Object} logger - Logger object
 * @returns {string} Path to the tasks.json file
 * @throws {Error} If the tasks.json file cannot be found
 */
export function findTasksFile(options, logger = console) {
	try {
		return findTasksJsonPath(
			{
				projectRoot: options.projectRoot,
				file: options.file
			},
			logger
		);
	} catch (error) {
		logger.error(`Error finding tasks.json: ${error.message}`);
		throw new Error(`Failed to find tasks.json: ${error.message}`);
	}
}
