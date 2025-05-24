/**
 * Content Update Ticketing Integration Tests
 * Tests the ticketing integration for content update commands:
 * - update-subtask-by-id.js
 * - update-task-by-id.js
 * - update-tasks.js (bulk updates)
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import {
	setupTicketingMocks,
	resetTicketingMocks,
	setupSuccessfulTicketing,
	setupDisabledTicketing,
	setupTicketingError,
	verifyTicketingServiceCalls,
	mockSyncTask,
	mockUpdateTaskStatus,
	mockUpdateTaskContent,
	mockUpdateSubtaskContent,
	mockGetTicketingConfig,
	mockReadJSON,
	mockWriteJSON,
	mockExistsSync,
	mockLog
} from '../../setup/ticketing-mocks.js';
import {
	tasksForContentUpdateTest,
	emptyTasksForCreationTest,
	tasksWithTickets
} from '../../fixtures/ticketing/tasks-with-tickets.js';
import {
	mockAzureConfig,
	mockJiraConfig
} from '../../fixtures/ticketing/ticketing-configs.js';

// Mock process.exit to prevent tests from exiting
const realProcessExit = process.exit;
process.exit = jest.fn();

// Mock AI service
const mockGenerateObjectService = jest.fn();
const mockGenerateTextService = jest.fn();
jest.mock('../../../scripts/modules/ai-services-unified.js', () => ({
	generateObjectService: mockGenerateObjectService.mockResolvedValue({
		mainResult: {
			object: { content: 'Updated content from AI' }
		},
		telemetryData: {
			modelUsed: 'test-model',
			providerName: 'test-provider',
			inputTokens: 100,
			outputTokens: 50,
			totalCost: 0.0012
		}
	}),
	generateTextService: mockGenerateTextService.mockResolvedValue({
		mainResult: {
			text: 'Updated content from AI'
		},
		telemetryData: {
			modelUsed: 'test-model',
			providerName: 'test-provider',
			inputTokens: 100,
			outputTokens: 50,
			totalCost: 0.0012
		}
	})
}));

// Mock generate task files
const mockGenerateTaskFiles = jest.fn().mockResolvedValue(true);
jest.mock('../../../scripts/modules/task-manager/generate-task-files.js', () => ({
	default: mockGenerateTaskFiles
}));

// Mock fs existsSync
jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

// Setup mocks before importing modules under test
setupTicketingMocks();

afterAll(() => {
	// Restore process.exit
	process.exit = realProcessExit;
});

beforeEach(() => {
	resetTicketingMocks();
	jest.clearAllMocks();
	
	// Set up default mocks
	mockReadJSON.mockReturnValue(tasksWithTickets);
	mockExistsSync.mockReturnValue(true);
	fs.existsSync.mockReturnValue(true);
	mockWriteJSON.mockImplementation(() => {});
	mockGenerateTaskFiles.mockClear();
	mockGenerateObjectService.mockClear();
	mockGenerateTextService.mockClear();
});

// Import functions under test AFTER mocks are set up
import updateSubtaskById from '../../../scripts/modules/task-manager/update-subtask-by-id.js';
import updateTaskById from '../../../scripts/modules/task-manager/update-task-by-id.js';
import updateTasks from '../../../scripts/modules/task-manager/update-tasks.js';

describe('Content Update Ticketing Integration', () => {
	const mockProjectRoot = '/test/project';
	const mockTasksPath = '/test/project/tasks/tasks.json';
	const mockSession = { projectRoot: mockProjectRoot };

	describe('Update Subtask Content Integration', () => {
		test('should sync subtask content changes to ticket', async () => {
			// Setup: Mock specific return values for this test
			const updatedData = JSON.parse(JSON.stringify(tasksWithTickets));
			const parentTask = updatedData.tasks.find(t => t.id === 1);
			const subtask = parentTask.subtasks.find(s => s.id === 1);
			subtask.details = 'Updated content from AI';
			
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // Initial read
			mockReadJSON.mockReturnValueOnce(updatedData);     // After update

			// Execute
			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Add new implementation details',
				false,
				mockProjectRoot
			);

			// Verify: Content sync called with right parameters
			expect(mockUpdateSubtaskContent).toHaveBeenCalledWith(
				'1.1',
				expect.objectContaining({
					details: 'Updated content from AI'
				}),
				mockProjectRoot
			);

			// Verify: Tasks data update and file generation
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
		});

		test('should handle subtask content sync failures gracefully', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: Content sync fails
			mockGetTicketingConfig.mockReturnValue(mockAzureConfig);
			mockUpdateSubtaskContent.mockResolvedValue({
				success: false,
				error: 'Content sync failed'
			});

			// Execute: Should not throw error
			await expect(
				updateSubtaskById(
					mockTasksPath,
					'1.1',
					'Update subtask content',
					false,
					'text',
					mockSession,
					mockProjectRoot
				)
			).resolves.not.toThrow();

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();

			// Verify: Warning logged
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not sync content changes to ticket for subtask 1.1'
				)
			);
		});

		test('should not sync when projectRoot is missing', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Execute: Update without projectRoot
			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update subtask content',
				false,
				'text',
				{ projectRoot: null } // No projectRoot
			);

			// Verify: No content sync calls made
			expect(mockUpdateSubtaskContent).not.toHaveBeenCalled();

			// Verify: Core operation still worked
			expect(mockWriteJSON).toHaveBeenCalled();
		});

		test('should work with different ticketing providers', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Test with Jira
			setupSuccessfulTicketing('jira');
			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update for Jira',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			expect(mockUpdateSubtaskContent).toHaveBeenCalledWith(
				'1.1',
				expect.any(Object),
				mockTasksPath,
				mockProjectRoot
			);

			// Reset and test with GitHub
			resetTicketingMocks();
			setupSuccessfulTicketing('github');
			mockReadJSON.mockReturnValue(testTasks);

			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update for GitHub',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			expect(mockUpdateSubtaskContent).toHaveBeenCalledWith(
				'1.1',
				expect.any(Object),
				mockTasksPath,
				mockProjectRoot
			);
		});
	});

	describe('Update Task Content Integration', () => {
		test('should sync task content changes to ticket', async () => {
			// Setup: Mock specific return values for this test
			const updatedData = JSON.parse(JSON.stringify(tasksWithTickets));
			const task = updatedData.tasks.find(t => t.id === 1);
			task.details = 'Updated content from AI';
			
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // Initial read
			mockReadJSON.mockReturnValueOnce(updatedData);     // After update
			setupSuccessfulTicketing('jira');

			// Execute
			await updateTaskById(
				mockTasksPath,
				1, // Pass as integer, not string
				'Add new implementation details',
				false,
				mockProjectRoot
			);

			// Verify: Content sync called with right parameters
			expect(mockUpdateTaskContent).toHaveBeenCalledWith(
				'1',
				expect.objectContaining({
					details: 'Updated content from AI'
				}),
				mockProjectRoot
			);

			// Verify: Tasks data update and file generation
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockGenerateTaskFiles).toHaveBeenCalled();
		});

		test('should handle task content sync failures gracefully', async () => {
			// Setup: Ticketing error
			setupTicketingError('api', 'jira');
			
			// Setup mock data
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // Initial read
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // After update

			// Execute: Should not throw error
			await expect(
				updateTaskById(
					mockTasksPath,
					1, // Pass as integer, not string
					'Add new implementation details',
					false,
					mockProjectRoot
				)
			).resolves.not.toThrow();

			// Verify: Task update still happened despite ticketing failure
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('Failed to update ticket')
			);
		});

		test('should handle network errors gracefully', async () => {
			// Setup: Network error
			setupTicketingError('network', 'azdevops');
			
			// Setup mock data
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // Initial read
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // After update

			await expect(
				updateTaskById(
					mockTasksPath,
					1, // Pass as integer, not string
					'Add new implementation details',
					false,
					mockProjectRoot
				)
			).resolves.not.toThrow();

			// Verify: Error logged but process continued
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('network error')
			);
		});

		test('should not sync when ticketing is disabled', async () => {
			// Setup: Disabled ticketing
			setupDisabledTicketing();
			
			// Setup mock data
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // Initial read
			mockReadJSON.mockReturnValueOnce(tasksWithTickets); // After update

			await updateTaskById(
				mockTasksPath,
				1, // Pass as integer, not string
				'Add new implementation details',
				false,
				mockProjectRoot
			);

			// Verify: Ticketing service not called
			expect(mockUpdateTaskContent).not.toHaveBeenCalled();
			
			// Verify: Normal operation completed
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
		});
	});

	describe('Bulk Update Tasks Content Integration', () => {
		test('should sync content changes for multiple tasks', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Mock bulk update response
			mockGenerateObjectService.mockResolvedValue({
				mainResult: {
					object: {
						updatedTasks: [
							{
								id: 1,
								title: 'Updated Task 1',
								description: 'Bulk updated description',
								details: 'Bulk updated details'
							},
							{
								id: 2,
								title: 'Updated Task 2',
								description: 'Another bulk updated description',
								details: 'Another bulk updated details'
							}
						]
					}
				},
				telemetryData: {}
			});

			// Execute: Bulk update tasks
			await updateTasks(
				mockTasksPath,
				'1',
				'Apply new architecture changes to all tasks',
				false, // useResearch
				'text', // outputFormat
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync called for each updated task
			expect(mockUpdateTaskContent).toHaveBeenCalledTimes(2);
			expect(mockUpdateTaskContent).toHaveBeenNthCalledWith(
				1,
				1,
				expect.objectContaining({
					id: 1,
					title: 'Updated Task 1'
				}),
				mockTasksPath,
				mockProjectRoot
			);
			expect(mockUpdateTaskContent).toHaveBeenNthCalledWith(
				2,
				2,
				expect.objectContaining({
					id: 2,
					title: 'Updated Task 2'
				}),
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Core functionality worked
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockGenerateTaskFiles).toHaveBeenCalled();
		});

		test('should handle mixed success/failure in bulk content sync', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: First sync succeeds, second fails
			mockGetTicketingConfig.mockReturnValue(mockAzureConfig);
			mockUpdateTaskContent
				.mockResolvedValueOnce({ success: true })
				.mockResolvedValueOnce({
					success: false,
					error: 'Content sync failed'
				});

			// Mock bulk update response
			mockGenerateObjectService.mockResolvedValue({
				mainResult: {
					object: {
						updatedTasks: [
							{ id: 1, title: 'Updated Task 1' },
							{ id: 2, title: 'Updated Task 2' }
						]
					}
				},
				telemetryData: {}
			});

			await updateTasks(
				mockTasksPath,
				'1',
				'Bulk update',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Both sync attempts made
			expect(mockUpdateTaskContent).toHaveBeenCalledTimes(2);

			// Verify: Core operation completed
			expect(mockWriteJSON).toHaveBeenCalled();

			// Verify: Warning logged for failed sync
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not sync content changes to ticket for task 2'
				)
			);
		});

		test('should handle MCP vs CLI logging contexts', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'azdevops');

			// Mock MCP context (isMCP = true when mcpLog is present)
			const mcpSession = {
				projectRoot: mockProjectRoot,
				mcpLog: {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn()
				}
			};

			mockGenerateObjectService.mockResolvedValue({
				mainResult: {
					object: {
						updatedTasks: [{ id: 1, title: 'Updated Task' }]
					}
				},
				telemetryData: {}
			});

			await updateTasks(
				mockTasksPath,
				'1',
				'Update',
				false,
				'json',
				mcpSession,
				mockProjectRoot
			);

			// Verify: MCP-style logging used (mcpLog.warn instead of log('warn'))
			expect(mcpSession.mcpLog.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					'Warning: Could not sync content changes to ticket for task 1'
				)
			);
		});

		test('should handle large bulk updates efficiently', async () => {
			// Create many tasks for bulk update
			const manyTasks = Array.from({ length: 10 }, (_, index) => ({
				id: index + 1,
				title: `Task ${index + 1}`,
				status: 'pending',
				externalTicket: {
					system: 'azdevops',
					ticketId: `${700 + index}`,
					ticketKey: `${700 + index}`
				}
			}));

			const testTasks = {
				tasks: manyTasks
			};

			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Mock bulk update response
			const updatedTasks = manyTasks.map((task) => ({
				...task,
				title: `Updated ${task.title}`,
				description: 'Bulk updated'
			}));

			mockGenerateObjectService.mockResolvedValue({
				mainResult: {
					object: { updatedTasks }
				},
				telemetryData: {}
			});

			const startTime = Date.now();
			await updateTasks(
				mockTasksPath,
				'1',
				'Bulk update all',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);
			const endTime = Date.now();

			// Verify: All tasks processed
			expect(mockUpdateTaskContent).toHaveBeenCalledTimes(10);

			// Verify: Reasonable performance (should complete in under 2 seconds for mocked calls)
			expect(endTime - startTime).toBeLessThan(2000);
		});
	});

	describe('Edge Cases and Error Scenarios', () => {
		test('should handle non-existent task/subtask', async () => {
			// Setup
			mockReadJSON.mockReturnValue(tasksWithTickets);
			
			// Execute with non-existent task ID
			await updateTaskById(
				mockTasksPath,
				999, // Pass as integer, not string
				'Test update for non-existent task',
				false,
				mockProjectRoot
			);
			
			// Verify: Appropriate error handling
			expect(mockLog).toHaveBeenCalledWith(
				'error',
				expect.stringContaining('not found')
			);
			
			// Verify: No ticketing calls made
			expect(mockUpdateTaskContent).not.toHaveBeenCalled();
		});

		test('should handle tasks/subtasks without tickets', async () => {
			// Setup: Task without ticket reference
			const tasksWithoutTickets = JSON.parse(JSON.stringify(tasksWithTickets));
			// Remove ticket reference
			const task = tasksWithoutTickets.tasks.find(t => t.id === 1);
			delete task.external;
			
			mockReadJSON.mockReturnValue(tasksWithoutTickets);
			
			// Execute
			await updateTaskById(
				mockTasksPath,
				1, // Pass as integer, not string
				'Update for task without ticket',
				false,
				mockProjectRoot
			);
			
			// Verify: No ticketing calls made
			expect(mockUpdateTaskContent).not.toHaveBeenCalled();
			
			// Verify: Normal task update still happened
			expect(mockWriteJSON).toHaveBeenCalledTimes(1);
		});

		test('should handle AI service failures gracefully', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Mock AI service failure
			mockGenerateTextService.mockRejectedValue(
				new Error('AI service unavailable')
			);

			// Execute: Should not throw error
			await expect(
				updateSubtaskById(
					mockTasksPath,
					'1.1',
					'Update subtask',
					false,
					'text',
					mockSession,
					mockProjectRoot
				)
			).resolves.not.toThrow();

			// Verify: No content sync called (AI update failed)
			expect(mockUpdateSubtaskContent).not.toHaveBeenCalled();
		});

		test('should handle empty update results', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Mock empty bulk update response
			mockGenerateObjectService.mockResolvedValue({
				mainResult: {
					object: {
						updatedTasks: [] // No tasks updated
					}
				},
				telemetryData: {}
			});

			await updateTasks(
				mockTasksPath,
				'1',
				'No changes',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: No content sync calls made (no tasks updated)
			expect(mockUpdateTaskContent).not.toHaveBeenCalled();

			// Verify: Core operation completed
			expect(mockWriteJSON).toHaveBeenCalled();
		});
	});

	describe('Research Mode Integration', () => {
		test('should use research mode when enabled', async () => {
			// Setup
			mockReadJSON.mockReturnValue(tasksWithTickets);
			
			// Execute with research flag
			await updateTaskById(
				mockTasksPath,
				1, // Pass as integer, not string
				'Research-backed update',
				true, // Research flag
				mockProjectRoot
			);
			
			// Verify: AI call used research flag
			expect(mockGenerateObjectService).toHaveBeenCalledWith(
				expect.objectContaining({
					useResearchMode: true
				})
			);
		});
	});

	describe('Logging and Feedback', () => {
		test('should log appropriate success messages', async () => {
			// Setup
			mockReadJSON.mockReturnValue(tasksWithTickets);
			setupSuccessfulTicketing('jira');
			
			// Execute
			await updateTaskById(
				mockTasksPath,
				1, // Pass as integer, not string
				'Update with success logging',
				false,
				mockProjectRoot
			);
			
			// Verify: Success messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'success',
				expect.stringContaining('successfully updated')
			);
			
			expect(mockLog).toHaveBeenCalledWith(
				'success',
				expect.stringContaining('synchronized with ticket')
			);
		});

		test('should log appropriate warning messages for failures', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'azdevops');

			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update subtask',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Warning messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Warning: Could not sync content changes to ticket for subtask 1.1'
				)
			);
		});

		test('should provide detailed error information', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			// Setup: Specific error message
			mockGetTicketingConfig.mockReturnValue(mockAzureConfig);
			mockUpdateTaskContent.mockResolvedValue({
				success: false,
				error: 'Ticket content update failed: Invalid field format'
			});

			await updateTaskById(
				mockTasksPath,
				'1',
				'Update task',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Detailed error information in log
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('Invalid field format')
			);
		});
	});
});
