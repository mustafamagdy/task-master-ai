/**
 * Remove Subtask Ticketing Integration Tests
 * Tests the ticketing integration for the remove-subtask command
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
	mockGetTicketingConfig,
	mockReadJSON,
	mockWriteJSON,
	mockLog
} from '../../setup/ticketing-mocks.js';
import {
	tasksForRemoveSubtaskTest,
	emptyTasksForCreationTest
} from '../../fixtures/ticketing/tasks-with-tickets.js';
import {
	mockJiraConfig,
	mockGitHubConfig
} from '../../fixtures/ticketing/ticketing-configs.js';

// Setup mocks before importing the module under test
setupTicketingMocks();

// Mock additional dependencies specific to remove-subtask
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
import removeSubtask from '../../../scripts/modules/task-manager/remove-subtask.js';

describe('Remove Subtask Ticketing Integration', () => {
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

	describe('Remove Subtask - Ticket Cancellation', () => {
		test('should cancel ticket when removing subtask', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			// Execute: Remove subtask 1.1 (first subtask)
			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Ticket cancelled for removed subtask
			verifyTicketingServiceCalls({
				updateStatusCalls: 1,
				expectedTaskIds: ['1.1'],
				expectedStatuses: ['cancelled'],
				expectedProjectRoot: mockProjectRoot
			});

			// Verify: Core functionality worked - subtask removed
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 1,
							subtasks: expect.arrayContaining([
								expect.objectContaining({
									id: 2,
									title: 'Subtask to convert to task'
								})
							])
						})
					])
				})
			);

			expect(mockGenerateTaskFiles).toHaveBeenCalledWith(
				mockTasksPath,
				expect.any(String)
			);
		});

		test('should handle multiple subtask removals', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			// Execute: Remove multiple subtasks
			await removeSubtask(
				mockTasksPath,
				'1.1,1.2',
				false,
				true,
				mockProjectRoot
			);

			// Verify: Tickets cancelled for both removed subtasks
			verifyTicketingServiceCalls({
				updateStatusCalls: 2,
				expectedTaskIds: ['1.1', '1.2'],
				expectedStatuses: ['cancelled', 'cancelled'],
				expectedProjectRoot: mockProjectRoot
			});
		});

		test('should work with different ticketing providers', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Test with Jira
			setupSuccessfulTicketing('jira');
			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			verifyTicketingServiceCalls({
				updateStatusCalls: 1,
				expectedProjectRoot: mockProjectRoot
			});

			// Reset and test with Azure DevOps
			resetTicketingMocks();
			setupSuccessfulTicketing('azdevops');
			mockReadJSON.mockReturnValue(testTasks);

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			verifyTicketingServiceCalls({
				updateStatusCalls: 1,
				expectedProjectRoot: mockProjectRoot
			});
		});
	});

	describe('Convert Subtask to Task - Ticket Creation', () => {
		test('should cancel old ticket and create new ticket when converting subtask to task', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			// Execute: Convert subtask to task
			const result = await removeSubtask(
				mockTasksPath,
				'1.2',
				true,
				true,
				mockProjectRoot
			);

			// Verify: Old ticket cancelled and new ticket created
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.2',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);
			expect(mockSyncTask).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Subtask to convert to task',
					status: 'in-progress'
				}),
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Function returned the converted task
			expect(result).toEqual(
				expect.objectContaining({
					title: 'Subtask to convert to task'
				})
			);
		});

		test('should handle conversion when new task ID is assigned correctly', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			// Mock successful ticket creation
			mockSyncTask.mockResolvedValue({
				success: true,
				ticketKey: '600',
				ticketUrl: 'https://github.com/owner/repo/issues/600'
			});

			await removeSubtask(mockTasksPath, '1.2', true, true, mockProjectRoot);

			// Verify: New task was created with next available ID
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 2, // Should be the next available ID
							title: 'Subtask to convert to task',
							status: 'in-progress'
						})
					])
				})
			);

			// Verify: Success message logged
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Created ticket 600 for converted task 2')
			);
		});

		test('should handle conversion failure gracefully', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: Cancellation succeeds but creation fails
			mockGetTicketingConfig.mockReturnValue(mockGitHubConfig);
			mockUpdateTaskStatus.mockResolvedValue({ success: true });
			mockSyncTask.mockResolvedValue({ success: false, error: 'API error' });

			await removeSubtask(mockTasksPath, '1.2', true, true, mockProjectRoot);

			// Verify: Conversion still completed (core functionality)
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 2,
							title: 'Subtask to convert to task'
						})
					])
				})
			);

			// Verify: Warning logged for ticket creation failure
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not create ticket for converted task'
				)
			);
		});
	});

	describe('Error Handling', () => {
		test('should handle ticketing failures gracefully for removal', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'github');

			// Execute: Should not throw error
			await expect(
				removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot)
			).resolves.not.toThrow();

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not update ticket status for removed subtask 1.1'
				)
			);
		});

		test('should handle network errors gracefully', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('network', 'github');

			await expect(
				removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot)
			).resolves.not.toThrow();

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Could not update ticket status for removed subtask 1.1'
				)
			);
		});

		test('should handle partial failures in conversion', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: Cancellation fails but creation succeeds
			mockGetTicketingConfig.mockReturnValue(mockGitHubConfig);
			mockUpdateTaskStatus.mockRejectedValue(new Error('Cancellation failed'));
			mockSyncTask.mockResolvedValue({ success: true, ticketKey: '600' });

			await removeSubtask(mockTasksPath, '1.2', true, true, mockProjectRoot);

			// Verify: Both operations were attempted
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.2',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);
			expect(mockSyncTask).toHaveBeenCalled();

			// Verify: Core conversion completed
			expect(mockWriteJSON).toHaveBeenCalled();

			// Verify: Warnings logged for failed operations
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Could not update ticket status for removed subtask 1.2'
				)
			);
		});
	});

	describe('Disabled Ticketing', () => {
		test('should not call ticketing when projectRoot is missing', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Execute: Remove subtask without projectRoot
			await removeSubtask(mockTasksPath, '1.1', false, true); // No projectRoot parameter

			// Verify: No ticketing calls made
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
			expect(mockSyncTask).not.toHaveBeenCalled();

			// Verify: Core operation still worked
			expect(mockWriteJSON).toHaveBeenCalled();
		});

		test('should not call ticketing when ticketing is disabled', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupDisabledTicketing();

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Ticketing calls were made but returned "not available"
			expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(1);

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
		});

		test('should handle disabled ticketing for conversion', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupDisabledTicketing();

			await removeSubtask(mockTasksPath, '1.2', true, true, mockProjectRoot);

			// Verify: Both ticketing calls attempted but returned "not available"
			expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(1);
			expect(mockSyncTask).toHaveBeenCalledTimes(1);

			// Verify: Core conversion succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		test('should handle non-existent subtask', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.999', false, true, mockProjectRoot);

			// Verify: No ticketing calls made (subtask doesn't exist)
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();

			// Verify: Error logged
			expect(mockLog).toHaveBeenCalledWith(
				'error',
				expect.stringContaining('Subtask 999 not found in parent task 1')
			);
		});

		test('should handle invalid subtask ID format', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(
				mockTasksPath,
				'invalid',
				false,
				true,
				mockProjectRoot
			);

			// Verify: No ticketing calls made
			expect(mockUpdateTaskStatus).not.toHaveBeenCalled();

			// Verify: Error logged
			expect(mockLog).toHaveBeenCalledWith(
				'error',
				expect.stringContaining('Invalid subtask ID format')
			);
		});

		test('should handle subtask without ticket', async () => {
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task with subtask without ticket',
						status: 'pending',
						subtasks: [
							{
								id: 1,
								title: 'Subtask without external ticket',
								status: 'pending'
								// No externalTicket property
							}
						]
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Ticketing call still made (service handles missing tickets)
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.1',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Core operation completed
			expect(mockWriteJSON).toHaveBeenCalled();
		});

		test('should handle last subtask removal - parent subtasks array cleanup', async () => {
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task with single subtask',
						status: 'pending',
						subtasks: [
							{
								id: 1,
								title: 'Only subtask',
								status: 'pending',
								externalTicket: {
									system: 'github',
									ticketId: '700',
									ticketKey: '700'
								}
							}
						]
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Ticket cancelled
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.1',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Parent task subtasks array removed when empty
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 1
							// subtasks property should be deleted when empty
						})
					])
				})
			);
		});

		test('should handle conversion with duplicate task IDs', async () => {
			// Create scenario where converted task would have an existing ID
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Parent task',
						status: 'pending',
						subtasks: [
							{
								id: 1,
								title: 'Subtask to convert',
								status: 'pending',
								externalTicket: {
									system: 'github',
									ticketId: '800',
									ticketKey: '800'
								}
							}
						]
					},
					{
						id: 2,
						title: 'Existing task with ID 2',
						status: 'done'
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.1', true, true, mockProjectRoot);

			// Verify: New task gets next available ID (3, not 2)
			expect(mockWriteJSON).toHaveBeenCalledWith(
				mockTasksPath,
				expect.objectContaining({
					tasks: expect.arrayContaining([
						expect.objectContaining({
							id: 3, // Should be 3, not 2
							title: 'Subtask to convert'
						})
					])
				})
			);
		});
	});

	describe('File Generation Control', () => {
		test('should respect generateFiles flag', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			// Execute: With generateFiles = false
			await removeSubtask(mockTasksPath, '1.1', false, false, mockProjectRoot);

			// Verify: Ticketing still called
			expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
				'1.1',
				'cancelled',
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Files not generated
			expect(mockGenerateTaskFiles).not.toHaveBeenCalled();

			// Reset for positive test
			resetTicketingMocks();
			setupSuccessfulTicketing('github');
			mockReadJSON.mockReturnValue(testTasks);

			// Execute: With generateFiles = true (default)
			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Files generated
			expect(mockGenerateTaskFiles).toHaveBeenCalled();
		});
	});

	describe('Logging and Feedback', () => {
		test('should log appropriate success messages for removal', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Success messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining(
					"Updated ticket status to 'cancelled' for subtask 1.1"
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Successfully removed subtask 1.1')
			);
		});

		test('should log appropriate success messages for conversion', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('github');

			await removeSubtask(mockTasksPath, '1.2', true, true, mockProjectRoot);

			// Verify: Success messages logged for both operations
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining(
					"Updated ticket status to 'cancelled' for subtask 1.2"
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Created ticket 456 for converted task')
			);
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Created new task 2 from subtask 1.2')
			);
		});

		test('should log appropriate warning messages for failures', async () => {
			const testTasks = { ...tasksForRemoveSubtaskTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'github');

			await removeSubtask(mockTasksPath, '1.1', false, true, mockProjectRoot);

			// Verify: Warning messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not update ticket status for removed subtask 1.1'
				)
			);
		});
	});
});
