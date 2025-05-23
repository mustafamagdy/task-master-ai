/**
 * event-emitter.js
 * Simple event emitter for task-master to handle task status changes
 */

import { log } from '../utils.js';

// In-memory store of subscribers for different event types
const subscribers = new Map();

// Tracking emitted events for debugging
const emittedEvents = [];
const DEBUG_EVENTS = process.env.DEBUG_EVENTS === 'true' || process.env.DEBUG === 'true';

/**
 * Subscribe to an event
 * @param {string} eventType - Type of event to subscribe to
 * @param {Function} callback - Function to call when event is emitted
 * @returns {Function} Unsubscribe function
 */
function subscribe(eventType, callback) {
	if (DEBUG_EVENTS) {
		log('debug', `[EVENT] Subscribing to event: ${eventType}`);
	}

	if (!subscribers.has(eventType)) {
		subscribers.set(eventType, new Set());
		if (DEBUG_EVENTS) {
			log('debug', `[EVENT] Created new subscriber set for: ${eventType}`);
		}
	}

	subscribers.get(eventType).add(callback);
	const subscriberCount = subscribers.get(eventType).size;
	if (DEBUG_EVENTS) {
		log('debug', `[EVENT] Now ${subscriberCount} subscriber(s) for ${eventType}`);
	}

	// Return unsubscribe function
	return () => {
		if (DEBUG_EVENTS) {
			log('debug', `[EVENT] Unsubscribing from event: ${eventType}`);
		}

		const eventSubscribers = subscribers.get(eventType);
		if (eventSubscribers) {
			eventSubscribers.delete(callback);
			if (DEBUG_EVENTS) {
				log('debug', `[EVENT] Now ${eventSubscribers.size} subscriber(s) for ${eventType}`);
			}

			// Clean up if no subscribers left
			if (eventSubscribers.size === 0) {
				subscribers.delete(eventType);
				if (DEBUG_EVENTS) {
					log('debug', `[EVENT] Removed empty subscriber set for: ${eventType}`);
				}
			}
		}
	};
}

/**
 * Emit an event to all subscribers
 * @param {string} eventType - Type of event to emit
 * @param {any} data - Data to pass to subscribers
 * @returns {boolean} Whether the event had any subscribers
 */
function emit(eventType, data) {
	const eventSubscribers = subscribers.get(eventType);
	const timestamp = new Date().toISOString();
	const subscriberCount = eventSubscribers ? eventSubscribers.size : 0;

	// Track this event for debugging
	emittedEvents.push({
		timestamp,
		eventType,
		subscriberCount,
		dataSnapshot: DEBUG_EVENTS ? JSON.stringify(data).substring(0, 100) : null
	});

	// Keep emittedEvents from growing too large
	if (emittedEvents.length > 100) {
		emittedEvents.shift();
	}

	if (DEBUG_EVENTS) {
		log('debug', `[EVENT] Emitting ${eventType} with ${subscriberCount} subscriber(s)`);
		if (data && data.taskId) {
			log('debug', `[EVENT] Task ID: ${data.taskId}`);
		}
	}

	if (!eventSubscribers || eventSubscribers.size === 0) {
		if (DEBUG_EVENTS) {
			log('debug', `[EVENT] No subscribers for ${eventType}`);
		}
		return false;
	}

	// Clone the set to avoid issues if subscribers unsubscribe during emit
	[...eventSubscribers].forEach((callback) => {
		try {
			if (DEBUG_EVENTS) {
				log('debug', `[EVENT] Calling subscriber for ${eventType}`);
			}
			callback(data);
			if (DEBUG_EVENTS) {
				log('debug', `[EVENT] Subscriber for ${eventType} completed`);
			}
		} catch (error) {
			log('error', `Error in event subscriber for ${eventType}: ${error.message}`);
			if (DEBUG_EVENTS) {
				console.error(error); // Log the full error in debug mode
			}
		}
	});

	return true;
}

/**
 * Task status event types
 */
const EVENT_TYPES = {
	TASK_CREATED: 'task:created',
	TASK_UPDATED: 'task:updated',
	TASK_STATUS_CHANGED: 'task:status:changed',
	TASK_DELETED: 'task:deleted',
	SUBTASK_CREATED: 'subtask:created',
	SUBTASK_UPDATED: 'subtask:updated',
	SUBTASK_STATUS_CHANGED: 'subtask:status:changed',
	SUBTASK_DELETED: 'subtask:deleted'
};

/**
 * Get the current subscribers map for debugging
 * @returns {Map} The current subscribers map
 */
function getSubscribersMap() {
	return subscribers;
}

/**
 * Get event emission history for debugging
 * @returns {Array} Recent event emission history
 */
function getEmittedEvents() {
	return [...emittedEvents];
}

/**
 * Check if an event type has any subscribers
 * @param {string} eventType - Event type to check
 * @returns {boolean} Whether the event type has subscribers
 */
function hasSubscribers(eventType) {
	const eventSubscribers = subscribers.get(eventType);
	return eventSubscribers ? eventSubscribers.size > 0 : false;
}

export { subscribe, emit, EVENT_TYPES, getSubscribersMap, getEmittedEvents, hasSubscribers };
