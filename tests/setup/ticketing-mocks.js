/**
 * Universal Mock Setup for Ticketing Services
 * Provides consistent mocking patterns across all ticketing integration tests
 */

import { jest } from '@jest/globals';
import {
	successResponses,
	errorResponses,
	commonErrorScenarios
} from '../fixtures/ticketing/ticketing-responses.js';
import {
	mockJiraConfig,
	mockGitHubConfig,
	mockAzureConfig,
	mockDisabledConfig
} from '../fixtures/ticketing/ticketing-configs.js';
import { tasksWithTickets } from '../fixtures/ticketing/tasks-with-tickets.js';

// Mock functions for ticketing service operations
export const mockSyncTask = jest.fn();
export const mockSyncSubtask = jest.fn();
export const mockSyncMultipleTasks = jest.fn();
export const mockUpdateTaskStatus = jest.fn();
export const mockUpdateTaskContent = jest.fn();
export const mockUpdateSubtaskContent = jest.fn();
export const mockGetTicketingConfig = jest.fn();
export const mockInitialize = jest.fn().mockResolvedValue(true);
export const mockIsAvailable = jest.fn().mockReturnValue(true);
export const mockGetStatus = jest.fn().mockReturnValue({ ready: true });
export const mockIsReady = jest.fn().mockReturnValue(true);
export const mockCreateTicketingInstance = jest.fn();
export const mockIsConfigured = jest.fn().mockReturnValue(true);
export const mockValidateConfig = jest.fn().mockReturnValue(true);
export const mockGetConfig = jest.fn();
export const mockCreateStory = jest.fn().mockResolvedValue({ key: 'TEST-123', id: '123' });
export const mockMapPriorityToTicket = jest.fn();
export const mockFormatTitleForTicket = jest.fn();
export const mockStoreTicketId = jest.fn();
export const mockGetTicketId = jest.fn();
export const mockMapStatusToTicket = jest.fn();
export const mockGetAllTickets = jest.fn();
export const mockGetTicketStatus = jest.fn();
export const mockMapTicketStatusToTaskmaster = jest.fn();
export const mockMapTicketPriorityToTaskmaster = jest.fn();
export const mockUpdateTicketStatus = jest.fn();
export const mockCreateTask = jest.fn().mockResolvedValue({ key: 'TEST-123', id: '123' });
export const mockFindTicketByRefId = jest.fn();
export const mockFindSubtaskByRefId = jest.fn();
export const mockUpdateTicketDetails = jest.fn();
export const mockGetTicketingSystemType = jest.fn().mockReturnValue('jira');
export const mockIsTicketingEnabled = jest.fn().mockReturnValue(true);

// Mock functions for individual ticketing provider services
export const mockJiraService = {
	createIssue: jest.fn(),
	updateIssue: jest.fn(),
	updateIssueContent: jest.fn(),
	validateConfig: jest.fn()
};

export const mockGitHubService = {
	createIssue: jest.fn(),
	updateIssue: jest.fn(),
	updateIssueContent: jest.fn(),
	validateConfig: jest.fn()
};

export const mockAzureDevOpsService = {
	createWorkItem: jest.fn(),
	updateWorkItem: jest.fn(),
	updateWorkItemContent: jest.fn(),
	validateConfig: jest.fn()
};

// Mock fetch API for HTTP calls
export const mockFetch = jest.fn();

// Mock file system operations for configs
export const mockReadJSON = jest.fn();
export const mockWriteJSON = jest.fn();
export const mockExistsSync = jest.fn();
export const mockLog = jest.fn();
export const mockFindProjectRoot = jest.fn().mockReturnValue('/test/project');

// Add these mock functions after mockUpdateTaskStatus if they don't exist
export const mockDeleteTicket = jest.fn().mockResolvedValue(true);
export const mockTicketExists = jest.fn().mockResolvedValue(true);

/**
 * Set up the common mocks for ticketing tests
 */
