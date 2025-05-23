/**
 * event-emitter.js
 * Simple event emitter for task-master to handle task status changes
 */

// In-memory store of subscribers for different event types
const subscribers = new Map();

/**
 * Subscribe to an event
 * @param {string} eventType - Type of event to subscribe to
 * @param {Function} callback - Function to call when event is emitted
 * @returns {Function} Unsubscribe function
 */
function subscribe(eventType, callback) {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, new Set());
  }
  
  subscribers.get(eventType).add(callback);
  
  // Return unsubscribe function
  return () => {
    const eventSubscribers = subscribers.get(eventType);
    if (eventSubscribers) {
      eventSubscribers.delete(callback);
      
      // Clean up if no subscribers left
      if (eventSubscribers.size === 0) {
        subscribers.delete(eventType);
      }
    }
  };
}

/**
 * Emit an event to all subscribers
 * @param {string} eventType - Type of event to emit
 * @param {any} data - Data to pass to subscribers
 */
function emit(eventType, data) {
  const eventSubscribers = subscribers.get(eventType);
  
  if (eventSubscribers) {
    // Clone the set to avoid issues if subscribers unsubscribe during emit
    [...eventSubscribers].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event subscriber for ${eventType}:`, error);
      }
    });
  }
}

/**
 * Task status event types
 */
const EVENT_TYPES = {
  TASK_CREATED: 'task:created',
  TASK_STATUS_CHANGED: 'task:status:changed',
  TASK_DELETED: 'task:deleted',
  SUBTASK_CREATED: 'subtask:created',
  SUBTASK_STATUS_CHANGED: 'subtask:status:changed',
  SUBTASK_DELETED: 'subtask:deleted'
};

export { subscribe, emit, EVENT_TYPES };
