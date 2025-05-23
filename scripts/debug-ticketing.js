#!/usr/bin/env node
/**
 * debug-ticketing.js
 * CLI script to debug and fix the ticketing event system
 */

import { log } from './modules/utils.js';
import { diagnoseEventSystem, initializeEventSystem, shutdownEventSystem } from './modules/events/initialize-events.js';
import { enableTicketingDebugging, runTicketingDiagnostic } from './modules/ticketing/debug-ticketing.js';
import chalk from 'chalk';
import boxen from 'boxen';

// Start with a banner
console.log(chalk.cyan.bold('='.repeat(60)));
console.log(chalk.cyan.bold('TASKMASTER TICKETING EVENT SYSTEM DIAGNOSTIC TOOL'));
console.log(chalk.cyan.bold('='.repeat(60)));
console.log('');

// Enable debugging
log('info', 'Enabling debug mode for event system...');
process.env.DEBUG_EVENTS = 'true';
process.env.DEBUG = 'true';

// Run diagnostics and fix
(async () => {
    try {
        log('info', 'Step 1: Checking current event system status...');
        const initialDiagnostic = await diagnoseEventSystem();
        
        const hasSubscribers = Object.values(initialDiagnostic.subscribers).some(count => count > 0);
        
        if (initialDiagnostic.initialized && hasSubscribers) {
            log('info', 'Event system is already initialized with subscribers.');
            
            // Print subscriber counts
            console.log(chalk.yellow('\nCurrent event subscribers:'));
            Object.entries(initialDiagnostic.subscribers).forEach(([eventType, count]) => {
                console.log(`  ${eventType}: ${count} subscriber(s)`);
            });
        } else {
            log('warn', 'Event system is not initialized or has no subscribers.');
        }
        
        log('info', '\nStep 2: Running ticketing diagnostic...');
        await runTicketingDiagnostic();
        
        log('info', '\nStep 3: Reinitializing event system...');
        
        // If already initialized, shut it down first
        if (initialDiagnostic.initialized) {
            log('info', 'Shutting down existing event system...');
            await shutdownEventSystem({ debug: true });
        }
        
        // Initialize with debug mode and force option
        const initResult = await initializeEventSystem({ debug: true, force: true });
        
        if (initResult) {
            log('success', 'Event system reinitialized successfully.');
        } else {
            log('error', 'Failed to reinitialize event system.');
        }
        
        // Get updated status
        log('info', '\nStep 4: Checking updated event system status...');
        const updatedDiagnostic = await diagnoseEventSystem();
        
        const hasUpdatedSubscribers = Object.values(updatedDiagnostic.subscribers).some(count => count > 0);
        
        if (updatedDiagnostic.initialized && hasUpdatedSubscribers) {
            log('success', 'Event system is now properly initialized with subscribers.');
            
            // Print subscriber counts
            console.log(chalk.green('\nUpdated event subscribers:'));
            Object.entries(updatedDiagnostic.subscribers).forEach(([eventType, count]) => {
                console.log(`  ${eventType}: ${count} subscriber(s)`);
            });
            
            console.log(boxen(
                chalk.green.bold('TICKETING EVENT SYSTEM FIXED!') + '\n\n' +
                chalk.white('The event system has been successfully reinitialized.\n') +
                chalk.white('Ticketing integration should now work correctly when adding tasks.\n\n') +
                chalk.yellow('Try creating a new task to verify the fix:') + '\n' +
                chalk.cyan('task-master add "Test task to verify ticketing"'),
                { padding: 1, margin: 1, borderColor: 'green', borderStyle: 'round' }
            ));
        } else {
            log('error', 'Event system still has issues after reinitialization.');
            
            console.log(boxen(
                chalk.red.bold('TICKETING EVENT SYSTEM ISSUES PERSIST') + '\n\n' +
                chalk.white('Potential causes:') + '\n' +
                chalk.white('1. Ticketing integration may be disabled in your configuration') + '\n' +
                chalk.white('2. There might be an issue with your ticketing provider configuration') + '\n' +
                chalk.white('3. The event handler code might have errors') + '\n\n' +
                chalk.yellow('Check your configuration and logs for more details.'),
                { padding: 1, margin: 1, borderColor: 'red', borderStyle: 'round' }
            ));
        }
        
        // Clean shutdown
        log('info', '\nStep 5: Shutting down diagnostic session...');
        await shutdownEventSystem({ debug: true });
        
        log('info', 'Diagnostic complete.');
    } catch (error) {
        log('error', `Error during diagnostic: ${error.message}`);
        console.error(error);
    }
})();
