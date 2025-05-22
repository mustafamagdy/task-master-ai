/**
 * sync-example.js
 * Example script demonstrating how to use the sync-tickets-wrapper.js module
 * to synchronize tasks with a ticketing system.
 */

import path from 'path';
import { syncTicketsWithErrorHandling, syncSingleTask } from './sync-tickets-wrapper.js';
import { readJSON } from '../utils.js';

// Simple logger for the example
const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    warn: (message) => console.log(`[WARN] ${message}`),
    error: (message) => console.log(`[ERROR] ${message}`),
    success: (message) => console.log(`[SUCCESS] ${message}`)
};

/**
 * Main function to demonstrate ticket synchronization
 */
async function main() {
    try {
        // Get the project root directory
        const projectRoot = process.cwd();
        
        // Path to the tasks.json file
        const tasksPath = path.join(projectRoot, 'tasks', 'tasks.json');
        
        logger.info(`Using tasks file at: ${tasksPath}`);
        
        // Options for the synchronization
        const options = {
            debug: true,
            force: false, // Set to true to force synchronization even if not enabled
            mcpLog: logger
        };
        
        // Synchronize all tasks
        logger.info('Starting synchronization of all tasks...');
        const result = await syncTicketsWithErrorHandling(tasksPath, options);
        
        if (result.success) {
            logger.success(`Synchronization completed successfully: ${result.message}`);
        } else {
            logger.error(`Synchronization failed: ${result.message}`);
        }
        
        // Example of synchronizing a single task
        logger.info('Example of synchronizing a single task:');
        
        // Read the tasks data
        const tasksData = readJSON(tasksPath);
        if (tasksData && tasksData.tasks && tasksData.tasks.length > 0) {
            // Get the first task as an example
            const exampleTask = tasksData.tasks[0];
            logger.info(`Synchronizing single task: ${exampleTask.id} - ${exampleTask.title}`);
            
            // Synchronize the single task
            const singleResult = await syncSingleTask(exampleTask, tasksPath, options);
            
            if (singleResult.success) {
                logger.success(`Single task synchronization completed successfully`);
            } else {
                logger.warn(`Single task synchronization completed with issues: ${singleResult.message}`);
            }
        } else {
            logger.warn('No tasks found in the tasks.json file');
        }
        
    } catch (error) {
        logger.error(`Unexpected error: ${error.message}`);
        console.error(error);
    }
}

// Run the main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
