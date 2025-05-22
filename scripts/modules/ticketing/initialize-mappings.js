/**
 * initialize-mappings.js
 * 
 * Command to initialize or update ticketing system mappings
 */

import { log } from '../utils.js';
import { getTicketingSystemType } from '../config-manager.js';
import { initializeDefaultMappings } from './mapping-manager.js';

/**
 * Initialize mapping files for the configured ticketing system
 * @param {Object} options - Command options
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 */
async function initializeMappings(options = {}, explicitRoot = null) {
  const currentSystem = getTicketingSystemType(explicitRoot);
  
  log('info', `Initializing mapping files for ticketing systems...`);
  
  // Create default mapping files for all supported systems
  await initializeDefaultMappings(explicitRoot);
  
  if (currentSystem && currentSystem !== 'none') {
    log('success', `Mapping files initialized for ${currentSystem} and other supported ticketing systems`);
    log('info', `You can customize the mappings in the taskmaster/mappings/ directory`);
  } else {
    log('info', `Default mapping files created. Enable a ticketing system in your .taskmasterconfig file to use them`);
  }
  
  return true;
}

export default initializeMappings;
