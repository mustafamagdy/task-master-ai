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

// Mock functions for ticketing service operations
export const mockSyncTask = jest.fn();
export const mockUpdateTaskStatus = jest.fn();
export const mockUpdateTaskContent = jest.fn();
export const mockUpdateSubtaskContent = jest.fn();
export const mockGetTicketingConfig = jest.fn();

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

// Mock HTTP client for API calls
export const mockAxios = {
	post: jest.fn(),
	put: jest.fn(),
	patch: jest.fn(),
	get: jest.fn(),
	delete: jest.fn()
};

// Mock axios create function
export const mockAxiosCreate = jest.fn(() => mockAxios);

// Mock file system operations for configs
export const mockReadJSON = jest.fn();
export const mockWriteJSON = jest.fn();
export const mockExistsSync = jest.fn();
export const mockLog = jest.fn();

/**
 * Setup all ticketing-related mocks
 * Call this in beforeEach or at the start of test files
 */
export const setupTicketingMocks = () => {
	// Mock axios for HTTP requests
	jest.mock('axios', () => ({
		default: {
			create: mockAxiosCreate
		},
		create: mockAxiosCreate
	}));

	// Mock the main ticketing sync service
	jest.mock(
		'../../scripts/modules/ticketing/ticketing-sync-service.js',
		() => ({
			default: {
				syncTask: mockSyncTask,
				updateTaskStatus: mockUpdateTaskStatus,
				updateTaskContent: mockUpdateTaskContent,
				updateSubtaskContent: mockUpdateSubtaskContent
			}
		})
	);

	// Mock individual ticketing provider services
	jest.mock('../../scripts/modules/ticketing/jira/jira-service.js', () => ({
		default: mockJiraService
	}));

	jest.mock('../../scripts/modules/ticketing/github/github-service.js', () => ({
		default: mockGitHubService
	}));

	jest.mock(
		'../../scripts/modules/ticketing/azdevops/azdevops-service.js',
		() => ({
			default: mockAzureDevOpsService
		})
	);

	// Mock configuration manager for ticketing configs
	jest.mock('../../scripts/modules/config-manager.js', () => ({
		...jest.requireActual('../../scripts/modules/config-manager.js'),
		getTicketingConfig: mockGetTicketingConfig
	}));

	// Mock utils for file operations
	jest.mock('../../scripts/modules/utils.js', () => ({
		...jest.requireActual('../../scripts/modules/utils.js'),
		readJSON: mockReadJSON,
		writeJSON: mockWriteJSON,
		log: mockLog
	}));

	// Mock fs for config file checks
	jest.mock('fs', () => ({
		...jest.requireActual('fs'),
		existsSync: mockExistsSync
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

	// Reset HTTP mocks
	Object.values(mockAxios).forEach((mock) => mock.mockClear());
	mockAxiosCreate.mockClear();

	// Reset file system mocks
	mockReadJSON.mockClear();
	mockWriteJSON.mockClear();
	mockExistsSync.mockClear();
	mockLog.mockClear();
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
	} else {
		mockSyncTask.mockResolvedValue(error);
		mockUpdateTaskStatus.mockResolvedValue(error);
		mockUpdateTaskContent.mockResolvedValue(error);
		mockUpdateSubtaskContent.mockResolvedValue(error);
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
