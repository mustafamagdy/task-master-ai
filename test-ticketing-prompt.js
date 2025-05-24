// Test script for promptForTicketingSystem
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the init.js module to test the function
async function testTicketingPrompt() {
  try {
    const initModule = await import('./scripts/init.js');
    
    console.log('Starting test of promptForTicketingSystem...');
    
    // Call the function
    const result = await initModule.promptForTicketingSystem();
    
    console.log('Result from promptForTicketingSystem:', result);
  } catch (error) {
    console.error('Error testing promptForTicketingSystem:', error);
  }
}

// Run the test
testTicketingPrompt(); 