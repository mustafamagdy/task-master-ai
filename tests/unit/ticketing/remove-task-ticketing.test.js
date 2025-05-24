/**
 * Remove Task Ticketing Integration Tests
 * Tests the ticketing integration for the remove-task command
 */

import { jest } from '@jest/globals';
import {
	setupTicketingMocks,
	resetTicketingMocks,
	setupSuccessfulTicketing,
	setupDisabledTicketing,
	setupTicketingError,
	verifyTicketingServiceCalls,
	mockSyncTask,
	mockUpdateTaskStatus,
	mockDeleteTicket,
	mockTicketExists,
	mockGetTicketingConfig,
	mockReadJSON,
	mockWriteJSON,
	mockExistsSync,
	mockLog,
	mockFindProjectRoot
} from '../../setup/ticketing-mocks.js';
import {
	tasksForRemoveTaskTest,
	emptyTasksForCreationTest
} from '../../fixtures/ticketing/tasks-with-tickets.js';
import {
	mockJiraConfig,
	mockGitHubConfig
} from '../../fixtures/ticketing/ticketing-configs.js';

// Mock process.exit to prevent tests from exiting
const realProcessExit = process.exit;
process.exit = jest.fn();

// Mock generate task files
const mockGenerateTaskFiles = jest.fn().mockResolvedValue(true);
jest.mock('../../../scripts/modules/task-manager/generate-task-files.js', () => ({
	default: mockGenerateTaskFiles
}));

// Mock task-exists function
const mockTaskExists = jest.fn().mockResolvedValue(true);
jest.mock('../../../scripts/modules/task-manager/task-exists.js', () => ({
	default: mockTaskExists
}));

// Import the function under test AFTER mocks are set up
import removeTask from '../../../scripts/modules/task-manager/remove-task.js';

describe('Remove Task Ticketing Integration', () => {
	const mockProjectRoot = '/test/project';
	const mockTasksPath = '/test/project/tasks/tasks.json';

	beforeEach(() => {
		resetTicketingMocks();
		jest.clearAllMocks();
		
		// Set up default mocks
		mockReadJSON.mockReturnValue(tasksForRemoveTaskTest);
		mockExistsSync.mockReturnValue(true);
		mockWriteJSON.mockImplementation(() => {});
		mockFindProjectRoot.mockReturnValue(mockProjectRoot);
		mockTaskExists.mockResolvedValue(true);
	});

	describe('Remove Task - Ticket Deletion', () => {
		test('should delete ticket when removing a task', async () => {
			// Setup: Ticketing is enabled and successful
			setupSuccessfulTicketing('jira');
			mockTicketExists.mockResolvedValue(true);
			mockDeleteTicket.mockResolvedValue(true);

			// Execute: Remove task
			await removeTask(mockTasksPath, '1', mockProjectRoot);

			// Verify: Ticket deletion was called
			expect(mockDeleteTicket).toHaveBeenCalled();
			expect(mockTicketExists).toHaveBeenCalled();

			// Verify: Tasks data update and file generation
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalledTimes(1);
		});

		test('should delete tickets for parent task and all its subtasks', async () => {
			// Setup: Ticketing is enabled and successful
			setupSuccessfulTicketing('jira');
			mockTicketExists.mockResolvedValue(true);
			mockDeleteTicket.mockResolvedValue(true);

			// Execute: Remove task with subtasks
			await removeTask(mockTasksPath, '2', mockProjectRoot);

			// Verify: Multiple ticket deletions occurred (1 for parent + subtasks)
			expect(mockDeleteTicket).toHaveBeenCalledTimes(3); // Parent task + 2 subtasks
			
			// Verify: Tasks data update and file generation
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalledTimes(1);
		});

		test('should delete ticket when removing a subtask directly', async () => {
			// Setup: Ticketing is enabled and successful
			setupSuccessfulTicketing('jira');
			mockTicketExists.mockResolvedValue(true);
			mockDeleteTicket.mockResolvedValue(true);

			// Execute: Remove a subtask directly
			await removeTask(mockTasksPath, '2.1', mockProjectRoot);

			// Verify: Ticket deletion was called
			expect(mockDeleteTicket).toHaveBeenCalled();
			
			// Verify: Tasks data update and file generation
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalledTimes(1);
		});

		test('should skip ticket deletion when ticketing is disabled', async () => {
			// Setup: Ticketing is disabled
			setupDisabledTicketing();

			// Execute: Remove task
			await removeTask(mockTasksPath, '1', mockProjectRoot);

			// Verify: Ticket deletion was not attempted
			expect(mockDeleteTicket).not.toHaveBeenCalled();
			
			// Verify: Tasks data update and file generation still occurred
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalledTimes(1);
		});

		test('should handle errors during ticket deletion gracefully', async () => {
			// Setup: Ticketing is enabled but will fail
			setupTicketingError();
			mockTicketExists.mockResolvedValue(true);
			mockDeleteTicket.mockRejectedValue(new Error('API Error'));

			// Execute: Remove task
			const result = await removeTask(mockTasksPath, '1', mockProjectRoot);

			// Verify: Process continued despite ticketing error
			expect(result.success).toBe(true);
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalledTimes(1);
		});
	});
});

// Restore original process.exit after all tests
afterAll(() => {
	process.exit = realProcessExit;
}); 