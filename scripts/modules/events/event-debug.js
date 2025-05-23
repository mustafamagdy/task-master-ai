/**
 * event-debug.js
 * Debug utilities for troubleshooting the event system
 */

import { log } from '../utils.js';
import { EVENT_TYPES } from './event-emitter.js';

// Store a reference to the subscribers Map when inspecting
let subscribersSnapshot = null;

/**
 * Print event system diagnostics
 * @param {Map} subscribers - The subscribers Map from event-emitter
 * @param {string} location - Where the diagnostics are being printed from
 */
export function printEventDiagnostics(subscribers, location = 'unknown') {
    subscribersSnapshot = subscribers;
    const eventTypes = Object.values(EVENT_TYPES);
    
    log('debug', `====== EVENT SYSTEM DIAGNOSTICS (${location}) ======`);
    log('debug', `Total registered event types: ${subscribers.size}`);
    
    // Log all registered event types
    log('debug', 'Registered event types:');
    if (subscribers.size === 0) {
        log('debug', '  - NONE');
    } else {
        [...subscribers.keys()].forEach(eventType => {
            const count = subscribers.get(eventType).size;
            log('debug', `  - ${eventType}: ${count} subscriber(s)`);
        });
    }
    
    // Check for unregistered event types
    const unregisteredEvents = eventTypes.filter(type => !subscribers.has(type));
    if (unregisteredEvents.length > 0) {
        log('debug', 'Unregistered event types:');
        unregisteredEvents.forEach(eventType => {
            log('debug', `  - ${eventType}`);
        });
    }
    
    log('debug', '==============================================');
}

/**
 * Get a summary of event registrations
 * @returns {string} A summary of event registrations
 */
export function getEventRegistrationSummary() {
    if (!subscribersSnapshot) {
        return 'No event system snapshot available. Call printEventDiagnostics first.';
    }
    
    const summary = [];
    summary.push(`Total registered event types: ${subscribersSnapshot.size}`);
    
    const eventTypeStats = [...subscribersSnapshot.entries()]
        .map(([type, subscribers]) => `${type}: ${subscribers.size} listener(s)`)
        .join(', ');
    
    summary.push(`Registered events: ${eventTypeStats || 'none'}`);
    
    return summary.join('\n');
}

export default {
    printEventDiagnostics,
    getEventRegistrationSummary
};
