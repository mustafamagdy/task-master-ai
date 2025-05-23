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
 * @returns {Promise<boolean>} Success status
 */
async function initializeEventSystem() {
	if (initialized) {
		log('info', 'Event system already initialized.');
		return true;
	}

	try {
		log('info', 'Initializing event system...');

		// Initialize ticketing subscribers (now returns a Promise)
		ticketingUnsubscribe = await initializeTicketingSubscribers();

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
 * @returns {Promise<void>} A promise that resolves when shutdown is complete
 */
async function shutdownEventSystem() {
	if (!initialized) {
		return;
	}

	try {
		log('info', 'Shutting down event system...');

		// Unsubscribe ticketing subscribers
		if (typeof ticketingUnsubscribe === 'function') {
			await Promise.resolve(ticketingUnsubscribe()).catch((err) => {
				log('warn', `Error during ticketing unsubscribe: ${err.message}`);
			});
			ticketingUnsubscribe = null;
		} else if (ticketingUnsubscribe !== null) {
			log('warn', 'Ticketing unsubscribe is not a function, skipping');
		}

		// Unsubscribe other subscribers here as needed

		initialized = false;
		log('success', 'Event system shut down successfully.');
	} catch (error) {
		log('error', `Error shutting down event system: ${error.message}`);
	}
}

export { initializeEventSystem, shutdownEventSystem };