export const setupTicketingMocks = () => {
	// Mock the ticketing-sync-service
	jest.mock('../../../scripts/modules/ticketing/ticketing-sync-service.js', () => ({
		default: {
			initialize: mockInitialize,
			isAvailable: mockIsAvailable,
			getStatus: mockGetStatus,
			isReady: mockIsReady,
			syncTask: mockSyncTask,
			syncSubtask: mockSyncSubtask,
			syncMultipleTasks: mockSyncMultipleTasks,
			updateTaskStatus: mockUpdateTaskStatus,
			updateTaskContent: mockUpdateTaskContent,
			updateSubtaskContent: mockUpdateSubtaskContent,
			deleteTicket: mockDeleteTicket
		},
		TicketingSyncService: jest.fn().mockImplementation(() => ({
			initialize: mockInitialize,
			isAvailable: mockIsAvailable,
			getStatus: mockGetStatus,
			isReady: mockIsReady,
			syncTask: mockSyncTask,
			syncSubtask: mockSyncSubtask,
			syncMultipleTasks: mockSyncMultipleTasks,
			updateTaskStatus: mockUpdateTaskStatus,
			updateTaskContent: mockUpdateTaskContent,
			updateSubtaskContent: mockUpdateSubtaskContent,
			deleteTicket: mockDeleteTicket
		}))
	}));

	// Mock the ticketing-factory
	jest.mock('../../../scripts/modules/ticketing/ticketing-factory.js', () => ({
		default: {
			createTicketingInstance: mockCreateTicketingInstance
		}
	}));

	// Mock the jira-ticketing module
	jest.mock('../../../scripts/modules/ticketing/jira/jira-ticketing.js', () => ({
		default: {
			isConfigured: mockIsConfigured,
			validateConfig: mockValidateConfig,
			getConfig: mockGetConfig,
			createStory: mockCreateStory,
			mapPriorityToTicket: mockMapPriorityToTicket,
			formatTitleForTicket: mockFormatTitleForTicket,
			storeTicketId: mockStoreTicketId,
			getTicketId: mockGetTicketId,
			mapStatusToTicket: mockMapStatusToTicket,
			getAllTickets: mockGetAllTickets,
			getTicketStatus: mockGetTicketStatus,
			mapTicketStatusToTaskmaster: mockMapTicketStatusToTaskmaster,
			mapTicketPriorityToTaskmaster: mockMapTicketPriorityToTaskmaster,
			updateTicketStatus: mockUpdateTicketStatus,
			createTask: mockCreateTask,
			ticketExists: mockTicketExists,
			findTicketByRefId: mockFindTicketByRefId,
			updateTicketDetails: mockUpdateTicketDetails,
			deleteTicket: mockDeleteTicket
		}
	}));

	// Mock the github-ticketing module
	jest.mock('../../../scripts/modules/ticketing/github/github-ticketing.js', () => ({
		default: {
			isConfigured: mockIsConfigured,
			validateConfig: mockValidateConfig,
			getConfig: mockGetConfig,
			createStory: mockCreateStory,
			mapPriorityToTicket: mockMapPriorityToTicket,
			formatTitleForTicket: mockFormatTitleForTicket,
			storeTicketId: mockStoreTicketId,
			getTicketId: mockGetTicketId,
			mapStatusToTicket: mockMapStatusToTicket,
			getAllTickets: mockGetAllTickets,
			getTicketStatus: mockGetTicketStatus,
			mapTicketStatusToTaskmaster: mockMapTicketStatusToTaskmaster,
			mapTicketPriorityToTaskmaster: mockMapTicketPriorityToTaskmaster,
			updateTicketStatus: mockUpdateTicketStatus,
			createTask: mockCreateTask,
			ticketExists: mockTicketExists,
			findTicketByRefId: mockFindTicketByRefId,
			updateTicketDetails: mockUpdateTicketDetails,
			deleteTicket: mockDeleteTicket
		}
	}));

	// Mock the azdevops-ticketing module
	jest.mock('../../../scripts/modules/ticketing/azdevops/azdevops-ticketing.js', () => ({
		default: {
			isConfigured: mockIsConfigured,
			validateConfig: mockValidateConfig,
			getConfig: mockGetConfig,
			createStory: mockCreateStory,
			mapPriorityToTicket: mockMapPriorityToTicket,
			formatTitleForTicket: mockFormatTitleForTicket,
			storeTicketId: mockStoreTicketId,
			getTicketId: mockGetTicketId,
			mapStatusToTicket: mockMapStatusToTicket,
			getAllTickets: mockGetAllTickets,
			getTicketStatus: mockGetTicketStatus,
			mapTicketStatusToTaskmaster: mockMapTicketStatusToTaskmaster,
			mapTicketPriorityToTaskmaster: mockMapTicketPriorityToTaskmaster,
			updateTicketStatus: mockUpdateTicketStatus,
			createTask: mockCreateTask,
			ticketExists: mockTicketExists,
			findTicketByRefId: mockFindTicketByRefId,
			updateTicketDetails: mockUpdateTicketDetails,
			deleteTicket: mockDeleteTicket
		}
	}));

	// Mock the utils module
	jest.mock('../../../scripts/modules/utils.js', () => ({
		log: mockLog,
		readJSON: mockReadJSON,
		writeJSON: mockWriteJSON,
		findProjectRoot: mockFindProjectRoot,
		existsSync: mockExistsSync
	}));

	// Mock the config-manager module
	jest.mock('../../../scripts/modules/config-manager.js', () => ({
		getTicketingSystemType: mockGetTicketingSystemType,
		isTicketingEnabled: mockIsTicketingEnabled,
		getConfig: mockGetTicketingConfig
	}));
};

