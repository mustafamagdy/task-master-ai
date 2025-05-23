#!/usr/bin/env node
/**
 * debug-events.js
 * CLI script to debug the event system and ticketing integration
 */

import { enableTicketingDebugging, runTicketingDiagnostic } from './modules/ticketing/debug-ticketing.js';
import { getEmittedEvents, getSubscribersMap } from './modules/events/event-emitter.js';
import { printEventDiagnostics } from './modules/events/event-debug.js';
import { log } from './modules/utils.js';

// Enable event debugging
enableTicketingDebugging();

// Run diagnostics
(async () => {
    log('info', 'Starting event system diagnostic...');
    
    try {
        // Print current state of event system
        const subscribersMap = getSubscribersMap();
        printEventDiagnostics(subscribersMap, 'startup');
        
        // Run ticketing diagnostic
        const result = await runTicketingDiagnostic();
        
        if (result) {
            log('success', 'Ticketing diagnostic completed successfully.');
        } else {
            log('warn', 'Ticketing diagnostic found issues.');
        }
        
        // Check event emissions
        const emittedEvents = getEmittedEvents();
        log('info', `Total events emitted: ${emittedEvents.length}`);
        
        // Final advice
        log('info', '\nNext steps:');
        log('info', '1. Check if ticketing integration is enabled in your configuration');
        log('info', '2. Verify that ticketing subscribers are being initialized before events are emitted');
        log('info', '3. Ensure your ticketing provider is properly configured');
        log('info', '4. Set DEBUG_EVENTS=true in your environment to enable detailed event logging');
        log('info', '5. Look for any error messages in the diagnostic output');
    } catch (error) {
        log('error', `Error running diagnostic: ${error.message}`);
        console.error(error);
    }
})();
