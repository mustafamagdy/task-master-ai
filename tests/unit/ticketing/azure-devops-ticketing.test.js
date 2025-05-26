import AzureDevOpsTicketing from '../../../../scripts/modules/ticketing/azdevops/azure-devops-ticketing.js';
import * as configManager from '../../../../scripts/modules/config-manager.js';
import { log } from '../../../../scripts/modules/utils.js';
import https from 'https';
import { Buffer } from 'buffer'; // Needed for PAT encoding, which is part of the tested code

// Mock dependencies
jest.mock('https');
jest.mock('../../../../scripts/modules/config-manager.js');
jest.mock('../../../../scripts/modules/utils.js', () => ({
  log: jest.fn(),
}));

describe('AzureDevOpsTicketing', () => {
  let ticketingSystem;
  let mockHttpsRequest;
  let mockCurrentConfig; // Used to simulate what getConfig() would return

  // Helper to simulate https.request response
  const mockApiResponse = (statusCode, responseBody, headers = { 'content-type': 'application/json' }) => {
    const res = {
      statusCode,
      headers,
      on: jest.fn((event, callback) => {
        if (event === 'data' && responseBody) {
          callback(Buffer.from(JSON.stringify(responseBody)));
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
        const endCallback = res.on.mock.calls.find(call => call[0] === 'end');
        if (endCallback) endCallback[1]();
      }),
    };
    https.request.mockImplementationOnce((options, callback) => {
      if (callback) callback(res);
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
      organization: 'https://dev.azure.com/testorg',
      token: 'fake-pat',
      projectName: 'TestProject',
    };

    configManager.getAzureOrganization.mockReturnValue(mockCurrentConfig.organization);
    configManager.getAzurePersonalAccessToken.mockReturnValue(mockCurrentConfig.token);
    configManager.getAzureProjectName.mockReturnValue(mockCurrentConfig.projectName);
    
    ticketingSystem = new AzureDevOpsTicketing({ ...mockCurrentConfig });
    mockHttpsRequest = https.request; // Alias for the global mock
  });

  describe('Configuration', () => {
    it('isConfigured should return true when all essential configs are present', () => {
      expect(ticketingSystem.isConfigured()).toBe(true);
    });

    it('isConfigured should return false if organization is missing', () => {
      configManager.getAzureOrganization.mockReturnValueOnce(null);
      expect(ticketingSystem.isConfigured('explicit-root')).toBe(false);
    });
    
    it('validateConfig should return null if organization URL is invalid', () => {
        configManager.getAzureOrganization.mockReturnValueOnce('invalid-url');
        expect(ticketingSystem.validateConfig('explicit-root')).toBeNull();
        expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('Invalid Azure DevOps organization URL format: invalid-url'));
    });
  });

  describe('storeTicketId and getTicketId', () => {
    it('should store and retrieve ticket ID correctly', () => {
      const task = { metadata: {} };
      const ticketId = '123';
      ticketingSystem.storeTicketId(task, ticketId); // This method should directly modify task.metadata
      expect(task.metadata.azureWorkItemId).toBe(ticketId);
      expect(ticketingSystem.getTicketId(task)).toBe(ticketId);
    });
  });

  describe('Mapping Functions', () => {
    it('formatTitleForTicket should include refId if present', () => {
      expect(ticketingSystem.formatTitleForTicket({ title: 'Test', metadata: { refId: 'T-1' } })).toBe('T-1: Test');
    });

    it('mapPriorityToTicket should map priorities to AzDevOps numbers', () => {
      expect(ticketingSystem.mapPriorityToTicket('high')).toBe(1);
      expect(ticketingSystem.mapPriorityToTicket('medium')).toBe(2);
      expect(ticketingSystem.mapPriorityToTicket('low')).toBe(3);
      expect(ticketingSystem.mapPriorityToTicket('unknown')).toBe(2);
    });

    it('mapStatusToTicket should map statuses to AzDevOps states', () => {
      expect(ticketingSystem.mapStatusToTicket('pending')).toBe('New');
      expect(ticketingSystem.mapStatusToTicket('in-progress')).toBe('Active');
      expect(ticketingSystem.mapStatusToTicket('review')).toBe('Resolved');
      expect(ticketingSystem.mapStatusToTicket('done')).toBe('Closed');
      expect(ticketingSystem.mapStatusToTicket('cancelled')).toBe('Removed');
    });
    
    it('mapTicketStatusToTaskmaster should map AzDevOps states to TaskMaster statuses', () => {
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'New' } })).toBe('pending');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'Active' } })).toBe('in-progress');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'Resolved' } })).toBe('review');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'Closed', 'System.Reason': 'Completed' } })).toBe('done');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'Removed' } })).toBe('cancelled');
        expect(ticketingSystem.mapTicketStatusToTaskmaster({ fields: { 'System.State': 'Closed', 'System.Reason': 'Declined' } })).toBe('cancelled');
    });
    
    it('mapTicketPriorityToTaskmaster should map AzDevOps priority numbers to TaskMaster priorities', () => {
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ fields: { 'Microsoft.VSTS.Common.Priority': 1 } })).toBe('high');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ fields: { 'Microsoft.VSTS.Common.Priority': 2 } })).toBe('medium');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ fields: { 'Microsoft.VSTS.Common.Priority': 3 } })).toBe('low');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ fields: { 'Microsoft.VSTS.Common.Priority': 4 } })).toBe('low');
        expect(ticketingSystem.mapTicketPriorityToTaskmaster({ fields: {} })).toBe('medium');
    });
  });
  
  describe('getTicketUrl', () => {
    it('should return the correct AzDevOps work item URL', () => {
        const url = ticketingSystem.getTicketUrl('42');
        expect(url).toBe('https://dev.azure.com/testorg/TestProject/_workitems/edit/42');
    });
  });

  describe('ticketExists', () => {
    it('should return true if work item exists (API returns 200)', async () => {
      mockApiResponse(200, { id: 123 });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(true);
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          hostname: 'dev.azure.com',
          path: expect.stringContaining('/testorg/TestProject/_apis/wit/workitems/123'),
        }),
        expect.any(Function)
      );
    });

    it('should return false if work item does not exist (API returns 404)', async () => {
      mockApiResponse(404, { message: 'Not Found' });
      const exists = await ticketingSystem.ticketExists('123');
      expect(exists).toBe(false);
    });
    
    it('should return false for non-numeric ticketId', async () => {
        const exists = await ticketingSystem.ticketExists('abc');
        expect(exists).toBe(false);
        expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('ticketExists called with invalid ticketId: abc'));
    });
  });

  describe('createStory', () => {
    const taskData = { id:'task1', title: 'Test Story', description: 'Desc', details: 'Details', metadata: { refId: 'S-1' }, priority: 'high' };
    
    it('should create a User Story and return its details', async () => {
      const mockWorkItem = { id: 1, fields: { 'System.Title': 'S-1: Test Story'}, _links: { html: { href: 'http://ado.url/1' } } };
      mockApiResponse(200, mockWorkItem); // Create WI returns 200 OK with full body

      const result = await ticketingSystem.createStory(taskData);
      
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/TestProject/_apis/wit/workitems/$User%20Story'),
          headers: expect.objectContaining({ 'Content-Type': 'application/json-patch+json' })
        }),
        expect.any(Function)
      );
      const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
      expect(requestBody).toEqual(expect.arrayContaining([
        expect.objectContaining({ op: 'add', path: '/fields/System.Title', value: 'S-1: Test Story' }),
        expect.objectContaining({ op: 'add', path: '/fields/System.Description', value: expect.stringContaining('Desc') }),
        expect.objectContaining({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: 1 }),
        expect.objectContaining({ op: 'add', path: '/fields/System.Tags', value: 'S-1' })
      ]));
      
      expect(result).toEqual({ id: '1', key: '1', url: 'http://ado.url/1', rawResponse: mockWorkItem });
    });
    
    it('should throw error if config is invalid for createStory', async () => {
        configManager.getAzureOrganization.mockReturnValueOnce(null);
        await expect(ticketingSystem.createStory(taskData, 'explicit-root')).rejects.toThrow(expect.stringContaining('Configuration is invalid'));
    });
  });

  describe('createTask', () => {
    const subtaskData = { id: 'sub1', title: 'Test Subtask', description: 'Sub Desc', metadata: { refId: 'ST-1' }, priority: 'medium' };
    const parentTicketId = '123';

    it('should create a Task linked to parent and return its details', async () => {
      const mockWorkItem = { id: 2, _links: { html: { href: 'http://ado.url/2' } } };
      mockApiResponse(200, mockWorkItem);

      const result = await ticketingSystem.createTask(subtaskData, parentTicketId);
      
      expect(mockHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/TestProject/_apis/wit/workitems/$Task'),
        }),
        expect.any(Function)
      );
      const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
      expect(requestBody).toEqual(expect.arrayContaining([
        expect.objectContaining({ op: 'add', path: '/fields/System.Title', value: 'ST-1: Test Subtask' }),
        expect.objectContaining({ op: 'add', path: '/relations/-', value: expect.objectContaining({ rel: 'System.LinkTypes.Hierarchy-Reverse', url: expect.stringContaining('/123')}) })
      ]));
      
      expect(result).toEqual({ id: '2', key: '2', url: 'http://ado.url/2', rawResponse: mockWorkItem });
    });
  });
  
  describe('findTicketByRefId', () => {
    it('should return work item ID if found via WIQL by tag', async () => {
        const mockWiqlResponse = { workItems: [{ id: 42 }] };
        mockApiResponse(200, mockWiqlResponse);
        const result = await ticketingSystem.findTicketByRefId('REF-123');
        expect(result).toBe('42');
        expect(mockHttpsRequest.mock.calls[0][0].path).toContain('/_apis/wit/wiql');
        const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
        expect(requestBody.query).toContain("System.Tags] CONTAINS 'REF-123'");
    });

    it('should return null if no work item found by WIQL', async () => {
        mockApiResponse(200, { workItems: [] });
        const result = await ticketingSystem.findTicketByRefId('REF-NONEXISTENT');
        expect(result).toBeNull();
    });
  });

  describe('createTicketLink', () => {
    it('should use JSON Patch to link work items', async () => {
        mockApiResponse(200, { id: 1 }); // Link update returns full item
        const success = await ticketingSystem.createTicketLink('1', '2', 'Related');
        expect(success).toBe(true);
        expect(mockHttpsRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PATCH',
                path: expect.stringContaining('/_apis/wit/workitems/1'),
                headers: expect.objectContaining({'Content-Type': 'application/json-patch+json'})
            }),
            expect.any(Function)
        );
        const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
        expect(requestBody).toEqual(expect.arrayContaining([
            expect.objectContaining({ op: 'add', path: '/relations/-', value: expect.objectContaining({ rel: 'System.LinkTypes.Related', url: expect.stringContaining('/2')})})
        ]));
    });
  });

  describe('updateTicketStatus', () => {
    it('should update work item state and priority', async () => {
        mockApiResponse(200, { id: 1 }); // PATCH success
        const success = await ticketingSystem.updateTicketStatus('1', 'in-progress', null, { priority: 'high' });
        expect(success).toBe(true);
        const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
        expect(requestBody).toEqual(expect.arrayContaining([
            expect.objectContaining({ op: 'add', path: '/fields/System.State', value: 'Active' }),
            expect.objectContaining({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: 1 })
        ]));
    });
  });
  
  describe('updateTicketDetails', () => {
    it('should update title, description, and priority', async () => {
        mockApiResponse(200, { id: 1 }); // PATCH success
        const taskData = { title: 'New Title', description: 'New Desc', priority: 'low', metadata: { refId: 'T-1' } };
        const success = await ticketingSystem.updateTicketDetails('1', taskData);
        expect(success).toBe(true);
        const requestBody = JSON.parse(mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0]);
        expect(requestBody).toEqual(expect.arrayContaining([
            expect.objectContaining({ op: 'add', path: '/fields/System.Title', value: 'T-1: New Title' }),
            expect.objectContaining({ op: 'add', path: '/fields/System.Description', value: expect.stringContaining('New Desc') }),
            expect.objectContaining({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: 3 })
        ]));
    });
  });

  describe('deleteTicket', () => {
    it('should call updateTicketStatus to set state to "Removed"', async () => {
        mockApiResponse(200, { id: 1 }); // For the updateTicketStatus call
        jest.spyOn(ticketingSystem, 'updateTicketStatus');
        const success = await ticketingSystem.deleteTicket('1');
        expect(success).toBe(true);
        expect(ticketingSystem.updateTicketStatus).toHaveBeenCalledWith('1', 'cancelled', null, expect.any(Object));
    });
  });
  
  describe('_request network error handling', () => {
    it('should throw an error if https.request emits an error', async () => {
      mockApiNetworkError('Connection refused');
      // Call any method that uses _request
      await expect(ticketingSystem.ticketExists('1')).rejects.toThrow('[AzDevOps] API request failed: Connection refused');
    });
  });

});