/**
 * Reset all ticketing mocks to their default state
 * Call this in beforeEach to ensure clean test state
 */
export const resetTicketingMocks = () => {
	// Clear all mock calls and reset implementations
	mockSyncTask.mockClear();
	mockUpdateTaskStatus.mockClear();
	mockUpdateTaskContent.mockClear();
	mockUpdateSubtaskContent.mockClear();
	mockGetTicketingConfig.mockClear();

	// Reset provider service mocks
	Object.values(mockJiraService).forEach((mock) => mock.mockClear());
	Object.values(mockGitHubService).forEach((mock) => mock.mockClear());
	Object.values(mockAzureDevOpsService).forEach((mock) => mock.mockClear());

	// Reset fetch mock
	mockFetch.mockClear();

	// Reset file system mocks
	mockReadJSON.mockClear();
	mockWriteJSON.mockClear();
	mockExistsSync.mockClear();
	mockLog.mockClear();

	// Reset default implementations
	mockExistsSync.mockReturnValue(true); // Default to files existing
	mockReadJSON.mockReturnValue(tasksWithTickets); // Return mock tasks data
};

/**
 * Configure mocks for successful ticketing operations
 * @param {string} provider - 'jira', 'github', or 'azdevops'
 */
export const setupSuccessfulTicketing = (provider = 'jira') => {
	const config = {
		jira: mockJiraConfig,
		github: mockGitHubConfig,
		azdevops: mockAzureConfig
	}[provider];

	const responses = successResponses[provider];

	// Configure main service mocks for success
	mockGetTicketingConfig.mockReturnValue(config);
	mockSyncTask.mockResolvedValue(responses.syncTask);
	mockUpdateTaskStatus.mockResolvedValue(responses.updateStatus);
	mockUpdateTaskContent.mockResolvedValue(responses.updateContent);
	mockUpdateSubtaskContent.mockResolvedValue(responses.updateContent);

	// Configure provider-specific mocks
	if (provider === 'jira') {
		mockJiraService.createIssue.mockResolvedValue(responses.syncTask);
		mockJiraService.updateIssue.mockResolvedValue(responses.updateStatus);
		mockJiraService.updateIssueContent.mockResolvedValue(
			responses.updateContent
		);
		mockJiraService.validateConfig.mockReturnValue(true);
	} else if (provider === 'github') {
		mockGitHubService.createIssue.mockResolvedValue(responses.syncTask);
		mockGitHubService.updateIssue.mockResolvedValue(responses.updateStatus);
		mockGitHubService.updateIssueContent.mockResolvedValue(
			responses.updateContent
		);
		mockGitHubService.validateConfig.mockReturnValue(true);
	} else if (provider === 'azdevops') {
		mockAzureDevOpsService.createWorkItem.mockResolvedValue(responses.syncTask);
		mockAzureDevOpsService.updateWorkItem.mockResolvedValue(
			responses.updateStatus
		);
		mockAzureDevOpsService.updateWorkItemContent.mockResolvedValue(
			responses.updateContent
		);
		mockAzureDevOpsService.validateConfig.mockReturnValue(true);
	}

	// Configure file system mocks
	mockExistsSync.mockReturnValue(true);

	// Configure fetch mock for successful HTTP requests
	mockFetch.mockResolvedValue({
		ok: true,
		status: 200,
		json: jest.fn().mockResolvedValue(responses.syncTask),
		text: jest.fn().mockResolvedValue('Success')
	});
};

/**
 * Configure mocks for disabled ticketing
 */
export const setupDisabledTicketing = () => {
	mockGetTicketingConfig.mockReturnValue(mockDisabledConfig);
	mockSyncTask.mockResolvedValue(errorResponses.ticketingNotAvailable);
	mockUpdateTaskStatus.mockResolvedValue(errorResponses.ticketingNotAvailable);
	mockUpdateTaskContent.mockResolvedValue(errorResponses.ticketingNotAvailable);
	mockUpdateSubtaskContent.mockResolvedValue(
		errorResponses.ticketingNotAvailable
	);
};

/**
 * Configure mocks for ticketing errors
 * @param {string} errorType - Type of error to simulate
 * @param {string} provider - Provider to simulate error for
 */
