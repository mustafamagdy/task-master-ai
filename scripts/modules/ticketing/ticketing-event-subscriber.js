/**
 * ticketing-event-subscriber.js
 * Handles task status events and updates ticketing systems accordingly
 */

import path from 'path';
import { log } from '../utils.js';
import { subscribe, EVENT_TYPES } from '../events/event-emitter.js';

/**
 * Initialize ticketing event subscribers
 * @returns {Function} Unsubscribe function to clean up all subscribers
 */
async function initializeTicketingSubscribers() {
  try {
    // Dynamically import the configuration functions to avoid circular dependencies
    const { getTicketingIntegrationEnabled } = await import('../config-manager.js');
    
    // Only subscribe if ticketing integration is enabled
    if (!getTicketingIntegrationEnabled()) {
      log('info', 'Ticketing integration is disabled. Skipping event subscribers.');
      return () => {}; // Return empty unsubscribe function
    }
  } catch (error) {
    log('error', `Error checking ticketing integration status: ${error.message}`);
    return () => {}; // Return empty unsubscribe function on error
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
        // Import required modules dynamically to avoid circular dependencies
        const { findTaskById } = await import('../utils.js');
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        
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
  
  // Subscribe to task creation events
  const unsubscribeTaskCreation = subscribe(
    EVENT_TYPES.TASK_CREATED,
    async ({ taskId, data, tasksPath, task }) => {
      try {
        // Only proceed with task if it was provided directly
        if (!task) {
          // Import findTaskById to avoid circular dependencies
          const { findTaskById } = await import('../utils.js');
          
          // Find the task by ID
          task = findTaskById(data.tasks, taskId);
          if (!task) {
            log('warn', `Task ${taskId} not found. Skipping ticket creation.`);
            return;
          }
        }

        const projectRoot = path.dirname(tasksPath);
        
        // Get all required modules dynamically to avoid circular dependencies
        const { getTicketingSystemEnabled } = await import('../config-manager.js');
        const { isTicketingSystemConfigured } = await import('./ticketing-interface.js');
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        const { generateUserStoryRefId, storeRefId } = await import('./utils/id-utils.js');
        const { writeJSON } = await import('../utils.js');
        
        try {
          const ticketingEnabled = getTicketingSystemEnabled(projectRoot);
          
          if (!ticketingEnabled) {
            log('info', 'Ticketing system is not enabled. Skipping ticket creation.');
            return;
          }
        } catch (configError) {
          log('error', `Error checking ticketing system configuration: ${configError.message}`);
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
  unsubscribeFunctions.push(unsubscribeTaskCreation);

  // Subscribe to subtask creation events
  const unsubscribeSubtaskCreation = subscribe(
    EVENT_TYPES.SUBTASK_CREATED,
    async ({ taskId, subtaskId, subtask, data, tasksPath }) => {
      try {
        // Import required modules dynamically to avoid circular dependencies
        const { findTaskById } = await import('../utils.js');
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        const { writeJSON } = await import('../utils.js');
        
        // Find the parent task first
        const parentTask = findTaskById(data.tasks, taskId);
        if (!parentTask) {
          log('warn', `Parent task ${taskId} not found for subtask ${subtaskId}. Skipping ticket creation.`);
          return;
        }
        
        // Ensure subtask is provided or found
        let subtaskObj = subtask;
        if (!subtaskObj) {
          // Find the subtask within the parent task
          subtaskObj = parentTask.subtasks?.find(st => st.id === subtaskId);
          if (!subtaskObj) {
            log('warn', `Subtask ${subtaskId} not found in task ${taskId}. Skipping ticket creation.`);
            return;
          }
        }
        
        const projectRoot = path.dirname(tasksPath);
        
        // Check if ticketing is enabled
        const { getTicketingSystemEnabled } = await import('../config-manager.js');
        
        try {
          const ticketingEnabled = getTicketingSystemEnabled(projectRoot);
          
          if (!ticketingEnabled) {
            log('info', 'Ticketing system is not enabled. Skipping subtask ticket creation.');
            return;
          }
        } catch (configError) {
          log('error', `Error checking ticketing system configuration: ${configError.message}`);
          return;
        }
        
        // Get parent task ticket ID
        const ticketingInstance = await getTicketingInstance(null, projectRoot);
        if (!ticketingInstance) {
          log('warn', 'No ticketing system available. Skipping subtask ticket creation.');
          return;
        }
        
        const parentTicketId = ticketingInstance.getTicketId(parentTask);
        if (!parentTicketId) {
          log('warn', `No ticket ID found for parent task ${taskId}. Skipping subtask ticket creation.`);
          return;
        }
        
        // Create a subtask representation for the ticketing system
        const subtaskData = {
          id: subtaskId,
          parentId: taskId,
          title: subtaskObj.title,
          description: subtaskObj.description || '',
          status: subtaskObj.status || 'pending',
          parentTicketId
        };
        
        // Create the subtask in the ticketing system
        try {
          const ticketingIssue = await ticketingInstance.createSubtask(subtaskData, projectRoot);
          log('debug', `Subtask ticket creation result: ${JSON.stringify(ticketingIssue)}`);
          
          if (ticketingIssue && ticketingIssue.key) {
            // Store ticketing issue key in subtask metadata
            log('debug', `Storing ticket key ${ticketingIssue.key} in subtask metadata`);
            
            // Make sure subtask has metadata object
            if (!subtaskObj.metadata) {
              subtaskObj.metadata = {};
            }
            
            // Store the ticketing key in metadata
            subtaskObj.metadata.jiraKey = ticketingIssue.key;
            
            // Also use the ticketing system's method if available
            if (typeof ticketingInstance.storeTicketId === 'function') {
              subtaskObj = ticketingInstance.storeTicketId(subtaskObj, ticketingIssue.key);
            }
            
            // Update the subtask in the parent task
            const subtaskIndex = parentTask.subtasks.findIndex(st => st.id === subtaskId);
            if (subtaskIndex !== -1) {
              parentTask.subtasks[subtaskIndex] = subtaskObj;
              
              // Update the parent task in the data
              const taskIndex = data.tasks.findIndex(t => t.id === taskId);
              if (taskIndex !== -1) {
                data.tasks[taskIndex] = parentTask;
                // Write changes back to file
                writeJSON(tasksPath, data);
              }
            }
            
            log('success', `Created ticketing subtask: ${ticketingIssue.key}`);
          } else {
            log('warn', 'Failed to create ticketing subtask');
          }
        } catch (ticketingError) {
          log('error', `Error creating ticketing subtask: ${ticketingError.message}`);
        }
      } catch (error) {
        log('error', `Error handling subtask created event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeSubtaskCreation);

  // Subscribe to task deletion
  const unsubscribeTaskDeleted = subscribe(
    EVENT_TYPES.TASK_DELETED,
    async ({ taskId, task, data, tasksPath }) => {
      try {
        // Import required modules dynamically to avoid circular dependencies
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        
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

  // Subscribe to subtask deletion events
  const unsubscribeSubtaskDeleted = subscribe(
    EVENT_TYPES.SUBTASK_DELETED,
    async ({ taskId, subtaskId, subtask, data, tasksPath }) => {
      try {
        // Import required modules dynamically to avoid circular dependencies
        const { getTicketingInstance } = await import('./ticketing-factory.js');
        
        // Use the provided subtask object or find it in the task history if available
        if (!subtask) {
          log('warn', `Subtask ${subtaskId} not provided in event data. Limited ticketing update possible.`);
          // We can still proceed if we have the subtask ID, but functionality may be limited
        }
        
        // Get ticketing instance
        const ticketing = await getTicketingInstance('jira');
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping subtask deletion update.');
          return;
        }
        
        // If the subtask had a ticket ID, update it or mark it as deleted in the ticketing system
        let subtaskTicketId = null;
        
        // Try to get ticket ID from subtask object if available
        if (subtask && typeof ticketing.getTicketId === 'function') {
          subtaskTicketId = ticketing.getTicketId(subtask);
        }
        
        // If we don't have a ticket ID from the subtask object, we can't update the ticket
        if (!subtaskTicketId) {
          log('info', `No ticket ID found for subtask ${subtaskId}. Skipping ticketing update.`);
          return;
        }
        
        log('info', `Subtask ${subtaskId} with ticket ${subtaskTicketId} was deleted. Updating ticketing system...`);
        
        // Update the ticket in the ticketing system to mark it as cancelled/deleted
        const success = await ticketing.updateTicketStatus(
          subtaskTicketId,
          'cancelled', // Or whatever status makes sense for deleted subtasks
          null,
          subtask
        );
        
        if (success) {
          log('success', `Updated ticketing system for deleted subtask ${subtaskId}`);
        } else {
          log('warn', `Failed to update ticketing system for deleted subtask ${subtaskId}`);
        }
      } catch (error) {
        log('error', `Error handling subtask deleted event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeSubtaskDeleted);

  // Return unsubscribe function that will clean up all event listeners
  return () => {
    unsubscribeFunctions.forEach(unsubscribe => {
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

/**
 * Update a task status in the connected ticketing system
 * @param {string} taskId - Task ID to update
 * @param {string} newStatus - New status
 * @param {Object} data - Tasks data object
 * @param {string} tasksPath - Path to tasks.json file
 */
async function updateTicketStatus(taskId, newStatus, data, tasksPath) {
  try {
    // Import required modules dynamically to avoid circular dependencies
    const { findTaskById } = await import('../utils.js');
    const { getTicketingInstance } = await import('./ticketing-factory.js');
    
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
