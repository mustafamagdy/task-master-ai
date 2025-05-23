/**
 * ticketing-event-subscriber.js
 * Handles task status events and updates ticketing systems accordingly
 */

import path from 'path';
import { log } from '../utils.js';
import { getTicketingIntegrationEnabled } from '../config-manager.js';
import { getTicketingInstance } from './ticketing-factory.js';
import { subscribe, EVENT_TYPES } from '../events/event-emitter.js';

/**
 * Initialize ticketing event subscribers
 * @returns {Function} Unsubscribe function to clean up all subscribers
 */
function initializeTicketingSubscribers() {
  // Only subscribe if ticketing integration is enabled
  if (!getTicketingIntegrationEnabled()) {
    log('info', 'Ticketing integration is disabled. Skipping event subscribers.');
    return () => {}; // Return empty unsubscribe function
  }

  log('info', 'Initializing ticketing event subscribers...');
  
  // Keep track of all unsubscribe functions
  const unsubscribeFunctions = [];
  
  // Subscribe to task status changes
  const unsubscribeTaskStatus = subscribe(
    EVENT_TYPES.TASK_STATUS_CHANGED,
    async ({ taskId, newStatus, data, tasksPath }) => {
      try {
        await updateTicketStatus(taskId, newStatus, data, tasksPath);
      } catch (error) {
        log('error', `Error handling task status change event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeTaskStatus);
  
  // Subscribe to subtask status changes
  const unsubscribeSubtaskStatus = subscribe(
    EVENT_TYPES.SUBTASK_STATUS_CHANGED,
    async ({ taskId, subtaskId, newStatus, data, tasksPath }) => {
      try {
        // Import findTaskById to avoid circular dependencies
        const { findTaskById } = await import('../utils.js');
        
        // Find the main task first to get its ticket ID
        const task = findTaskById(data.tasks, taskId);
        if (!task) {
          log('warn', `Task ${taskId} not found for subtask ${subtaskId}. Skipping ticketing update.`);
          return;
        }
        
        // Find the subtask
        const subtask = task.subtasks?.find(st => st.id === subtaskId);
        if (!subtask) {
          log('warn', `Subtask ${subtaskId} not found in task ${taskId}. Skipping ticketing update.`);
          return;
        }
        
        // Get ticketing instance
        const ticketing = await getTicketingInstance('jira');
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping update.');
          return;
        }
        
        // Get the ticket ID from the subtask metadata
        const subtaskTicketId = ticketing.getTicketId(subtask);
        if (!subtaskTicketId) {
          log('info', `No ticketing system issue found for subtask ${subtaskId}. Skipping status update.`);
          return;
        }
        
        // Update the ticket status
        log('info', `Updating ticketing system issue ${subtaskTicketId} status for subtask ${subtaskId}...`);
        const success = await ticketing.updateTicketStatus(
          subtaskTicketId,
          newStatus,
          null,
          subtask
        );
        
        if (success) {
          log('success', `Updated ticketing system issue ${subtaskTicketId} status for subtask ${subtaskId}`);
        } else {
          log('warn', `Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${subtaskId}`);
        }
      } catch (error) {
        log('error', `Error handling subtask status change event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeSubtaskStatus);
  
  // Subscribe to task creation
  const unsubscribeTaskCreated = subscribe(
    EVENT_TYPES.TASK_CREATED,
    async ({ taskId, data, tasksPath, task }) => {
      try {
        // Import required modules dynamically to avoid circular dependencies
        const { getTicketingSystemEnabled } = await import('../config-manager.js');
        const { isTicketingSystemConfigured } = await import('./ticketing-interface.js');
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        const { generateUserStoryRefId, storeRefId } = await import('./utils/id-utils.js');
        const { writeJSON } = await import('../utils.js');
        
        // Check if ticketing system integration is enabled and configured
        const projectRoot = tasksPath ? path.dirname(tasksPath) : null;
        const ticketingEnabled = getTicketingSystemEnabled(projectRoot);
        
        if (!ticketingEnabled) {
          log('info', 'Ticketing integration is disabled. Skipping ticket creation.');
          return;
        }
        
        // Then check if properly configured
        const isConfigured = await isTicketingSystemConfigured(projectRoot);
        if (!isConfigured) {
          log('info', 'Ticketing system is not configured. Skipping ticket creation.');
          return;
        }
        
        log('info', 'Creating user story in ticketing system for new task...');
        
        // Get the task to create a ticket for
        if (!task) {
          log('warn', `Task object not found in event data. Skipping ticket creation.`);
          return;
        }
        
        // Ensure the task has a valid reference ID before creating a ticket
        let updatedTask = { ...task };
        if (!updatedTask.metadata?.refId) {
          log('info', 'Task is missing a reference ID. Attempting to generate one...');
          try {
            const refId = await generateUserStoryRefId(taskId, projectRoot);
            if (refId) {
              updatedTask = storeRefId(updatedTask, refId);
              log('info', `Generated and stored reference ID ${refId} in task metadata`);
              
              // Update the task in the data
              const taskIndex = data.tasks.findIndex(t => t.id === parseInt(taskId, 10));
              if (taskIndex !== -1) {
                data.tasks[taskIndex] = updatedTask;
                // Write changes back to file
                writeJSON(tasksPath, data);
              }
            } else {
              log('warn', 'Could not generate a reference ID for the task');
            }
          } catch (error) {
            log('error', `Error generating reference ID: ${error.message}`);
          }
        }
        
        try {
          // Create user story in ticketing system
          const ticketingInstance = await getTicketingInstance(null, projectRoot);
          if (!ticketingInstance) {
            throw new Error('No ticketing system configured');
          }
          
          // Create a task representation that matches what the ticketing system expects
          const ticketData = {
            id: updatedTask.id,
            title: updatedTask.title,
            description: updatedTask.description,
            details: updatedTask.details,
            priority: updatedTask.priority,
            status: updatedTask.status,
            metadata: updatedTask.metadata
          };
          
          const ticketingIssue = await ticketingInstance.createStory(ticketData, projectRoot);
          log('debug', `Ticket creation result: ${JSON.stringify(ticketingIssue)}`);
          
          if (ticketingIssue && ticketingIssue.key) {
            // Store ticketing issue key in task metadata
            log('debug', `Storing ticket key ${ticketingIssue.key} in task metadata`);
            
            // Make sure task has metadata object
            if (!updatedTask.metadata) {
              updatedTask.metadata = {};
            }
            
            // Directly store the Jira key in metadata
            updatedTask.metadata.jiraKey = ticketingIssue.key;
            
            // Also use the ticketing system's method if available
            if (typeof ticketingInstance.storeTicketId === 'function') {
              updatedTask = ticketingInstance.storeTicketId(updatedTask, ticketingIssue.key);
            }
            
            // Update the task in the data
            const taskIndex = data.tasks.findIndex(t => t.id === parseInt(taskId, 10));
            if (taskIndex !== -1) {
              data.tasks[taskIndex] = updatedTask;
              // Write changes back to file
              writeJSON(tasksPath, data);
            }
            
            log('success', `Created ticketing user story: ${ticketingIssue.key}`);
          } else {
            log('warn', 'Failed to create ticketing user story');
          }
        } catch (ticketingError) {
          log('error', `Error creating ticketing user story: ${ticketingError.message}`);
        }
      } catch (error) {
        log('error', `Error handling task created event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeTaskCreated);

  // Subscribe to task deletion
  const unsubscribeTaskDeleted = subscribe(
    EVENT_TYPES.TASK_DELETED,
    async ({ taskId, task, data, tasksPath }) => {
      try {
        // Get ticketing instance
        const ticketing = await getTicketingInstance('jira');
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping deletion update.');
          return;
        }
        
        // If the task had a ticket ID, update it or mark it as deleted in the ticketing system
        const ticketId = task && ticketing.getTicketId(task);
        if (ticketId) {
          log('info', `Task ${taskId} with ticket ${ticketId} was deleted. Updating ticketing system...`);
          
          // Here you would add code to update the ticket in your ticketing system
          // For example, marking it as "Cancelled" or "Deleted" status
          // This depends on your ticketing system's API and available statuses
          const success = await ticketing.updateTicketStatus(
            ticketId,
            'cancelled', // Or whatever status makes sense for deleted tasks
            null,
            task
          );
          
          if (success) {
            log('success', `Updated ticketing system issue ${ticketId} for deleted task ${taskId}`);
          } else {
            log('warn', `Failed to update ticketing system issue ${ticketId} for deleted task ${taskId}`);
          }
        } else {
          log('info', `No ticketing system issue found for deleted task ${taskId}. No action needed.`);
        }
      } catch (error) {
        log('error', `Error handling task deleted event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeTaskDeleted);

  // Return a single unsubscribe function that calls all others
  return () => {
    unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    log('info', 'Ticketing event subscribers cleaned up.');
  };
}

/**
 * Update a task status in the connected ticketing system
 * @param {string} taskId - Task ID to update
 * @param {string} newStatus - New status
 * @param {Object} data - Tasks data object
 * @param {string} tasksPath - Path to tasks.json file
 */
async function updateTicketStatus(taskId, newStatus, data, tasksPath) {
  try {
    // Import findTaskById to avoid circular dependencies
    const { findTaskById } = await import('../utils.js');
    
    // Find the task by ID
    const task = findTaskById(data.tasks, taskId);
    if (!task) {
      log('warn', `Task ${taskId} not found. Skipping ticketing system update.`);
      return;
    }

    // Get the ticketing system instance
    const ticketing = await getTicketingInstance('jira');
    if (!ticketing) {
      log('warn', 'No ticketing system available. Skipping update.');
      return;
    }

    // Check if the task has a ticket ID in its metadata
    const ticketId = ticketing.getTicketId(task);
    if (ticketId) {
      log('info', `Updating ticketing system issue ${ticketId} status to ${newStatus}...`);

      // Update the ticket status
      const success = await ticketing.updateTicketStatus(
        ticketId,
        newStatus,
        null,
        task
      );
      
      if (success) {
        log('success', `Updated ticketing system issue ${ticketId} status for task ${taskId}`);
      } else {
        log('warn', `Failed to update ticketing system issue ${ticketId} status for task ${taskId}`);
      }
    } else {
      log('info', `No ticketing system issue found for task ${taskId}. Skipping status update.`);
    }

    // Update subtasks if they exist
    if (task.subtasks && task.subtasks.length > 0) {
      for (const subtask of task.subtasks) {
        const subtaskTicketId = ticketing.getTicketId(subtask);
        if (subtaskTicketId) {
          log('info', `Updating ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}...`);
          try {
            const subtaskSuccess = await ticketing.updateTicketStatus(
              subtaskTicketId,
              newStatus,
              null,
              subtask
            );

            if (subtaskSuccess) {
              log('success', `Updated ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`);
            } else {
              log('warn', `Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`);
            }
          } catch (ticketError) {
            log('error', `Error updating ticketing system issue status for subtask ${subtask.id}: ${ticketError.message}`);
          }
        } else {
          log('info', `No ticketing system issue found for subtask ${subtask.id}. Skipping status update.`);
        }
      }
    }
  } catch (error) {
    log('error', `Error updating ticketing system status: ${error.message}`);
  }
}

export { initializeTicketingSubscribers, updateTicketStatus };