export const setupTicketingError = (
	errorType = 'apiError',
	provider = 'jira'
) => {
	const config = {
		jira: mockJiraConfig,
		github: mockGitHubConfig,
		azdevops: mockAzureConfig
	}[provider];

	mockGetTicketingConfig.mockReturnValue(config);

	const error =
		errorType === 'network'
			? commonErrorScenarios.networkError
			: errorResponses[errorType] || errorResponses.apiError;

	// Configure main service mocks for errors
	if (errorType === 'network' || errorType === 'timeout') {
		mockSyncTask.mockRejectedValue(error);
		mockUpdateTaskStatus.mockRejectedValue(error);
		mockUpdateTaskContent.mockRejectedValue(error);
		mockUpdateSubtaskContent.mockRejectedValue(error);

		// Configure fetch mock for network errors
		mockFetch.mockRejectedValue(error);
	} else {
		mockSyncTask.mockResolvedValue(error);
		mockUpdateTaskStatus.mockResolvedValue(error);
		mockUpdateTaskContent.mockResolvedValue(error);
		mockUpdateSubtaskContent.mockResolvedValue(error);

		// Configure fetch mock for API errors
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: jest.fn().mockResolvedValue(error),
			text: jest.fn().mockResolvedValue(JSON.stringify(error))
		});
	}
};

/**
 * Configure mocks for mixed success/failure scenarios
 * Useful for testing partial failures in bulk operations
 */
export const setupMixedTicketingResults = (provider = 'jira') => {
	const config = {
		jira: mockJiraConfig,
		github: mockGitHubConfig,
		azdevops: mockAzureConfig
	}[provider];

	const responses = successResponses[provider];

	mockGetTicketingConfig.mockReturnValue(config);

	// First call succeeds, second fails, third succeeds
	mockUpdateTaskStatus
		.mockResolvedValueOnce(responses.updateStatus)
		.mockResolvedValueOnce(errorResponses.apiError)
		.mockResolvedValueOnce(responses.updateStatus);

	mockSyncTask.mockResolvedValue(responses.syncTask);
	mockUpdateTaskContent.mockResolvedValue(responses.updateContent);
};

/**
 * Verify that ticketing service was called with expected parameters
 * @param {Object} expectations - Expected call parameters
 */
export const verifyTicketingServiceCalls = (expectations) => {
	const {
		syncTaskCalls = 0,
		updateStatusCalls = 0,
		updateContentCalls = 0,
		expectedTaskIds = [],
		expectedStatuses = [],
		expectedProjectRoot = null
	} = expectations;

	// Verify call counts
	if (syncTaskCalls > 0) {
		expect(mockSyncTask).toHaveBeenCalledTimes(syncTaskCalls);
	}

	if (updateStatusCalls > 0) {
		expect(mockUpdateTaskStatus).toHaveBeenCalledTimes(updateStatusCalls);
	}

	if (updateContentCalls > 0) {
		expect(mockUpdateTaskContent).toHaveBeenCalledTimes(updateContentCalls);
	}

	// Verify specific call parameters
	expectedTaskIds.forEach((taskId, index) => {
		if (updateStatusCalls > index) {
			expect(mockUpdateTaskStatus).toHaveBeenNthCalledWith(
				index + 1,
				taskId,
				expectedStatuses[index] || expect.any(String),
				expect.any(String), // tasksPath
				expectedProjectRoot || expect.any(String)
			);
		}
	});

	// Verify projectRoot was passed correctly
	if (expectedProjectRoot) {
		if (syncTaskCalls > 0) {
			expect(mockSyncTask).toHaveBeenCalledWith(
				expect.any(Object), // task object
				expect.any(String), // tasksPath
				expectedProjectRoot
			);
		}
	}
};

/**
 * Create a helper for testing ticketing integration in any command
 * @param {Function} commandFunction - The command function to test
 * @param {Object} testParams - Parameters for the test
 */
export const createTicketingIntegrationTest = (commandFunction, testParams) => {
	return {
		async testSuccessfulIntegration(provider = 'jira') {
			setupSuccessfulTicketing(provider);

			const result = await commandFunction(testParams);

			// Verify the command succeeded
			expect(result).toBeDefined();
			// Add specific assertions based on command type

			return result;
		},

		async testDisabledTicketing() {
			setupDisabledTicketing();

			const result = await commandFunction(testParams);

			// Verify the command succeeded despite disabled ticketing
			expect(result).toBeDefined();
			expect(mockLog).not.toHaveBeenCalledWith('error', expect.any(String));

			return result;
		},

		async testTicketingFailure() {
			setupTicketingError('apiError');

			const result = await commandFunction(testParams);

			// Verify the command succeeded despite ticketing failure
			expect(result).toBeDefined();
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining('Warning:')
			);

			return result;
		}
	};
};
