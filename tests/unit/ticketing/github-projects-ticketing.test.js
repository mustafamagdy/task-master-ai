import GitHubProjectsTicketing from '../../../../scripts/modules/ticketing/github/github-projects-ticketing.js';
import * as configManager from '../../../../scripts/modules/config-manager.js';
import { log } from '../../../../scripts/modules/utils.js';
import https from 'https';

// Mock dependencies
jest.mock('https');
jest.mock('../../../../scripts/modules/config-manager.js');
jest.mock('../../../../scripts/modules/utils.js', () => ({
  log: jest.fn(),
}));

describe('GitHubProjectsTicketing', () => {
  let ticketingSystem;
  let mockHttpsRequest;
  let mockCurrentConfig; // Used to simulate what getConfig() would return within methods

  // Helper function to simulate https.request response
  // This should be defined outside beforeEach or be a stable reference if used inside.
  const mockApiResponse = (statusCode, responseBody, headers = { 'content-type': 'application/json' }) => {
    const res = {
      statusCode,
      headers,
      on: jest.fn((event, callback) => {
        if (event === 'data' && responseBody) { // Check responseBody existence
          callback(Buffer.from(JSON.stringify(responseBody))); // Use Buffer for data event
        }
        if (event === 'end') {
          callback();
        }
      }),
      statusMessage: `Status ${statusCode}`,
    };
    const req = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(() => {
        // Simulate the 'end' event being triggered after 'data' if applicable
        const endCallback = res.on.mock.calls.find(call => call[0] === 'end');
        if (endCallback) endCallback[1]();
      }),
    };
    // Ensure https.request is mocked for THIS call only unless more sophisticated setup is done
    https.request.mockImplementationOnce((options, callback) => {
      if (callback) callback(res); // Check if callback is provided
      return req;
    });
    return { req, res };
  };

  const mockApiNetworkError = (errorMessage = 'Network Error') => {
    const req = {
      on: jest.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error(errorMessage));
        }
      }),
      write: jest.fn(),
      end: jest.fn(() => {
        // Simulate the 'error' event being triggered
        const errorCallback = req.on.mock.calls.find(call => call[0] === 'error');
        if (errorCallback) errorCallback[1](new Error(errorMessage));
      }),
    };
    https.request.mockImplementationOnce(() => req);
    return { req };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCurrentConfig = {
      token: 'fake-token',
      owner: 'test-owner',
      repository: 'test-repo',
      projectNumber: null,
    };

    // Mock implementations for configManager functions called by getConfig()
    configManager.getGitHubToken.mockReturnValue(mockCurrentConfig.token);
    configManager.getGitHubOwner.mockReturnValue(mockCurrentConfig.owner);
    configManager.getGitHubRepository.mockReturnValue(mockCurrentConfig.repository);
    configManager.getGitHubProjectNumber.mockReturnValue(mockCurrentConfig.projectNumber);

    // Instantiate with a version of the config. Methods will call getConfig() internally.
    ticketingSystem = new GitHubProjectsTicketing({ ...mockCurrentConfig });
    
    // mockHttpsRequest is just an alias for the global jest.Mock for https.request
    mockHttpsRequest = https.request; 
  });

  describe('Configuration', () => {
    it('isConfigured should return true when all essential configs are present', () => {
      expect(ticketingSystem.isConfigured()).toBe(true);
    });

    it('isConfigured should return false if token is missing', () => {
      configManager.getGitHubToken.mockReturnValueOnce(null);
      expect(ticketingSystem.isConfigured('explicit-root-path')).toBe(false);
    });

    it('isConfigured should return false if owner is missing', () => {
      configManager.getGitHubOwner.mockReturnValueOnce(null);
      expect(ticketingSystem.isConfigured()).toBe(false);
    });

    it('isConfigured should return false if repository is missing', () => {
      configManager.getGitHubRepository.mockReturnValueOnce(null);
      expect(ticketingSystem.isConfigured()).toBe(false);
    });
    
    it('validateConfig should return config if valid', () => {
        expect(ticketingSystem.validateConfig()).toEqual(mockCurrentConfig);
    });

    it('validateConfig should return null if not configured', () => {
        configManager.getGitHubToken.mockReturnValueOnce(null);
        expect(ticketingSystem.validateConfig('explicit-root')).toBeNull();
        expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('GitHub Projects is not properly configured'));
    });

    it('getConfig should return current configuration', () => {
        expect(ticketingSystem.getConfig()).toEqual(mockCurrentConfig);
        expect(configManager.getGitHubToken).toHaveBeenCalled();
        expect(configManager.getGitHubOwner).toHaveBeenCalled();
        expect(configManager.getGitHubRepository).toHaveBeenCalled();
        expect(configManager.getGitHubProjectNumber).toHaveBeenCalled();
    });
  });

  describe('storeTicketId and getTicketId', () => {
    it('should store and retrieve ticket ID correctly', () => {
      const task = { metadata: {} };
      const ticketId = '123';
      ticketingSystem.storeTicketId(task, ticketId);
      expect(task.metadata.githubIssueId).toBe(ticketId);
      expect(ticketingSystem.getTicketId(task)).toBe(ticketId);
    });

    it('getTicketId should return null if not set or task/metadata is null', () => {
      expect(ticketingSystem.getTicketId({ metadata: {} })).toBeNull();
      expect(ticketingSystem.getTicketId({})).toBeNull();
      expect(ticketingSystem.getTicketId(null)).toBeNull();
    });
  });

  describe('Mapping Functions', () => {
    it('formatTitleForTicket should include refId if present', () => {
      expect(ticketingSystem.formatTitleForTicket({ title: 'Test', metadata: { refId: 'T-1' } })).toBe('[T-1] Test');
      expect(ticketingSystem.formatTitleForTicket({ title: 'Test', metadata: {} })).toBe('Test');
    });

    it('mapPriorityToTicket should map priorities correctly', () => {
      expect(ticketingSystem.mapPriorityToTicket('high')).toBe('priority:high');
      expect(ticketingSystem.mapPriorityToTicket('medium')).toBe('priority:medium');
      expect(ticketingSystem.mapPriorityToTicket('low')).toBe('priority:low');
      expect(ticketingSystem.mapPriorityToTicket('unknown')).toBeNull(); // Default case
      expect(ticketingSystem.mapPriorityToTicket(null)).toBeNull();
    });

    it('mapStatusToTicket should map statuses correctly for GitHub Issues', () => {
      expect(ticketingSystem.mapStatusToTicket('pending')).toBe('Todo');
      expect(ticketingSystem.mapStatusToTicket('in-progress')).toBe('In Progress');
      expect(ticketingSystem.mapStatusToTicket('review')).toBe('In Review');
      expect(ticketingSystem.mapStatusToTicket('done')).toBe('Done');
      expect(ticketingSystem.mapStatusToTicket('cancelled')).toBe('Closed');
      expect(ticketingSystem.mapStatusToTicket('unknown')).toBe('Todo'); // Default
    });
    
    it('mapTicketStatusToTaskmaster should map GitHub issue details to TaskMaster status', () => {
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'closed', labels: [{name: 'Done'}] })).toBe('done');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'closed', labels: [] })).toBe('cancelled');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'open', labels: [{name: 'In Progress'}] })).toBe('in-progress');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'open', labels: [{name: 'in-review'}] })).toBe('review'); // case-insensitive check
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'open', labels: [{name: 'Done'}] })).toBe('done');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'open', labels: [{name: 'Todo'}] })).toBe('pending');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ state: 'open', labels: [] })).toBe('pending');
        expect(ticketingSystem.mapTicketStatusToTaskmaster(null)).toBe('pending');
    });

    it('mapTicketPriorityToTaskmaster should map GitHub labels to TaskMaster priority', () => {
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ labels: [{name: 'priority:high'}] })).toBe('high');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ labels: [{name: 'priority:medium'}] })).toBe('medium');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ labels: [{name: 'priority:low'}] })).toBe('low');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ labels: [] })).toBe('medium');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster(null)).toBe('medium');
    });
  });
  
  describe('getTicketUrl', () => {
    it('should return the correct GitHub issue URL', () => {
        const url = ticketingSystem.getTicketUrl('42');
        expect(url).toBe('https://github.com/test-owner/test-repo/issues/42');
    });
    it('should return null if essential config is missing', () => {
        configManager.getGitHubOwner.mockReturnValueOnce(null);
        expect(ticketingSystem.getTicketUrl('42', 'explicit-root')).toBeNull();
    });
  });

  describe('ticketExists', () => {
    it('should return true if issue exists (API returns 200)', async () => {
      mockApiResponse(200, { id: 123, number: 123 });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(true);
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/repos/test-owner/test-repo/issues/123',
        }),
        expect.any(Function)
      );
    });

    it('should return false if issue does not exist (API returns 404)', async () => {
      mockApiResponse(404, { message: 'Not Found' });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(false);
    });
    
    it('should return false if issue does not exist (API returns 410)', async () => {
      mockApiResponse(410, { message: 'Gone' });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(false);
    });

    it('should return false on other API errors', async () => {
      mockApiResponse(500, { message: 'Server Error' });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(false);
      expect(log).toHaveBeenCalledWith('error', expect.stringContaining('Error checking if GitHub issue #123 exists'));
    });
    
    it('should return false for invalid ticketId string', async () => {
        const exists = await ticketingSystem.ticketExists('null');
        expect(exists).toBe(false);
        expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('ticketExists called with invalid ticketId: null'));
        expect(mockHttpsRequest).not.toHaveBeenCalled();
    });
  });

  describe('createStory', () => {
    const taskData = { id:'task1', title: 'Test Story', description: 'Desc', details: 'Details', metadata: { refId: 'S-1' }, priority: 'high' };
    
    it('should create an issue and return its details', async () => {
      const mockIssue = { number: 1, html_url: 'http://issue.url', node_id: 'node1' };
      mockApiResponse(201, mockIssue); // 201 Created

      const result = await ticketingSystem.createStory(taskData);
      
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/repos/test-owner/test-repo/issues',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' })
        }),
        expect.any(Function)
      );
      // Check body passed to req.write by the _request helper
      const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
      expect(requestBody.title).toBe('[S-1] Test Story');
      expect(requestBody.body).toContain('Desc');
      expect(requestBody.body).toContain('Details');
      expect(requestBody.body).toContain('Reference ID: S-1'); // Body includes refId even if title does
      expect(requestBody.labels).toEqual(['priority:high', 'story']);
      
      expect(result).toEqual({ id: '1', key: '1', url: 'http://issue.url', rawResponse: mockIssue });
    });

    it('should log if projectNumber is configured when creating story', async () => {
        configManager.getGitHubProjectNumber.mockReturnValueOnce('789'); // Specific to this call via explicitRoot
        ticketingSystem = new GitHubProjectsTicketing(ticketingSystem.getConfig('explicit-root')); // Re-init with new mock

        const mockIssue = { number: 1, html_url: 'http://issue.url', node_id: 'node1' };
        mockApiResponse(201, mockIssue);
        await ticketingSystem.createStory(taskData, 'explicit-root'); // Pass explicitRoot
        expect(log).toHaveBeenCalledWith('info', expect.stringContaining('GitHub Project 789 is configured. Manual addition or GraphQL implementation needed'));
    });
    
    it('should handle API error during story creation', async () => {
        mockApiResponse(500, { message: 'Server Error' });
        await expect(ticketingSystem.createStory(taskData)).rejects.toThrow(expect.stringContaining('GitHub API Error: 500 Status 500 - Server Error'));
    });
  });

  describe('createTask', () => {
    const subtaskData = { id: 'sub1', title: 'Test Subtask', description: 'Sub Desc', metadata: { refId: 'ST-1' }, priority: 'medium' };
    const parentTicketId = '123';

    it('should create an issue for subtask and return its details', async () => {
      const mockIssue = { number: 2, html_url: 'http://subissue.url', node_id: 'node2' };
      mockApiResponse(201, mockIssue);

      const result = await ticketingSystem.createTask(subtaskData, parentTicketId);
      
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/repos/test-owner/test-repo/issues',
        }),
        expect.any(Function)
      );
      const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
      expect(requestBody.title).toBe('[ST-1] Test Subtask');
      expect(requestBody.body).toContain('Sub Desc');
      expect(requestBody.body).toContain(`Parent issue: #${parentTicketId}`);
      expect(requestBody.labels).toEqual(['priority:medium', 'subtask']);
      
      expect(result).toEqual({ id: '2', key: '2', url: 'http://subissue.url', rawResponse: mockIssue });
    });
  });
  
  describe('findTicketByRefId', () => {
    it('should return issue ID if found', async () => {
        const mockSearchResponse = { items: [{ number: 42, html_url: 'some_url' }] };
        mockApiResponse(200, mockSearchResponse);
        const result = await ticketingSystem.findTicketByRefId('REF-123');
        expect(result).toBe('42');
        expect(mockHttpsRequest.mock.calls[0][0].path).toContain(encodeURIComponent('"REF-123" repo:test-owner/test-repo is:issue'));
    });

    it('should return null if no issue found', async () => {
        mockApiResponse(200, { items: [] });
        const result = await ticketingSystem.findTicketByRefId('REF-NONEXISTENT');
        expect(result).toBeNull();
    });
    
    it('should return null on API error', async () => {
        mockApiResponse(500, { message: 'Search Error' });
        const result = await ticketingSystem.findTicketByRefId('REF-ERROR');
        expect(result).toBeNull();
        expect(log).toHaveBeenCalledWith('error', expect.stringContaining('Error searching for GitHub issue by refId "REF-ERROR"'));
    });
  });

  describe('createTicketLink', () => {
    it('should post a comment to link issues', async () => {
        mockApiResponse(201, { id: 999 }); // Comment creation success
        const success = await ticketingSystem.createTicketLink('1', '2', 'Related to');
        expect(success).toBe(true);
        expect(mockHttpsRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                path: '/repos/test-owner/test-repo/issues/1/comments'
            }),
            expect.any(Function)
        );
        const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
        expect(requestBody.body).toContain('Related to #2');
    });
  });

  describe('updateTicketStatus', () => {
    it('should update issue state and labels for "in-progress"', async () => {
        // First call to GET the issue for its current labels
        mockApiResponse(200, { labels: [{name: 'priority:high'}] }); 
        // Second call to PATCH the issue
        mockApiResponse(200, { number: 1, html_url: 'url' }); 

        const success = await ticketingSystem.updateTicketStatus('1', 'in-progress', null, { priority: 'high' });
        expect(success).toBe(true);
        
        expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
        const patchCallArgs = mockHttpsRequest.mock.calls[1];
        expect(patchCallArgs[0].method).toBe('PATCH');
        expect(patchCallArgs[0].path).toBe('/repos/test-owner/test-repo/issues/1');
        
        const requestBody = JSON.parse(patchCallArgs[1].write.mock.calls[0][0]);
        expect(requestBody.state).toBe('open');
        expect(requestBody.labels).toContain('In Progress');
        expect(requestBody.labels).toContain('priority:high');
    });
    
    it('should update issue state to closed for "cancelled"', async () => {
        mockApiResponse(200, { labels: [] }); // GET
        mockApiResponse(200, { number: 1, html_url: 'url' }); // PATCH

        const success = await ticketingSystem.updateTicketStatus('1', 'cancelled');
        expect(success).toBe(true);
        const requestBody = JSON.parse(mockHttpsRequest.mock.calls[1][1].write.mock.calls[0][0]);
        expect(requestBody.state).toBe('closed');
        expect(requestBody.labels).not.toContain('Closed'); // 'Closed' is a state, not typically a label unless custom
    });
  });
  
  describe('updateTicketDetails', () => {
    it('should update title, body, and priority label', async () => {
        // Mock for GET request to fetch current labels
        mockApiResponse(200, { labels: [{name: 'bug'}, {name: 'priority:low'}] });
        // Mock for PATCH request
        mockApiResponse(200, { number: 1, title: 'New Title' });

        const taskData = { title: 'New Title', description: 'New Desc', priority: 'high', metadata: { refId: 'T-1' } };
        const success = await ticketingSystem.updateTicketDetails('1', taskData);
        expect(success).toBe(true);

        expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
        const patchCallArgs = mockHttpsRequest.mock.calls[1];
        expect(patchCallArgs[0].method).toBe('PATCH');
        
        const requestBody = JSON.parse(patchCallArgs[1].write.mock.calls[0][0]);
        expect(requestBody.title).toBe('[T-1] New Title');
        expect(requestBody.body).toContain('New Desc');
        expect(requestBody.labels).toContain('bug'); // Preserves other labels
        expect(requestBody.labels).not.toContain('priority:low');
        expect(requestBody.labels).toContain('priority:high');
    });
  });

  describe('deleteTicket', () => {
    it('should call updateTicketStatus to close the issue', async () => {
        // Mock GET for updateTicketStatus
        mockApiResponse(200, { labels: [] });
        // Mock PATCH for updateTicketStatus
        mockApiResponse(200, { number: 1, state: 'closed' }); 

        jest.spyOn(ticketingSystem, 'updateTicketStatus'); // Spy on the method
        const success = await ticketingSystem.deleteTicket('1');
        
        expect(success).toBe(true);
        expect(ticketingSystem.updateTicketStatus).toHaveBeenCalledWith('1', 'cancelled', null, expect.any(Object));
    });
  });
  
  // Test for network errors using _request
  describe('_request network error handling', () => {
    it('should throw an error if https.request emits an error', async () => {
      mockApiNetworkError('Connection refused');
      // Need to call a method that uses _request, e.g. ticketExists
      await expect(ticketingSystem.ticketExists('1')).rejects.toThrow('GitHub API request failed: Connection refused');
    });
  });

});
