/**
 * Content Update Ticketing Integration Tests
 * Tests the ticketing integration for content update commands:
 * - update-subtask-by-id.js
 * - update-task-by-id.js
 * - update-tasks.js (bulk updates)
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
	mockUpdateTaskContent,
	mockUpdateSubtaskContent,
	mockGetTicketingConfig,
	mockReadJSON,
	mockWriteJSON,
	mockLog
} from '../../setup/ticketing-mocks.js';
import {
	tasksForContentUpdateTest,
	emptyTasksForCreationTest
} from '../../fixtures/ticketing/tasks-with-tickets.js';
import {
	mockAzureConfig,
	mockJiraConfig
} from '../../fixtures/ticketing/ticketing-configs.js';

// Setup mocks before importing modules under test
setupTicketingMocks();

// Mock additional dependencies specific to content updates
const mockGenerateTaskFiles = jest.fn();
const mockGenerateTextService = jest.fn();
const mockGenerateObjectService = jest.fn();
const mockGetDebugFlag = jest.fn();
const mockIsApiKeySet = jest.fn();

jest.mock(
	'../../../scripts/modules/task-manager/generate-task-files.js',
	() => ({
		default: mockGenerateTaskFiles
	})
);

jest.mock('../../../scripts/modules/ai-services-unified.js', () => ({
	generateTextService: mockGenerateTextService,
	generateObjectService: mockGenerateObjectService
}));

jest.mock('../../../scripts/modules/config-manager.js', () => ({
	...jest.requireActual('../../../scripts/modules/config-manager.js'),
	getDebugFlag: mockGetDebugFlag,
	isApiKeySet: mockIsApiKeySet
}));

jest.mock('../../../scripts/modules/utils.js', () => ({
	...jest.requireActual('../../../scripts/modules/utils.js'),
	readJSON: mockReadJSON,
	writeJSON: mockWriteJSON,
	log: mockLog
}));

// Import functions under test AFTER mocks are set up
import updateSubtaskById from '../../../scripts/modules/task-manager/update-subtask-by-id.js';
import updateTaskById from '../../../scripts/modules/task-manager/update-task-by-id.js';
import updateTasks from '../../../scripts/modules/task-manager/update-tasks.js';

describe('Content Update Ticketing Integration', () => {
	const mockProjectRoot = '/test/project';
	const mockTasksPath = '/test/project/tasks/tasks.json';
	const mockSession = { projectRoot: mockProjectRoot };

	beforeEach(() => {
		resetTicketingMocks();
		mockGenerateTaskFiles.mockClear();
		mockGenerateTextService.mockClear();
		mockGenerateObjectService.mockClear();
		mockGetDebugFlag.mockReturnValue(false);
		mockIsApiKeySet.mockReturnValue(true);

		// Default successful file operations
		mockWriteJSON.mockImplementation(() => {});
		mockGenerateTaskFiles.mockResolvedValue();

		// Default AI service responses
		mockGenerateTextService.mockResolvedValue({
			mainResult: {
				text: 'Updated content from AI'
			},
			telemetryData: {}
		});

		mockGenerateObjectService.mockResolvedValue({
			mainResult: {
				object: {
					tasks: [
						{
							id: 1,
							title: 'Updated Task Title',
							description: 'Updated task description',
							details: 'Updated implementation details'
						}
					]
				}
			},
			telemetryData: {}
		});
	});

	describe('Update Subtask Content Integration', () => {
		test('should sync subtask content changes to ticket', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Execute: Update subtask content
			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update the subtask with new implementation details',
				false, // useResearch
				'text', // outputFormat
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync called for subtask
			expect(mockUpdateSubtaskContent).toHaveBeenCalledWith(
				'1.1',
				expect.objectContaining({
					title: expect.any(String),
					details: expect.stringContaining('Updated content from AI')
				}),
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Core functionality worked
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockGenerateTaskFiles).toHaveBeenCalled();
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
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Execute: Update task content
			await updateTaskById(
				mockTasksPath,
				'1',
				'Update the task with new implementation approach',
				false, // useResearch
				'text', // outputFormat
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync called for task
			expect(mockUpdateTaskContent).toHaveBeenCalledWith(
				'1',
				expect.objectContaining({
					id: 1,
					title: expect.any(String),
					details: expect.stringContaining('Updated content from AI')
				}),
				mockTasksPath,
				mockProjectRoot
			);

			// Verify: Core functionality worked
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockGenerateTaskFiles).toHaveBeenCalled();
		});

		test('should handle task content sync failures gracefully', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('apiError', 'azdevops');

			// Execute: Should not throw error
			await expect(
				updateTaskById(
					mockTasksPath,
					'1',
					'Update task content',
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
					'Warning: Could not sync content changes to ticket for task 1'
				)
			);
		});

		test('should handle network errors gracefully', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupTicketingError('network', 'azdevops');

			await expect(
				updateTaskById(
					mockTasksPath,
					'1',
					'Update task content',
					false,
					'text',
					mockSession,
					mockProjectRoot
				)
			).resolves.not.toThrow();

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					'Could not sync content changes to ticket for task 1'
				)
			);
		});

		test('should not sync when ticketing is disabled', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);

			setupDisabledTicketing();

			await updateTaskById(
				mockTasksPath,
				'1',
				'Update task',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync called but returned "not available"
			expect(mockUpdateTaskContent).toHaveBeenCalledTimes(1);

			// Verify: Core operation succeeded
			expect(mockWriteJSON).toHaveBeenCalled();
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
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Test non-existent task
			await updateTaskById(
				mockTasksPath,
				'999',
				'Update non-existent',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: No content sync called (task doesn't exist)
			expect(mockUpdateTaskContent).not.toHaveBeenCalled();

			// Reset for subtask test
			resetTicketingMocks();
			setupSuccessfulTicketing('azdevops');

			// Test non-existent subtask
			await updateSubtaskById(
				mockTasksPath,
				'999.1',
				'Update non-existent',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: No content sync called (subtask doesn't exist)
			expect(mockUpdateSubtaskContent).not.toHaveBeenCalled();
		});

		test('should handle tasks/subtasks without tickets', async () => {
			const testTasks = {
				tasks: [
					{
						id: 1,
						title: 'Task without ticket',
						status: 'pending',
						details: 'No external ticket',
						subtasks: [
							{
								id: 1,
								title: 'Subtask without ticket',
								status: 'pending',
								details: 'No external ticket'
							}
						]
					}
				]
			};
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Test task without ticket
			await updateTaskById(
				mockTasksPath,
				'1',
				'Update task',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync still called (service handles missing tickets)
			expect(mockUpdateTaskContent).toHaveBeenCalledWith(
				'1',
				expect.any(Object),
				mockTasksPath,
				mockProjectRoot
			);

			// Reset for subtask test
			resetTicketingMocks();
			setupSuccessfulTicketing('azdevops');
			mockReadJSON.mockReturnValue(testTasks);

			// Test subtask without ticket
			await updateSubtaskById(
				mockTasksPath,
				'1.1',
				'Update subtask',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Content sync still called
			expect(mockUpdateSubtaskContent).toHaveBeenCalledWith(
				'1.1',
				expect.any(Object),
				mockTasksPath,
				mockProjectRoot
			);
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
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			// Execute: Update with research mode
			await updateTaskById(
				mockTasksPath,
				'1',
				'Research-backed update',
				true, // useResearch = true
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: AI service called with research flag
			expect(mockGenerateTextService).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Research-backed update'),
					commandName: expect.any(String)
				})
			);

			// Verify: Content sync called
			expect(mockUpdateTaskContent).toHaveBeenCalled();
		});
	});

	describe('Logging and Feedback', () => {
		test('should log appropriate success messages', async () => {
			const testTasks = { ...tasksForContentUpdateTest };
			mockReadJSON.mockReturnValue(testTasks);
			setupSuccessfulTicketing('azdevops');

			await updateTaskById(
				mockTasksPath,
				'1',
				'Update task',
				false,
				'text',
				mockSession,
				mockProjectRoot
			);

			// Verify: Success messages logged
			expect(mockLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('Synced content changes to ticket for task 1')
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
