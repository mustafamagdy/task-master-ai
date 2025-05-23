/**
 * display-results.js
 * Functions to display results of ticket synchronization operations
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { getTicketingSystemType } from '../config-manager.js';

/**
 * Display the results of ticket synchronization
 * @param {Object} results - Results from the syncTickets function
 */
export function displayTicketSyncResults(results) {
	if (!results.success) {
		console.log(
			chalk.yellow(`Ticket synchronization skipped: ${results.message}`)
		);
		return;
	}

	// Define statistics for cleaner code
	const stats = {
		tasksCreated: results.stats?.tasksCreated || 0,
		subtasksCreated: results.stats?.subtasksCreated || 0,
		tasksUpdated: results.stats?.tasksUpdated || 0,
		subtasksUpdated: results.stats?.subtasksUpdated || 0,
		errors: results.stats?.errors || 0,
		total: function () {
			return (
				this.tasksCreated +
				this.subtasksCreated +
				this.tasksUpdated +
				this.subtasksUpdated
			);
		}
	};

	// Calculate totals
	const totalCreated = stats.tasksCreated + stats.subtasksCreated;
	const totalUpdated = stats.tasksUpdated + stats.subtasksUpdated;

	// Get the active ticketing system name (defaults to 'External' if not available)
	const ticketingSystemType =
		results.ticketingSystemType || getTicketingSystemType() || 'External';
	const ticketingSystemName =
		ticketingSystemType.charAt(0).toUpperCase() + ticketingSystemType.slice(1);

	// Determine external system numbers (assuming they match the TaskMaster numbers for now)
	// In a real implementation, these would be derived from the results object
	const externalCreated = totalCreated;
	const externalUpdated = totalUpdated;

	// Create a table with proper formatting using the Table class
	const table = new Table({
		head: [
			chalk.cyan.bold(''),
			chalk.cyan.bold('TaskMaster'),
			chalk.cyan.bold(ticketingSystemName)
		],
		colWidths: [15, 15, 15],
		style: {
			head: [], // No special styling for header
			border: [] // No special styling for border
		}
	});

	// Add rows to the table
	table.push(
		[chalk.bold('Created'), totalCreated, externalCreated],
		[chalk.bold('Updated'), totalUpdated, externalUpdated]
	);

	// Display the synchronization title and the table
	console.log('');
	console.log(chalk.bold.white.bgGreen(' TICKET SYNCHRONIZATION COMPLETE '));
	console.log('');
	console.log(table.toString());

	// Show warning if there were errors
	if (stats.errors > 0) {
		console.log('');
		console.log(
			chalk.yellow(
				`Errors: ${stats.errors}. Some operations failed. Check the logs for details.`
			)
		);
	}
}

// Export all the display functions
export default {
	displayTicketSyncResults
};
