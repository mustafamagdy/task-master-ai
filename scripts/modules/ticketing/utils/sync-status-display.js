/**
 * sync-status-display.js
 * Component for displaying task synchronization status between Task Master and ticketing systems
 */

import chalk from 'chalk';
import boxen from 'boxen';

/**
 * Creates a formatted table display of synchronization statistics
 * @param {Object} stats - The synchronization statistics
 * @param {number} stats.tasksCreated - Number of tasks created in ticketing system
 * @param {number} stats.subtasksCreated - Number of subtasks created in ticketing system
 * @param {number} stats.tasksUpdated - Number of tasks updated in ticketing system
 * @param {number} stats.subtasksUpdated - Number of subtasks updated in ticketing system 
 * @param {number} stats.errors - Number of errors encountered during synchronization
 * @param {Object} options - Display options
 * @param {boolean} options.colorize - Whether to colorize the output (default: true)
 * @returns {string} Formatted display string
 */
export function formatSyncTable(stats = {}, options = {}) {
  const {
    tasksCreated = 0,
    subtasksCreated = 0,
    tasksUpdated = 0,
    subtasksUpdated = 0,
    errors = 0
  } = stats;
  
  const { colorize = true } = options;
  
  // Calculate totals
  const totalItemsCreated = tasksCreated + subtasksCreated;
  const totalItemsUpdated = tasksUpdated + subtasksUpdated;
  const totalItems = totalItemsCreated + totalItemsUpdated;
  
  // Colors for different sections
  const c = colorize ? {
    header: chalk.cyan.bold,
    subheader: chalk.cyan,
    taskLabel: chalk.yellow,
    subtaskLabel: chalk.yellow,
    divider: chalk.cyan,
    number: chalk.green,
    total: chalk.green.bold,
    error: chalk.red.bold,
    syncStatus: chalk.bgCyan.black.bold
  } : {
    header: (text) => text,
    subheader: (text) => text,
    taskLabel: (text) => text,
    subtaskLabel: (text) => text,
    divider: (text) => text,
    number: (text) => text,
    total: (text) => text,
    error: (text) => text,
    syncStatus: (text) => text
  };

  // Create the table rows
  const rows = [
    // Header
    c.syncStatus(' TICKET SYNCHRONIZATION COMPLETE '),
    '',
    // Tasks section
    `${c.header('TASKS')}`,
    `○ ${c.taskLabel('Created:')}${' '.repeat(5)}${c.number(tasksCreated.toString().padStart(6))}`,
    `○ ${c.taskLabel('Updated:')}${' '.repeat(5)}${c.number(tasksUpdated.toString().padStart(6))}`,
    '',
    // Subtasks section
    `${c.header('SUBTASKS')}`,
    `○ ${c.subtaskLabel('Created:')}${' '.repeat(5)}${c.number(subtasksCreated.toString().padStart(6))}`,
    `○ ${c.subtaskLabel('Updated:')}${' '.repeat(5)}${c.number(subtasksUpdated.toString().padStart(6))}`,
    '',
    // Divider
    c.divider('─'.repeat(34)),
    // Totals section
    `${c.total('Total Items:')}${' '.repeat(3)}${c.total(totalItems.toString().padStart(6))}`,
    `${errors > 0 ? c.error('Errors:') : 'Errors:'}${' '.repeat(8)}${errors > 0 ? c.error(errors.toString().padStart(6)) : errors.toString().padStart(6)}`
  ];

  // Join rows with newlines
  const displayContent = rows.join('\n');

  // Style the box
  const boxOptions = {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: colorize ? 'cyan' : undefined,
    backgroundColor: colorize ? '#222' : undefined
  };

  // Return the boxed content
  return boxen(displayContent, boxOptions);
}

/**
 * Displays a formatted table of synchronization statistics to the console
 * @param {Object} stats - The synchronization statistics 
 * @param {Object} options - Display options
 * @param {boolean} options.colorize - Whether to colorize the output
 * @param {Function} options.logger - Custom logger function (defaults to console.log)
 */
export function displaySyncTable(stats = {}, options = {}) {
  const { logger = console.log } = options;
  const formattedTable = formatSyncTable(stats, options);
  logger(formattedTable);
}
