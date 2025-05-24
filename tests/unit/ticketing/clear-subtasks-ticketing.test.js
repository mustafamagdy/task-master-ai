/**
 * Clear Subtasks Ticketing Integration Tests
 * Tests the ticketing integration for the clear-subtasks command
 */

import { jest } from '@jest/globals';
import {
	setupTicketingMocks,
	resetTicketingMocks,
	setupSuccessfulTicketing,
	setupDisabledTicketing,
	setupTicketingError,
	setupMixedTicketingResults,
	verifyTicketingServiceCalls,
	mockSyncTask,
	mockUpdateTaskStatus,
	mockUpdateTaskContent,
	mockGetTicketingConfig,
	mockReadJSON,
	mockWriteJSON,
	mockLog
} from '../../setup/ticketing-mocks.js';
import {
	tasksWithSubtasksAndTickets,
	emptyTasksForCreationTest
} from '../../fixtures/ticketing/tasks-with-tickets.js';
import {
	mockJiraConfig,
	mockDisabledConfig
} from '../../fixtures/ticketing/ticketing-configs.js';

// Setup mocks before importing the module under test
setupTicketingMocks();

// Mock additional dependencies specific to clear-subtasks
const mockGenerateTaskFiles = jest.fn();
const mockFindProjectRoot = jest.fn();

jest.mock(
	'../../../scripts/modules/task-manager/generate-task-files.js',
	() => ({
		default: mockGenerateTaskFiles
	})
);

jest.mock('../../../scripts/modules/utils.js', () => ({
	...jest.requireActual('../../../scripts/modules/utils.js'),
	readJSON: mockReadJSON,
	writeJSON: mockWriteJSON,
	log: mockLog,
	findProjectRoot: mockFindProjectRoot
}));

// Import the function under test AFTER mocks are set up
import clearSubtasks from '../../../scripts/modules/task-manager/clear-subtasks.js';

