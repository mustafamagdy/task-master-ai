/**
 * ticketing-event-subscriber.js
 * Handles task status events and updates ticketing systems accordingly
 */

import path from 'path';
import { log, findProjectRoot } from '../../utils.js';
import { subscribe, getSubscribersMap, EVENT_TYPES } from '../../events/event-emitter.js';
import { getTicketingIntegrationEnabled } from '../../config-manager.js';
import { printEventDiagnostics } from '../../events/event-debug.js';

// Import individual event handlers
import { subscribeToTaskStatus } from './task-status-handler.js';
import { subscribeToSubtaskStatus } from './subtask-status-handler.js';
import { subscribeToTaskCreation } from './task-creation-handler.js';
import { subscribeToSubtaskCreation } from './subtask-creation-handler.js';
import { subscribeToTaskDeletion } from './task-deletion-handler.js';
import { subscribeToSubtaskDeletion } from './subtask-deletion-handler.js';
import { subscribeToTaskUpdate } from './task-update-handler.js';
import { subscribeToSubtaskUpdate } from './subtask-update-handler.js';

/**
 * Initialize ticketing event subscribers
 * @returns {Promise<Function>} Unsubscribe function to clean up all subscribers
 */
async function initializeTicketingSubscribers() {
	log('debug', '[TICKETING] Starting initialization of ticketing event subscribers');
	
	// Log before any subscribers are added
	printEventDiagnostics(getSubscribersMap(), 'before-ticketing-init');
	
	let ticketingEnabled = false;
	
	try {
		// Use static imports now
		const projectRoot = findProjectRoot();
		log('debug', `[TICKETING] Project root identified: ${projectRoot}`);

		// Only subscribe if ticketing integration is enabled - explicitly pass project root
		ticketingEnabled = getTicketingIntegrationEnabled(projectRoot);
		log('debug', `[TICKETING] Ticketing integration enabled: ${ticketingEnabled}`);
		
		// DEBUG: Log more details about ticketing configuration
		log('debug', `[TICKETING-DEBUG] Project root path: ${projectRoot}`);
		log('debug', `[TICKETING-DEBUG] Configuration check result: ${ticketingEnabled}`);
		try {
			const configPath = path.join(projectRoot, '.taskmaster', 'config.json');
			log('debug', `[TICKETING-DEBUG] Checking for config file at: ${configPath}`);
			// Don't import the file here, just log if it exists
			const fs = await import('fs/promises');
			const configExists = await fs.access(configPath).then(() => true).catch(() => false);
			log('debug', `[TICKETING-DEBUG] Config file exists: ${configExists}`);
		
		} catch (configCheckError) {
			log('error', `[TICKETING-DEBUG] Error checking config file: ${configCheckError.message}`);
			console.error('[TICKETING-DEBUG] Full config check error:', configCheckError);
		}
		
		if (!ticketingEnabled) {
			log(
				'info',
				'Ticketing integration is disabled. Skipping event subscribers.'
			);
			return () => {
				log('debug', '[TICKETING] No-op unsubscribe function called (ticketing was disabled)');
			}; // Return empty unsubscribe function
		}
	} catch (error) {
		log(
			'error',
			`Error checking ticketing integration status: ${error.message}`
		);
		console.error('Full error:', error); // Log the full error for debugging
		return () => {
			log('debug', '[TICKETING] No-op unsubscribe function called (after error)');
		}; // Return empty unsubscribe function on error
	}
	
	log('info', '[TICKETING] Registering ticketing event subscribers');

	// Keep track of all unsubscribe functions
	const unsubscribeFunctions = [];

	// Helper function to handle subscription and error handling
	const safeSubscribe = (name, subscribeFn) => {
		// DEBUG: Log before attempting to subscribe
		log('debug', `[TICKETING-DEBUG] About to subscribe to ${name} event`);
		try {
			log('debug', `[TICKETING] Subscribing to ${name}`);
			const unsubscribe = subscribeFn(subscribe);
			if (typeof unsubscribe !== 'function') {
				log('warn', `[TICKETING] Expected function from ${name}, got ${typeof unsubscribe}`);
				return () => {};
			}
			log('debug', `[TICKETING] Successfully subscribed to ${name}`);
			// DEBUG: Log subscription success with more details
			log('debug', `[TICKETING-DEBUG] Subscription to ${name} successful, unsubscribe function type: ${typeof unsubscribe}`);
			return unsubscribe;
		} catch (error) {
			log('error', `Error subscribing to ${name}: ${error.message}`);
			console.error(`Full error in ${name}:`, error); // Log the full error
			return () => {};
		}
	};

	// Subscribe to all events with better error handling
	unsubscribeFunctions.push(safeSubscribe('task status', subscribeToTaskStatus));
	unsubscribeFunctions.push(safeSubscribe('subtask status', subscribeToSubtaskStatus));
	unsubscribeFunctions.push(safeSubscribe('task creation', subscribeToTaskCreation));
	unsubscribeFunctions.push(safeSubscribe('subtask creation', subscribeToSubtaskCreation));
	unsubscribeFunctions.push(safeSubscribe('task deletion', subscribeToTaskDeletion));
	unsubscribeFunctions.push(safeSubscribe('subtask deletion', subscribeToSubtaskDeletion));
	unsubscribeFunctions.push(safeSubscribe('task update', subscribeToTaskUpdate));
	unsubscribeFunctions.push(safeSubscribe('subtask update', subscribeToSubtaskUpdate));

	// Log after all subscribers are added
	log('info', '[TICKETING] All ticketing event subscribers registered successfully');
	log('debug', '[TICKETING-DEBUG] Event subscribers registered: ' + unsubscribeFunctions.length);
	printEventDiagnostics(getSubscribersMap(), 'after-ticketing-init');

	// Return unsubscribe function that will clean up all event listeners
	return () => {
		log('debug', '[TICKETING] Unsubscribing all ticketing event subscribers');
		unsubscribeFunctions.forEach((unsubscribe, index) => {
			try {
				if (typeof unsubscribe === 'function') {
					unsubscribe();
					log('debug', `[TICKETING] Successfully unsubscribed function ${index+1}`);
				} else {
					log('warn', `[TICKETING] Unsubscribe function ${index+1} is not a function`);
				}
			} catch (error) {
				log('error', `Error during event unsubscribe ${index+1}: ${error.message}`);
				console.error(`Full unsubscribe error ${index+1}:`, error);
			}
		});
		log('debug', '[TICKETING] All ticketing event subscribers unsubscribed');
	};
}

/**
 * Check if ticketing integration is properly initialized
 * This is helpful for debugging the event system
 * @returns {Promise<Object>} Status information about the ticketing integration
 */
async function checkTicketingStatus() {
	const status = {
		ticketingEnabled: false,
		eventSubscribers: {},
		projectRoot: null,
		error: null
	};
	
	try {
		status.projectRoot = findProjectRoot();
		status.ticketingEnabled = getTicketingIntegrationEnabled(status.projectRoot);
		
		// Check event subscribers
		const subscribers = getSubscribersMap();
		Object.values(EVENT_TYPES).forEach(eventType => {
			const eventSubscribers = subscribers.get(eventType);
			status.eventSubscribers[eventType] = eventSubscribers ? eventSubscribers.size : 0;
		});
		
		return status;
	} catch (error) {
		status.error = error.message;
		return status;
	}
}

export { initializeTicketingSubscribers, checkTicketingStatus };