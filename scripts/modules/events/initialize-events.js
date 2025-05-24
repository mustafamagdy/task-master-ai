/**
 * initialize-events.js
 * Initializes the event system and registers handlers
 */

import { log, findProjectRoot } from '../utils.js';
import { initializeTicketingSubscribers, checkTicketingStatus } from '../ticketing/events/ticketing-event-subscriber.js';
import { getTicketingIntegrationEnabled } from '../config-manager.js';
import { getSubscribersMap, getEmittedEvents, EVENT_TYPES } from './event-emitter.js';
import { printEventDiagnostics } from './event-debug.js';

let initialized = false;
let ticketingUnsubscribe = null;

/**
 * Initialize the event system and register all subscribers
 * This should be called when the application starts
 * @param {Object} options - Options for initialization
 * @param {boolean} options.force - Force reinitialization even if already initialized
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Promise<boolean>} Success status
 */
async function initializeEventSystem(options = {}) {
	const { force = false, debug = false } = options;
	
	// Enable debug mode if requested
	if (debug) {
		process.env.DEBUG_EVENTS = 'true';
		log('debug', '[EVENT SYSTEM] Debug mode enabled');
	}
	
	if (initialized && !force) {
		log('info', '[EVENT SYSTEM] Event system already initialized.');
		return true;
	}

	try {
		log('info', '[EVENT SYSTEM] Initializing event system...');
		
		// Check if ticketing is enabled
		const projectRoot = findProjectRoot();
		const ticketingEnabled = getTicketingIntegrationEnabled(projectRoot);
		log('info', `[EVENT SYSTEM] Ticketing integration enabled: ${ticketingEnabled}`);
		
		// Log the state of subscribers before initialization
		if (debug) {
			printEventDiagnostics(getSubscribersMap(), 'before-init');
		}
		
		// Initialize ticketing subscribers (now returns a Promise)
		ticketingUnsubscribe = await initializeTicketingSubscribers();
		
		// Verify that ticketing subscribers were properly registered
		const subscribersMap = getSubscribersMap();
		const taskCreationSubscribers = subscribersMap.get(EVENT_TYPES.TASK_CREATED);
		const hasTaskCreationSubscribers = taskCreationSubscribers && taskCreationSubscribers.size > 0;
		
		if (ticketingEnabled && !hasTaskCreationSubscribers) {
			log('warn', '[EVENT SYSTEM] Ticketing is enabled but no TASK_CREATED subscribers were registered. Attempting to reinitialize...');
			
			// Try one more time
			ticketingUnsubscribe = await initializeTicketingSubscribers();
			
			// Check again
			const newSubscribersMap = getSubscribersMap();
			const newTaskCreationSubscribers = newSubscribersMap.get(EVENT_TYPES.TASK_CREATED);
			if (!newTaskCreationSubscribers || newTaskCreationSubscribers.size === 0) {
				log('error', '[EVENT SYSTEM] Failed to register ticketing subscribers. Ticketing integration may not work properly.');
			} else {
				log('success', '[EVENT SYSTEM] Successfully registered ticketing subscribers on second attempt.');
			}
		}
		
		// Initialize other subscribers here as needed

		initialized = true;
		
		// Log final state of subscribers
		if (debug) {
			printEventDiagnostics(getSubscribersMap(), 'after-init');
		}
		
		log('success', '[EVENT SYSTEM] Event system initialized successfully.');
		return true;
	} catch (error) {
		log('error', `[EVENT SYSTEM] Error initializing event system: ${error.message}`);
		if (debug) {
			console.error(error);
		}
		return false;
	}
}

/**
 * Shutdown the event system and unregister all subscribers
 * This should be called when the application shuts down
 * @param {Object} options - Options for shutdown
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Promise<void>} A promise that resolves when shutdown is complete
 */
async function shutdownEventSystem(options = {}) {
	const { debug = false } = options;
	
	if (!initialized) {
		log('debug', '[EVENT SYSTEM] Event system not initialized, no need to shut down.');
		return;
	}

	try {
		log('info', '[EVENT SYSTEM] Shutting down event system...');
		
		// Log the state of subscribers before shutdown
		if (debug) {
			printEventDiagnostics(getSubscribersMap(), 'before-shutdown');
		}

		// Unsubscribe ticketing subscribers
		if (typeof ticketingUnsubscribe === 'function') {
			log('debug', '[EVENT SYSTEM] Calling ticketing unsubscribe function...');
			await Promise.resolve(ticketingUnsubscribe()).catch((err) => {
				log('warn', `[EVENT SYSTEM] Error during ticketing unsubscribe: ${err.message}`);
			});
			ticketingUnsubscribe = null;
			log('debug', '[EVENT SYSTEM] Ticketing unsubscribe completed.');
		} else if (ticketingUnsubscribe !== null) {
			log('warn', '[EVENT SYSTEM] Ticketing unsubscribe is not a function, skipping');
		}

		// Unsubscribe other subscribers here as needed

		initialized = false;
		
		// Log final state of subscribers
		if (debug) {
			printEventDiagnostics(getSubscribersMap(), 'after-shutdown');
		}
		
		log('success', '[EVENT SYSTEM] Event system shut down successfully.');
	} catch (error) {
		log('error', `[EVENT SYSTEM] Error shutting down event system: ${error.message}`);
		if (debug) {
			console.error(error);
		}
	}
}

/**
 * Diagnose the event system status
 * @returns {Promise<Object>} Diagnostic information
 */
async function diagnoseEventSystem() {
	log('info', '[EVENT SYSTEM] Running event system diagnostics...');
	
	const diagnostic = {
		initialized,
		subscribers: {},
		emittedEvents: [],
		ticketingStatus: null,
		tickingHasUnsubscribe: typeof ticketingUnsubscribe === 'function'
	};
	
	// Get subscriber information
	const subscribersMap = getSubscribersMap();
	Object.values(EVENT_TYPES).forEach(eventType => {
		const subscribers = subscribersMap.get(eventType);
		diagnostic.subscribers[eventType] = subscribers ? subscribers.size : 0;
	});
	
	// Get emitted events
	diagnostic.emittedEvents = getEmittedEvents();
	
	// Get ticketing status
	try {
		diagnostic.ticketingStatus = await checkTicketingStatus();
	} catch (error) {
		diagnostic.ticketingError = error.message;
	}
	
	return diagnostic;
}

export { initializeEventSystem, shutdownEventSystem, diagnoseEventSystem };