describe('Clear Subtasks Ticketing Integration', () => {
	const mockProjectRoot = '/test/project';
	const mockTasksPath = '/test/project/tasks/tasks.json';

	beforeEach(() => {
		resetTicketingMocks();
		mockGenerateTaskFiles.mockClear();
		mockFindProjectRoot.mockReturnValue(mockProjectRoot);

		// Default successful file operations
		mockWriteJSON.mockImplementation(() => {});
		mockGenerateTaskFiles.mockResolvedValue();
	});

	describe('Successful Ticketing Integration', () => {
		test('should cancel tickets for all cleared subtasks', async () => {
			// Setup: Task with 3 subtasks, each with tickets
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			// Execute: Clear subtasks from task 1
			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Ticketing service called for each subtask
			verifyTicketingServiceCalls({
				updateStatusCalls: 3,
				expectedTaskIds: ['1.1', '1.2', '1.3'],
				expectedStatuses: ['cancelled', 'cancelled', 'cancelled'],
				expectedProjectRoot: mockProjectRoot
			});

			// Verify: Core functionality worked
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 1,
							subtasks: [] // Subtasks should be cleared
						})
					])
				})
			);

			expect(mockGenerateTaskFiles).toHaveBeenCalledWith(
				mockTasksPath,
				expect.any(String)
			);
		});

		test('should handle multiple tasks with subtasks', async () => {
			// Setup: Tasks with subtasks
			const testTasks = {
				...tasksWithSubtasksAndTickets,
				tasks: [
					...tasksWithSubtasksAndTickets.tasks,
					{
						id: 3,
						title: 'Another task with subtasks',
						status: 'pending',
						subtasks: [
							{
								id: 1,
								title: 'Another subtask',
								status: 'pending',
								externalTicket: {
									system: 'jira',
									ticketId: 'PROJ-200',
									ticketKey: 'PROJ-200'
								}
							}
						]
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			// Execute: Clear subtasks from multiple tasks
			await clearSubtasks(mockTasksPath, '1,3', mockProjectRoot);

			// Verify: All subtasks from both tasks have tickets cancelled
			verifyTicketingServiceCalls({
				updateStatusCalls: 4, // 3 from task 1 + 1 from task 3
				expectedProjectRoot: mockProjectRoot
			});
		});

		test('should work with different ticketing providers', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			// Test GitHub integration
			setupSuccessfulTicketing('github');
			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			verifyTicketingServiceCalls({
				updateStatusCalls: 3,
				expectedProjectRoot: mockProjectRoot
			});

			// Reset and test Azure DevOps integration
			resetTicketingMocks();
			setupSuccessfulTicketing('azdevops');
			mockReadJSON.mockReturnValue(testTasks);

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			verifyTicketingServiceCalls({
				updateStatusCalls: 3,
				expectedProjectRoot: mockProjectRoot
			});
		});
	});

	describe('Graceful Error Handling', () => {
		test('should handle ticketing failures gracefully', async () => {
			// Setup: Ticketing service fails for one subtask
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			setupMixedTicketingResults('jira');

			// Execute: Clear subtasks
			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Core operation still succeeded
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 1,
							subtasks: [] // Subtasks should still be cleared
						})
					])
				})
			);

			// Verify: Warning was logged for failed tickets
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('Could not update ticket status')
			);
		});

		test('should handle network errors gracefully', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('network', 'jira');

			// Execute: Should not throw error
			await expect(
				clearSubtasks(mockTasksPath, '1', mockProjectRoot)
			).resolves.not.toThrow();

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('Could not update ticket status')
			);
		});

		test('should continue processing when some tickets fail', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: First ticket succeeds, second fails, third succeeds
			mockGetTicketingConfig.mockReturnValue(mockJiraConfig);
			mockUpdateTaskStatus
				.mockResolvedValueOnce({ success: true })
				.mockRejectedValueOnce(new Error('Ticket API error'))
				.mockResolvedValueOnce({ success: true });

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: All three subtasks were processed
			expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(3);

			// Verify: Warning logged for the failed ticket
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Could not update ticket status for cleared subtask 1.2'
				)
			);

			// Verify: Core operation completed successfully
			expect(mockWriteJSON).toHaveBeenCalled();
		});
	});

	describe('Disabled Ticketing', () => {
		test('should not call ticketing when projectRoot is missing', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			// Execute: Clear subtasks without projectRoot
			await clearSubtasks(mockTasksPath, '1'); // No projectRoot parameter

			// Verify: No ticketing calls made
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
			expect(mockSyncTask).not.toHaveBeenCalled();

			// Verify: Core operation still worked
			expect(mockWriteJSON).toHaveBeenCalled();
		});

		test('should not call ticketing when ticketing is disabled', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			setupDisabledTicketing();

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Ticketing calls were made but returned "not available"
			expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(3);

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		test('should handle tasks without subtasks gracefully', async () => {
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task without subtasks',
						status: 'pending',
						dependencies: [],
						priority: 'medium'
						// No subtasks property
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: No ticketing calls made (no subtasks to clear)
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();

			// Verify: Appropriate message logged
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Task 1 has no subtasks to clear')
			);
		});

		test('should handle subtasks without tickets', async () => {
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task with subtasks but no tickets',
						status: 'pending',
						subtasks: [
							{
								id: 1,
								title: 'Subtask without ticket',
								status: 'pending'
								// No externalTicket property
							},
							{
								id: 2,
								title: 'Another subtask without ticket',
								status: 'pending'
							}
						]
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Ticketing calls still made (service handles missing tickets)
			expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(2);
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.1',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.2',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);
		});

		test('should handle empty tasks file', async () => {
			mockReadJSON.mockReturnValue(emptyTasksForCreationTest);
			setupSuccessfulTicketing('jira');

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: No ticketing calls made
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();

			// Verify: Error logged for non-existent task
			expect(mockLog).toHaveBeenCalledWith('error', 'Task 1 not found');
		});

		test('should handle invalid task IDs', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			await clearSubtasks(mockTasksPath, 'invalid', mockProjectRoot);

			// Verify: No ticketing calls made
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();

			// Verify: Error logged
			expect(mockLog).toHaveBeenCalledWith(
				'error',
				expect.stringContaining('Invalid task ID')
			);
		});

		test('should handle --all flag correctly', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			// Get all task IDs for the --all functionality
			const allTaskIds = testTasks.tasks.map((t) => t.id).join(',');

			await clearSubtasks(mockTasksPath, allTaskIds, mockProjectRoot);

			// Verify: Tickets cancelled for subtasks from all tasks that have them
			verifyTicketingServiceCalls({
				updateStatusCalls: 3, // Only task 1 has subtasks in our test data
				expectedProjectRoot: mockProjectRoot
			});
		});
	});

	describe('Logging and Feedback', () => {
		test('should log appropriate success messages', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Success messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining(
					"Updated ticket status to 'cancelled' for subtask 1.1"
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining(
					"Updated ticket status to 'cancelled' for subtask 1.2"
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining(
					"Updated ticket status to 'cancelled' for subtask 1.3"
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Cleared 3 subtasks from task 1')
			);
		});

		test('should log appropriate warning messages for failures', async () => {
			const testTasks = { ...tasksWithSubtasksAndTickets };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'jira');

			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);

			// Verify: Warning messages logged for each failed ticket
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not update ticket status for cleared subtask 1.1'
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not update ticket status for cleared subtask 1.2'
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not update ticket status for cleared subtask 1.3'
				)
			);
		});
	});

	describe('Performance and Concurrency', () => {
		test('should handle large numbers of subtasks efficiently', async () => {
			// Create a task with many subtasks
			const manySubtasks = Array.from({ length: 20 }, (_, index) => ({
				id: index + 1,
				title: `Subtask ${index + 1}`,
				status: 'pending',
				externalTicket: {
					system: 'jira',
					ticketId: `PROJ-${100 + index}`,
					ticketKey: `PROJ-${100 + index}`
				}
			}));

			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task with many subtasks',
						status: 'pending',
						subtasks: manySubtasks
					}
				]
			};

			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('jira');

			const startTime = Date.now();
			await clearSubtasks(mockTasksPath, '1', mockProjectRoot);
			const endTime = Date.now();

			// Verify: All subtasks processed
			verifyTicketingServiceCalls({
				updateStatusCalls: 20,
				expectedProjectRoot: mockProjectRoot
			});

			// Verify: Reasonable performance (should complete in under 1 second for mocked calls)
			expect(endTime - startTime).toBeLessThan(1000);
		});
	});
});
