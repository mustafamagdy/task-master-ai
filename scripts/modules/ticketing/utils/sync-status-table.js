/**
 * sync-status-table.js
 * Displays a formatted table showing task synchronization status between Task Master and ticketing systems
 */

import chalk from 'chalk';

/**
 * Creates a formatted table display of synchronization statistics
 * @param {Object} stats - The synchronization statistics
 * @param {number} stats.tasksCreated - Number of tasks created in ticketing system
 * @param {number} stats.subtasksCreated - Number of subtasks created in ticketing system
 * @param {number} stats.tasksUpdated - Number of tasks updated in ticketing system
 * @param {number} stats.subtasksUpdated - Number of subtasks updated in ticketing system 
 * @param {number} stats.errors - Number of errors encountered during synchronization
 * @returns {string} Formatted table string
 */
export function formatSyncStatusTable(stats = {}) {
  const {
    tasksCreated = 0,
    subtasksCreated = 0,
    tasksUpdated = 0,
    subtasksUpdated = 0,
    errors = 0
  } = stats;
  
  // Calculate totals
  const totalCreated = tasksCreated + subtasksCreated;
  const totalUpdated = tasksUpdated + subtasksUpdated;
  const totalItems = totalCreated + totalUpdated;
  
  // Define table styles
  const styles = {
    header: chalk.cyan.bold,
    subheader: chalk.cyan,
    border: chalk.cyan,
    value: chalk.green,
    error: chalk.red.bold,
    title: chalk.bgCyan.black.bold
  };
  
  // Define table borders
  const borders = {
    top: styles.border('╔═══════════════════════════════════════╗'),
    headerSep: styles.border('╠═══════════════════════════════════════╣'),
    middle: styles.border('╠═══════════════════════╦═══════════════╣'),
    columnSep: styles.border('║'),
    bottom: styles.border('╚═══════════════════════╩═══════════════╝'),
    rowSep: styles.border('╟───────────────────────┼───────────────╢')
  };
  
  // Build the table
  const table = [
    borders.top,
    `${borders.columnSep} ${styles.title(' TICKET SYNCHRONIZATION COMPLETE ')}${' '.repeat(5)}${borders.columnSep}`,
    borders.headerSep,
    `${borders.columnSep} ${styles.header('OPERATION')}${' '.repeat(14)}${borders.columnSep} ${styles.header('COUNT')}${' '.repeat(8)}${borders.columnSep}`,
    borders.middle,
    `${borders.columnSep} Tasks Created${' '.repeat(11)}${borders.columnSep} ${styles.value(tasksCreated.toString().padStart(9))}${' '.repeat(4)}${borders.columnSep}`,
    borders.rowSep,
    `${borders.columnSep} Tasks Updated${' '.repeat(11)}${borders.columnSep} ${styles.value(tasksUpdated.toString().padStart(9))}${' '.repeat(4)}${borders.columnSep}`,
    borders.rowSep,
    `${borders.columnSep} Subtasks Created${' '.repeat(8)}${borders.columnSep} ${styles.value(subtasksCreated.toString().padStart(9))}${' '.repeat(4)}${borders.columnSep}`,
    borders.rowSep,
    `${borders.columnSep} Subtasks Updated${' '.repeat(8)}${borders.columnSep} ${styles.value(subtasksUpdated.toString().padStart(9))}${' '.repeat(4)}${borders.columnSep}`,
    borders.rowSep,
    `${borders.columnSep} ${styles.header('Total Items')}${' '.repeat(13)}${borders.columnSep} ${styles.header(totalItems.toString().padStart(9))}${' '.repeat(4)}${borders.columnSep}`,
    borders.rowSep,
    `${borders.columnSep} ${errors > 0 ? styles.error('Errors') : 'Errors'}${' '.repeat(18)}${borders.columnSep} ${errors > 0 ? styles.error(errors.toString().padStart(9)) : errors.toString().padStart(9)}${' '.repeat(4)}${borders.columnSep}`,
    borders.bottom
  ];
  
  return table.join('\n');
}

/**
 * Displays a formatted table of synchronization statistics to the console
 * @param {Object} stats - The synchronization statistics 
 * @param {Function} logger - Custom logger function (defaults to console.log)
 */
export function displaySyncStatusTable(stats = {}, logger = console.log) {
  const table = formatSyncStatusTable(stats);
  logger(table);
}
