/**
 * debug-ticketing.js
 * Utility script to debug ticketing integration and event system
 */

import { log, findProjectRoot } from '../utils.js';
import { getTicketingIntegrationEnabled } from '../config-manager.js';
import { getTicketingInstance } from './ticketing-factory.js';
import { getSubscribersMap, getEmittedEvents, EVENT_TYPES } from '../events/event-emitter.js';
import { printEventDiagnostics } from '../events/event-debug.js';
import { checkTicketingStatus } from './events/ticketing-event-subscriber.js';
import { initializeTicketingSubscribers } from './events/ticketing-event-subscriber.js';

/**
 * Run a comprehensive diagnostic of the ticketing system
 */
export async function runTicketingDiagnostic() {
    log('info', '======= TASKMASTER TICKETING SYSTEM DIAGNOSTIC =======');
    
    // Check project root and configuration
    try {
        const projectRoot = findProjectRoot();
        log('info', `Project root: ${projectRoot}`);
        
        const ticketingEnabled = getTicketingIntegrationEnabled(projectRoot);
        log('info', `Ticketing integration enabled: ${ticketingEnabled}`);
        
        if (!ticketingEnabled) {
            log('warn', 'Ticketing is disabled. Enable it in your configuration to use ticketing features.');
            return false;
        }
    } catch (error) {
        log('error', `Error finding project configuration: ${error.message}`);
        return false;
    }
    
    // Check ticketing provider
    try {
        log('info', 'Attempting to initialize ticketing provider...');
        const ticketingInstance = await getTicketingInstance();
        
        if (!ticketingInstance) {
            log('error', 'Failed to initialize ticketing provider.');
            return false;
        }
        
        log('info', `Successfully initialized ticketing provider: ${ticketingInstance.constructor.name}`);
    } catch (error) {
        log('error', `Error initializing ticketing provider: ${error.message}`);
        return false;
    }
    
    // Check event system status
    log('info', 'Checking event system status...');
    const subscribersMap = getSubscribersMap();
    printEventDiagnostics(subscribersMap, 'diagnostic');
    
    // If no subscribers, try initializing
    const eventTypes = Object.values(EVENT_TYPES);
    const hasAnySubscribers = eventTypes.some(type => subscribersMap.has(type));
    
    if (!hasAnySubscribers) {
        log('warn', 'No event subscribers found. Attempting to initialize ticketing subscribers...');
        
        try {
            const unsubscribe = await initializeTicketingSubscribers();
            log('info', 'Ticketing subscribers initialized successfully.');
            
            // Check if initialization worked
            const newSubscribersMap = getSubscribersMap();
            printEventDiagnostics(newSubscribersMap, 'after-init');
            
            // Clean up the subscribers we just created for diagnostic purposes
            unsubscribe();
            log('info', 'Cleaned up diagnostic subscribers.');
        } catch (error) {
            log('error', `Error initializing ticketing subscribers: ${error.message}`);
            return false;
        }
    }
    
    // Check recent event emissions
    const recentEvents = getEmittedEvents();
    log('info', `Recent event emissions: ${recentEvents.length}`);
    
    if (recentEvents.length > 0) {
        log('info', 'Recent events:');
        recentEvents.forEach((event, index) => {
            log('info', `  ${index + 1}. ${event.eventType} at ${event.timestamp} (${event.subscriberCount} subscribers)`);
        });
    } else {
        log('info', 'No recent events have been emitted.');
    }
    
    // Get comprehensive ticketing status
    try {
        const status = await checkTicketingStatus();
        log('info', 'Ticketing status summary:');
        log('info', `  Ticketing enabled: ${status.ticketingEnabled}`);
        log('info', `  Project root: ${status.projectRoot}`);
        
        if (status.error) {
            log('error', `  Error: ${status.error}`);
        }
        
        log('info', '  Event subscribers:');
        Object.entries(status.eventSubscribers).forEach(([eventType, count]) => {
            log('info', `    ${eventType}: ${count} subscriber(s)`);
        });
    } catch (error) {
        log('error', `Error checking ticketing status: ${error.message}`);
    }
    
    log('info', '======= END DIAGNOSTIC =======');
    return true;
}

/**
 * Helper to enable ticketing debugging
 */
export function enableTicketingDebugging() {
    process.env.DEBUG_EVENTS = 'true';
    log('info', 'Ticketing debugging enabled. Event system will now log detailed information.');
}

export default {
    runTicketingDiagnostic,
    enableTicketingDebugging
};
