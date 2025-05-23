/**
 * ticketing-event-subscriber.js
 * Handles task status events and updates ticketing systems accordingly
 */

import path from 'path';
import { log, findTaskById, findProjectRoot, writeJSON } from '../utils.js';
import { subscribe, EVENT_TYPES } from '../events/event-emitter.js';
import { getTicketingIntegrationEnabled, getTicketingSystemEnabled } from '../config-manager.js';
import { getTicketingInstance } from './ticketing-factory.js';
import { isTicketingSystemConfigured } from './ticketing-interface.js';
import { generateUserStoryRefId, storeRefId } from './utils/id-utils.js';

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
      log('info', 'Ticketing integration is disabled. Skipping event subscribers.');
      return () => {}; // Return empty unsubscribe function
    }
  } catch (error) {
    log('error', `Error checking ticketing integration status: ${error.message}`);
    return () => {}; // Return empty unsubscribe function on error
  }
  
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
    async ({ taskId, newStatus, data, tasksPath }) => {
      try {
        // Using static imports now
        
        // Find the subtask directly using the utility function which handles compound IDs
        const { task: subtask } = findTaskById(data.tasks, taskId);
        if (!subtask) {
          log('warn', `Subtask ${taskId} not found. Skipping ticketing update.`);
          return;
        }
                
        // Get ticketing instance with explicit project root
        const projectRoot = findProjectRoot();
        const ticketing = await getTicketingInstance(null, projectRoot);
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping update.');
          return;
        }
        
        // Get the ticket ID from the subtask metadata
        const subtaskTicketId = ticketing.getTicketId(subtask);
        if (!subtaskTicketId) {
          log('info', `No ticket ID found for subtask ${taskId}. Skipping ticketing update.`);
          return;
        }
        
        // Update the ticket status
        log('info', `Updating subtask ${taskId} with ticket ${subtaskTicketId} to status: ${newStatus}`);

        const success = await ticketing.updateTicketStatus(
          subtaskTicketId,
          newStatus,
          null,
          subtask
        );
        
        if (!success) {
          log('warn', `Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${taskId}`);
        } else {
          log('success', `Successfully updated ticketing system issue ${subtaskTicketId} for subtask ${taskId}`);
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
          // Using static imports now
          const projectRoot = findProjectRoot();
          
          // Find the task by ID
          task = findTaskById(data.tasks, taskId);
          if (!task) {
            log('warn', `Task ${taskId} not found. Skipping ticket creation.`);
            return;
          }
        }

        // Use findProjectRoot for consistent path resolution
        const projectRoot = findProjectRoot();
        
        // Using static imports now
        
        // Instead of relying on getTicketingSystemEnabled which looks for the config file,
        // check if a ticketing instance can be created directly
        let ticketingInstance;
        try {
          ticketingInstance = await getTicketingInstance(null, projectRoot);
          if (!ticketingInstance) {
            log('info', 'No ticketing system available. Skipping ticket creation.');
            return;
          }
        } catch (configError) {
          log('error', `Error getting ticketing instance: ${configError.message}`);
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
          // Already have ticketing instance from earlier check
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
    async ({ taskId, subtask, data, tasksPath }) => {
      try {
        // Using static imports now
        const projectRoot = findProjectRoot();
        
        // Use provided subtask or find it using findTaskById
        let subtaskObj = subtask;
        let parentTask, parentTaskId, subtaskId;
        
        if (!subtaskObj && taskId) {
          // Find the subtask using findTaskById which handles compound IDs
          const { task: foundTask } = findTaskById(data.tasks, taskId);
          if (foundTask && foundTask.isSubtask) {
            subtaskObj = foundTask;
            // Extract parent task info from the subtask
            if (subtaskObj.parentTask) {
              parentTaskId = subtaskObj.parentTask.id;
              subtaskId = subtaskObj.id;
              
              // Get the actual parent task object
              const { task: foundParent } = findTaskById(data.tasks, parentTaskId);
              if (foundParent) {
                parentTask = foundParent;
              } else {
                log('warn', `Parent task ${parentTaskId} not found for subtask ${taskId}. Skipping ticket creation.`);
                return;
              }
            } else {
              log('warn', `Missing parent task information for subtask ${taskId}. Skipping ticket creation.`);
              return;
            }
          } else {
            log('warn', `Subtask ${taskId} not found or is not a valid subtask. Skipping ticket creation.`);
            return;
          }
        } else if (taskId && !subtaskObj) {
          log('warn', `Missing subtask data for ID ${taskId}. Skipping ticket creation.`);
          return;
        }
        
        // We already have projectRoot from earlier import, use it consistently
        // Get ticketing instance directly without checking config
        const ticketingInstance = await getTicketingInstance(null, projectRoot);
        if (!ticketingInstance) {
          log('info', 'No ticketing system available. Skipping subtask ticket creation.');
          return;
        }
        
        // If we don't have a parentTask object yet, we need to get it
        if (!parentTask && subtaskObj && subtaskObj.parentTask) {
          const { task: foundParent } = findTaskById(data.tasks, subtaskObj.parentTask.id);
          if (foundParent) {
            parentTask = foundParent;
            parentTaskId = foundParent.id;
          } else {
            log('warn', `Parent task ${subtaskObj.parentTask.id} not found. Skipping subtask ticket creation.`);
            return;
          }
        } else if (!parentTask && taskId && taskId.toString().includes('.')) {
          // Parse the task ID as a fallback
          const idParts = taskId.toString().split('.');
          if (idParts.length === 2) {
            const parsedParentId = parseInt(idParts[0], 10);
            const { task: foundParent } = findTaskById(data.tasks, parsedParentId);
            if (foundParent) {
              parentTask = foundParent;
              parentTaskId = parsedParentId;
            } else {
              log('warn', `Parent task ${parsedParentId} not found. Skipping subtask ticket creation.`);
              return;
            }
          }
        }
        
        // We must have a parent task by now
        if (!parentTask) {
          log('warn', `Unable to determine parent task for subtask ${taskId}. Skipping subtask ticket creation.`);
          return;
        }
        
        const parentTicketId = ticketingInstance.getTicketId(parentTask);
        if (!parentTicketId) {
          log('warn', `No ticket ID found for parent task ${parentTaskId}. Skipping subtask ticket creation.`);
          return;
        }
        
        // Make sure we have subtaskId
        if (!subtaskId && subtaskObj) {
          subtaskId = subtaskObj.id;
        }
        
        // Create a subtask representation for the ticketing system
        const subtaskData = {
          id: subtaskId,
          parentId: parentTaskId,
          title: subtaskObj.title,
          description: subtaskObj.description || '',
          status: subtaskObj.status || 'pending',
          parentTicketId
        };
        
        // Create the subtask in the ticketing system
        try {
          log('info', `Creating ticketing subtask for subtask ${subtaskId} of task ${parentTaskId}...`);
          const ticketingIssue = await ticketingInstance.createSubtask(subtaskData, projectRoot);
          log('debug', `Subtask ticket creation result: ${JSON.stringify(ticketingIssue)}`);
          
          if (ticketingIssue && ticketingIssue.key) {
            // Store ticketing issue key in subtask metadata
            log('debug', `Storing ticket key ${ticketingIssue.key} in subtask metadata for subtask ${subtaskId} of task ${parentTaskId}`);
            
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
              const taskIndex = data.tasks.findIndex(t => t.id === parentTaskId);
              if (taskIndex !== -1) {
                data.tasks[taskIndex] = parentTask;
                // Write changes back to file
                log('info', `Updating tasks.json with new ticket ID ${ticketingIssue.key} for subtask ${taskId}`);
                writeJSON(tasksPath, data);
              } else {
                log('warn', `Could not find parent task ${parentTaskId} in tasks data to update. Changes may not be saved.`);
              }
            }
            
            log('success', `Created ticketing subtask ${ticketingIssue.key} for subtask ${subtaskId} of task ${parentTaskId}`);
          } else {
            log('warn', `Failed to create ticketing subtask for subtask ${subtaskId} of task ${parentTaskId}`);
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
        // Using static imports now
        
        // Get ticketing instance with explicit project root
        const projectRoot = findProjectRoot();
        const ticketing = await getTicketingInstance(null, projectRoot);
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping deletion update.');
          return;
        }
        
        // If the task had a ticket ID, delete it from the ticketing system
        const ticketId = task && ticketing.getTicketId(task);
        if (ticketId) {
          log('info', `Task ${taskId} with ticket ${ticketId} was deleted. Deleting from ticketing system...`);
          
          // Delete the ticket from the ticketing system
          const success = await ticketing.deleteTicket(
            ticketId,
            null
          );
          
          if (success) {
            log('success', `Successfully deleted ticket ${ticketId} for task ${taskId} from ticketing system`);
          } else {
            log('warn', `Failed to delete ticket ${ticketId} for task ${taskId} from ticketing system`);
          }
        } else {
          log('info', `No ticketing system issue found for deleted task ${taskId}. No action needed.`);
        }
        
        // Process subtasks of the deleted task
        if (task && task.subtasks && task.subtasks.length > 0) {
          log('info', `Processing ${task.subtasks.length} subtasks of deleted task ${taskId}...`);
          
          for (const subtask of task.subtasks) {
            const subtaskTicketId = ticketing.getTicketId(subtask);
            
            if (subtaskTicketId) {
              log('info', `Updating ticketing system for subtask ${subtask.id} (ticket ${subtaskTicketId}) of deleted task ${taskId}...`);
              
              try {
                const subtaskSuccess = await ticketing.updateTicketStatus(
                  subtaskTicketId,
                  'cancelled', // Same status as main task
                  null,
                  subtask
                );
                
                if (subtaskSuccess) {
                  log('success', `Updated ticketing system issue ${subtaskTicketId} for subtask ${subtask.id} of deleted task ${taskId}`);
                } else {
                  log('warn', `Failed to update ticketing system issue ${subtaskTicketId} for subtask ${subtask.id} of deleted task ${taskId}`);
                }
              } catch (subtaskError) {
                log('error', `Error updating ticketing for subtask ${subtask.id}: ${subtaskError.message}`);
              }
            } else {
              log('info', `No ticketing system issue found for subtask ${subtask.id} of deleted task ${taskId}. No action needed.`);
            }
          }
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
    async ({ taskId, subtask, data, tasksPath }) => {
      try {
        // Using static imports now
        const projectRoot = findProjectRoot();
        
        // Use provided subtask or find it using findTaskById
        let foundSubtask = subtask;
        if (!foundSubtask) {
          // This utility handles compound IDs like "1.2" automatically
          const { task: foundTask } = findTaskById(data.tasks, taskId);
          if (!foundTask) {
            log('warn', `Subtask ${taskId} not found. Skipping ticketing update.`);
            return;
          }
          foundSubtask = foundTask;
        }
        
        // Get ticketing instance
        const ticketing = await getTicketingInstance(null, projectRoot);
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping update for deleted subtask.');
          return;
        }
        
        // Try to get ticket ID from subtask object
        const subtaskTicketId = foundSubtask && typeof ticketing.getTicketId === 'function' ?
          ticketing.getTicketId(foundSubtask) : null;
        
        if (!subtaskTicketId) {
          log('info', `No ticket ID found for subtask ${taskId}. Skipping ticketing update.`);
          return;
        }
        
        log('info', `Subtask ${taskId} with ticket ${subtaskTicketId} was deleted. Deleting from ticketing system...`);
        
        // Delete the ticket from the ticketing system
        const success = await ticketing.deleteTicket(
          subtaskTicketId,
          null
        );
        
        if (success) {
          log('success', `Successfully deleted ticket ${subtaskTicketId} for subtask ${taskId} from ticketing system`);
        } else {
          log('warn', `Failed to delete ticket ${subtaskTicketId} for subtask ${taskId} from ticketing system`);
        }
      } catch (error) {
        log('error', `Error handling subtask deleted event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeSubtaskDeleted);

  // Subscribe to task update events (non-status changes)
  const unsubscribeTaskUpdated = subscribe(
    EVENT_TYPES.TASK_UPDATED,
    async ({ taskId, task, previousTask, data, tasksPath }) => {
      try {
        // Using static imports now
        const projectRoot = findProjectRoot();
        
        // Get ticketing instance
        const ticketing = await getTicketingInstance(null, projectRoot);
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping update for task changes.');
          return;
        }
        
        // Check if task has a ticket ID
        const ticketId = task && typeof ticketing.getTicketId === 'function' ? 
          ticketing.getTicketId(task) : null;

        if (!ticketId) {
          log('info', `No ticket ID found for task ${taskId}. Skipping ticketing update.`);
          return;
        }
        
        log('info', `Task ${taskId} with ticket ${ticketId} was updated. Syncing with ticketing system...`);
        
        // Update the ticket details in the ticketing system
        if (typeof ticketing.updateTicketDetails === 'function') {
          const success = await ticketing.updateTicketDetails(ticketId, task, previousTask);
          
          if (success) {
            log('success', `Updated ticketing system issue ${ticketId} for task ${taskId}`);
          } else {
            log('warn', `Failed to update ticketing system issue ${ticketId} for task ${taskId}`);
          }
        } else {
          log('warn', `Ticketing system doesn't support updating ticket details. Skipping update.`);
        }
      } catch (error) {
        log('error', `Error handling task update event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeTaskUpdated);

  // Subscribe to subtask update events (non-status changes)
  const unsubscribeSubtaskUpdated = subscribe(
    EVENT_TYPES.SUBTASK_UPDATED,
    async ({ taskId, subtask, previousSubtask, data, tasksPath }) => {
      try {
        // Using static imports now
        const projectRoot = findProjectRoot();
        
        // Use provided subtask or find it using findTaskById
        let foundSubtask = subtask;
        if (!foundSubtask) {
          // This utility handles compound IDs like "1.2" automatically
          const { task: foundTask } = findTaskById(data.tasks, taskId);
          if (!foundTask) {
            log('warn', `Subtask ${taskId} not found. Skipping ticketing update.`);
            return;
          }
          foundSubtask = foundTask;
        }
        
        // Get ticketing instance
        const ticketing = await getTicketingInstance(null, projectRoot);
        if (!ticketing) {
          log('warn', 'No ticketing system available. Skipping update for subtask changes.');
          return;
        }
        
        // Check if subtask has a ticket ID
        const subtaskTicketId = foundSubtask && typeof ticketing.getTicketId === 'function' ?
          ticketing.getTicketId(foundSubtask) : null;

        if (!subtaskTicketId) {
          log('info', `No ticket ID found for subtask ${taskId}. Skipping ticketing update.`);
          return;
        }
        
        log('info', `Subtask ${taskId} with ticket ${subtaskTicketId} was updated. Syncing with ticketing system...`);
        
        // Update the subtask details in the ticketing system
        if (typeof ticketing.updateTicketDetails === 'function') {
          const success = await ticketing.updateTicketDetails(subtaskTicketId, foundSubtask, previousSubtask);
          
          if (success) {
            log('success', `Updated ticketing system issue ${subtaskTicketId} for subtask ${taskId}`);
          } else {
            log('warn', `Failed to update ticketing system issue ${subtaskTicketId} for subtask ${taskId}`);
          }
        } else {
          log('warn', `Ticketing system doesn't support updating ticket details. Skipping subtask update.`);
        }
      } catch (error) {
        log('error', `Error handling subtask update event: ${error.message}`);
      }
    }
  );
  unsubscribeFunctions.push(unsubscribeSubtaskUpdated);

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
    // Using static imports now
    const projectRoot = findProjectRoot();
    
    // Find the task by ID
    const task = findTaskById(data.tasks, taskId);
    if (!task) {
      log('warn', `Task ${taskId} not found. Skipping ticketing system update.`);
      return;
    }

    // Get the ticketing system instance with explicit project root
    const ticketing = await getTicketingInstance(null, projectRoot);
    if (!ticketing) {
      log('warn', 'No ticketing system available. Skipping update.');
      return;
    }

    // Check if the task has a ticket ID in its metadata
    const ticketId = ticketing.getTicketId(task);
    if (ticketId) {
      log('info', `Updating task ${taskId} with ticket ${ticketId} to status: ${newStatus}`);

      // Update the ticket status
      const success = await ticketing.updateTicketStatus(
        ticketId,
        newStatus,
        null,
        task
      );
      
      if (!success) {
        log('warn', `Failed to update ticketing system issue ${ticketId} status for task ${taskId}`);
      } else {
        log('success', `Successfully updated ticketing system issue ${ticketId} for task ${taskId}`);
      }
    } else {
      log('info', `No ticket ID found for task ${taskId}. Skipping ticketing update.`);
    }

    // Update subtasks if they exist
    if (task.subtasks && task.subtasks.length > 0) {
      log('info', `Cascading status update to ${task.subtasks.length} subtasks of task ${taskId}...`);
      for (const subtask of task.subtasks) {
        const subtaskTicketId = ticketing.getTicketId(subtask);
        if (subtaskTicketId) {
          log('info', `Updating subtask ${subtask.id} with ticket ${subtaskTicketId} to status: ${newStatus}`);
          try {
            const subtaskSuccess = await ticketing.updateTicketStatus(
              subtaskTicketId,
              newStatus,
              null,
              subtask
            );

            if (!subtaskSuccess) {
              log('warn', `Failed to update ticketing system issue ${subtaskTicketId} status for subtask ${subtask.id}`);
            } else {
              log('success', `Successfully updated ticketing system issue ${subtaskTicketId} for subtask ${subtask.id}`);
            }
          } catch (ticketError) {
            log('error', `Error updating ticketing system issue status for subtask ${subtask.id}: ${ticketError.message}`);
          }
        } else {
          log('info', `No ticket ID found for subtask ${subtask.id}. Skipping ticketing update.`);
        }
      }
    }
  } catch (error) {
    log('error', `Error updating ticketing system status: ${error.message}`);
  }
}

export { initializeTicketingSubscribers, updateTicketStatus };
