/**
 * initialize-events.js
 * Initializes the event system and registers handlers
 */

import { log } from '../utils.js';
import { initializeTicketingSubscribers } from '../ticketing/ticketing-event-subscriber.js';

let initialized = false;
let ticketingUnsubscribe = null;

/**
 * Initialize the event system and register all subscribers
 * This should be called when the application starts
 * @returns {boolean} Success status
 */
function initializeEventSystem() {
  if (initialized) {
    log('info', 'Event system already initialized.');
    return true;
  }

  try {
    log('info', 'Initializing event system...');
    
    // Initialize ticketing subscribers
    ticketingUnsubscribe = initializeTicketingSubscribers();
    
    // Initialize other subscribers here as needed
    
    initialized = true;
    log('success', 'Event system initialized successfully.');
    return true;
  } catch (error) {
    log('error', `Error initializing event system: ${error.message}`);
    return false;
  }
}

/**
 * Shutdown the event system and unregister all subscribers
 * This should be called when the application shuts down
 */
function shutdownEventSystem() {
  if (!initialized) {
    return;
  }
  
  try {
    log('info', 'Shutting down event system...');
    
    // Unsubscribe ticketing subscribers
    if (ticketingUnsubscribe) {
      ticketingUnsubscribe();
      ticketingUnsubscribe = null;
    }
    
    // Unsubscribe other subscribers here as needed
    
    initialized = false;
    log('success', 'Event system shut down successfully.');
  } catch (error) {
    log('error', `Error shutting down event system: ${error.message}`);
  }
}

export { initializeEventSystem, shutdownEventSystem };
