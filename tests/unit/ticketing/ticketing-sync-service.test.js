/**
 * Ticketing Sync Service tests
 * Specifically focusing on the subtask creation functionality
 */

import { jest } from '@jest/globals';
import { TicketingSyncService } from '../../../scripts/modules/ticketing/ticketing-sync-service.js';

// Mock dependencies
jest.mock('../../../scripts/modules/utils.js', () => ({
  log: jest.fn(),
  findProjectRoot: jest.fn(() => '/mock/project/root'),
  readJSON: jest.fn(() => ({ tasks: [] })),
  writeJSON: jest.fn(),
  isSilentMode: jest.fn(() => false)
}));

jest.mock('../../../scripts/modules/config-manager.js', () => ({
  getTicketingIntegrationEnabled: jest.fn(() => true)
}));

jest.mock('../../../scripts/modules/ticketing/ticketing-factory.js', () => ({
  getTicketingInstance: jest.fn()
}));

// Helper to set up mocks
function setupMocks(createTaskSpy = jest.fn(), createStorySpy = jest.fn()) {
  // Mock ticketing instance
  const mockTicketingInstance = {
    createTask: createTaskSpy,
    createStory: createStorySpy,
    getTicketId: jest.fn(task => task.metadata?.jiraKey || null),
    storeTicketId: jest.fn((task, ticketId) => {
      if (!task.metadata) task.metadata = {};
      task.metadata.jiraKey = ticketId;
      return task;
    })
  };

  // Set up the mock implementation for getTicketingInstance
  const { getTicketingInstance } = require('../../../scripts/modules/ticketing/ticketing-factory.js');
  getTicketingInstance.mockResolvedValue(mockTicketingInstance);

  return { mockTicketingInstance };
}

describe('TicketingSyncService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TicketingSyncService();
  });

  describe('syncSubtask', () => {
    test('should use createTask (not createStory) to create proper subtask tickets', async () => {
      // Set up mocks with spies to track method calls
      const createTaskSpy = jest.fn().mockResolvedValue({ key: 'JIRA-456' });
      const createStorySpy = jest.fn().mockResolvedValue({ key: 'JIRA-789' });
      setupMocks(createTaskSpy, createStorySpy);
      
      // Initialize the service
      await service.initialize('/mock/project/root');
      
      // Create mock parent task and subtask
      const parentTask = {
        id: '5',
        title: 'Parent Task',
        description: 'Parent task description',
        metadata: { jiraKey: 'JIRA-123' } // Parent already has a ticket
      };
      
      const subtask = {
        id: '2',
        title: 'Subtask Title',
        description: 'Subtask description',
        status: 'pending'
      };
      
      // Call the method being tested
      const result = await service.syncSubtask(
        subtask,
        parentTask,
        '/mock/tasks.json',
        '/mock/project/root'
      );
      
      // Verify the result
      expect(result.success).toBe(true);
      expect(result.ticketKey).toBe('JIRA-456');
      
      // CRITICAL: Verify that createTask was called (not createStory)
      expect(createTaskSpy).toHaveBeenCalledTimes(1);
      expect(createStorySpy).not.toHaveBeenCalled();
      
      // Verify that createTask was called with the right parameters
      expect(createTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '2',
          parentId: '5',
          title: 'Subtask Title', // Should not have [Subtask] prefix
          description: 'Subtask description' // Should not have parent task info appended
        }),
        'JIRA-123', // Parent ticket key
        '/mock/project/root'
      );
      
      // Verify the subtask metadata was updated
      expect(subtask.metadata.jiraKey).toBe('JIRA-456');
    });
    
    test('should not create subtask ticket if parent has no ticket', async () => {
      // Set up mocks
      const createTaskSpy = jest.fn();
      const createStorySpy = jest.fn();
      setupMocks(createTaskSpy, createStorySpy);
      
      // Initialize the service
      await service.initialize('/mock/project/root');
      
      // Create parent without ticket and subtask
      const parentTask = {
        id: '5',
        title: 'Parent Task',
        description: 'Parent task description'
        // No jiraKey in metadata
      };
      
      const subtask = {
        id: '2',
        title: 'Subtask Title',
        description: 'Subtask description'
      };
      
      // Call the method being tested
      const result = await service.syncSubtask(
        subtask,
        parentTask,
        '/mock/tasks.json',
        '/mock/project/root'
      );
      
      // Verify result shows failure due to missing parent ticket
      expect(result.success).toBe(false);
      expect(result.error).toBe('Parent task has no ticket');
      
      // Verify neither method was called
      expect(createTaskSpy).not.toHaveBeenCalled();
      expect(createStorySpy).not.toHaveBeenCalled();
    });
  });
}); 