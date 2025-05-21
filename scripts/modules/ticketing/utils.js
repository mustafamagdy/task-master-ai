/**
 * utils.js
 * Utility functions re-exported for the ticketing module
 */

// Re-export needed utilities from the main utils module
import { log, readJSON, writeJSON } from '../utils.js';
import { getTicketingIntegrationEnabled } from '../config-manager.js';

export { log, readJSON, writeJSON, getTicketingIntegrationEnabled };
