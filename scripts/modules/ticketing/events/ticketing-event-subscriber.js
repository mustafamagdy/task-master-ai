/**
 * ticketing-event-subscriber.js
 * Handles task status events and updates ticketing systems accordingly
 */

import path from 'path';
import { log, findProjectRoot } from '../../utils.js';
import { subscribe } from '../../events/event-emitter.js';
import { getTicketingIntegrationEnabled } from '../../config-manager.js';

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
 * @returns {Function} Unsubscribe function to clean up all subscribers
 */
async function initializeTicketingSubscribers() {
	try {
		// Use static imports now
		const projectRoot = findProjectRoot();

		// Only subscribe if ticketing integration is enabled - explicitly pass project root
		if (!getTicketingIntegrationEnabled(projectRoot)) {
			log(
				'info',
				'Ticketing integration is disabled. Skipping event subscribers.'
			);
			return () => {}; // Return empty unsubscribe function
		}
	} catch (error) {
		log(
			'error',
			`Error checking ticketing integration status: ${error.message}`
		);
		return () => {}; // Return empty unsubscribe function on error
	}

	// Keep track of all unsubscribe functions
	const unsubscribeFunctions = [];

	// Subscribe to all events
	unsubscribeFunctions.push(subscribeToTaskStatus(subscribe));
	unsubscribeFunctions.push(subscribeToSubtaskStatus(subscribe));
	unsubscribeFunctions.push(subscribeToTaskCreation(subscribe));
	unsubscribeFunctions.push(subscribeToSubtaskCreation(subscribe));
	unsubscribeFunctions.push(subscribeToTaskDeletion(subscribe));
	unsubscribeFunctions.push(subscribeToSubtaskDeletion(subscribe));
	unsubscribeFunctions.push(subscribeToTaskUpdate(subscribe));
	unsubscribeFunctions.push(subscribeToSubtaskUpdate(subscribe));

	// Return unsubscribe function that will clean up all event listeners
	return () => {
		unsubscribeFunctions.forEach((unsubscribe) => {
			try {
				if (typeof unsubscribe === 'function') {
					unsubscribe();
				}
			} catch (error) {
				log('error', `Error during event unsubscribe: ${error.message}`);
			}
		});
	};
}

export { initializeTicketingSubscribers };