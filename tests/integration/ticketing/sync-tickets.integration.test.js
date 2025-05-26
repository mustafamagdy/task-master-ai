import syncTickets from '../../../scripts/modules/ticketing/sync-tickets.js';
import * as configManager from '../../../scripts/modules/config-manager.js';
import * as ticketingFactory from '../../../scripts/modules/ticketing/ticketing-factory.js';
import * as taskFileUtils from '../../../scripts/modules/utils.js';
import generateTaskFiles from '../../../scripts/modules/task-manager/generate-task-files.js';
import { getRefId } from '../../../scripts/modules/ticketing/utils/index.js'; // Actual implementation

// --- Mocking Core Modules ---
jest.mock('../../../scripts/modules/config-manager.js');
jest.mock('../../../scripts/modules/ticketing/ticketing-factory.js');
jest.mock('../../../scripts/modules/task-manager/generate-task-files.js');

// Mock utils, but keep actual implementations for non-mocked parts (like getRefId if it were here)
// For this test, we only need to mock readJSON, writeJSON, and log from utils.
jest.mock('../../../scripts/modules/utils.js', () => {
    const originalUtils = jest.requireActual('../../../scripts/modules/utils.js');
    return {
        ...originalUtils, // Spread original utils to keep other functions working if needed
        readJSON: jest.fn(),
        writeJSON: jest.fn(),
        log: jest.fn(), // Mock log as it's used extensively
    };
});


// --- Mock Ticketing System Implementations ---

// Base Mock Ticketing System
class MockBaseTicketingSystem {
    constructor(systemName = 'BaseMock') {
        this.systemName = systemName; // For debugging/identification
        this.constructorName = `${systemName}Ticketing`; // For constructor.name checks
        
        Object.defineProperty(this.constructor, 'name', {
            value: this.constructorName,
            writable: true,
        });

        this.isConfigured = jest.fn().mockReturnValue(true);
        this.validateConfig = jest.fn(explicitRoot => this.getConfig(explicitRoot));
        this.getConfig = jest.fn().mockReturnValue({ system: this.systemName });
        
        this.createStory = jest.fn();
        this.createTask = jest.fn();
        this.findTicketByRefId = jest.fn();
        this.ticketExists = jest.fn();
        this.createTicketLink = jest.fn();
        this.updateTicketStatus = jest.fn();
        this.updateTicketDetails = jest.fn();
        this.deleteTicket = jest.fn();
        
        this.getTicketId = jest.fn((task) => task?.metadata?.[`${this.systemName}TicketId`] || null);
        this.storeTicketId = jest.fn((task, ticketId) => {
            task.metadata = task.metadata || {};
            task.metadata[`${this.systemName}TicketId`] = ticketId;
        });
        
        this.formatTitleForTicket = jest.fn(task => `[${task?.metadata?.refId || ''}] ${task.title}`.trim());
        this.mapPriorityToTicket = jest.fn(priority => priority); // Simple pass-through
        this.mapStatusToTicket = jest.fn(status => status);     // Simple pass-through
        this.getTicketDetails = jest.fn(); // For pull operations
        this.mapTicketStatusToTaskmaster = jest.fn(details => details?.status || 'pending');
        this.mapTicketPriorityToTaskmaster = jest.fn(details => details?.priority || 'medium');
        this.supportsFullImport = jest.fn().mockReturnValue(false); // Default to false
    }
}

let mockGitHubInstance;
let mockAzureDevOpsInstance;
let mockJiraInstance; // For testing the Jira-specific import path


describe('syncTickets Integration Tests', () => {
    const mockTasksPath = '/fake/path/tasks.json';
    let mockTasksDataFileContent; // Simulates the content of tasks.json

    beforeEach(() => {
        jest.clearAllMocks();

        // --- Reset Mock Data & Functions ---
        mockTasksDataFileContent = {
            project: 'Test Project',
            lastSync: null,
            tasks: [
                { id: 1, title: 'Task 1 without ticket', status: 'pending', metadata: { refId: 'REF-1' }, subtasks: [] },
                { id: 2, title: 'Task 2 with existing ticket', status: 'in-progress', metadata: { refId: 'REF-2' }, subtasks: [] },
                { 
                    id: 3, title: 'Task 3 with subtasks', status: 'pending', metadata: { refId: 'REF-3' }, 
                    subtasks: [
                        { id: 1, parentId: 3, title: 'Subtask 3.1', status: 'pending', metadata: { refId: 'REF-3.1' } }
                    ] 
                },
                { id: 4, title: 'Task 4 for pull test', status: 'pending', metadata: { refId: 'REF-4' }, subtasks: [] },
            ],
        };
        taskFileUtils.readJSON.mockReturnValue(mockTasksDataFileContent);
        taskFileUtils.writeJSON.mockImplementation((path, data) => {
            mockTasksDataFileContent = JSON.parse(JSON.stringify(data)); // Deep clone to simulate file write
        });

        generateTaskFiles.mockResolvedValue(undefined); // Mock generateTaskFiles

        // --- Default ConfigManager Mocks ---
        configManager.getTicketingIntegrationEnabled.mockReturnValue(true);
        // getTicketingSystemType will be set per test suite (describe block)
        configManager.getProjectRoot.mockReturnValue('/fake/path'); // Or wherever needed

        // --- Setup Mock Ticketing Instances ---
        mockGitHubInstance = new MockBaseTicketingSystem('github');
        mockAzureDevOpsInstance = new MockBaseTicketingSystem('azure');
        mockJiraInstance = new MockBaseTicketingSystem('jira'); // For specific Jira tests

        // Default getTicketingInstance to GitHub
        ticketingFactory.getTicketingInstance.mockResolvedValue(mockGitHubInstance);
        configManager.getTicketingSystemType.mockReturnValue('github');
        // Set metadata for task 2 to match the default system
        mockTasksDataFileContent.tasks[1].metadata.githubTicketId = 'GH-123';

    });

    // --- Helper to switch ticketing system for tests ---
    const setupTicketingSystem = (systemType) => {
        configManager.getTicketingSystemType.mockReturnValue(systemType);
        if (systemType === 'github') {
            ticketingFactory.getTicketingInstance.mockResolvedValue(mockGitHubInstance);
            // Adjust existing ticket ID for task 2 if needed for this system type
            delete mockTasksDataFileContent.tasks[1].metadata.azureTicketId;
            delete mockTasksDataFileContent.tasks[1].metadata.jiraTicketId;
            mockTasksDataFileContent.tasks[1].metadata.githubTicketId = 'GH-123';
        } else if (systemType === 'azure') {
            ticketingFactory.getTicketingInstance.mockResolvedValue(mockAzureDevOpsInstance);
            delete mockTasksDataFileContent.tasks[1].metadata.githubTicketId;
            delete mockTasksDataFileContent.tasks[1].metadata.jiraTicketId;
            mockTasksDataFileContent.tasks[1].metadata.azureTicketId = 'AZ-456';
        } else if (systemType === 'jira') {
            ticketingFactory.getTicketingInstance.mockResolvedValue(mockJiraInstance);
            delete mockTasksDataFileContent.tasks[1].metadata.githubTicketId;
            delete mockTasksDataFileContent.tasks[1].metadata.azureTicketId;
            mockTasksDataFileContent.tasks[1].metadata.jiraTicketId = 'JIRA-789';
        }
    };

    describe.each(['github', 'azure'])('Generic Logic with %s', (systemType) => {
        let currentMockSystem;

        beforeEach(() => {
            setupTicketingSystem(systemType);
            currentMockSystem = systemType === 'github' ? mockGitHubInstance : mockAzureDevOpsInstance;
        });

        it('should create a new ticket if none exists (direction: up)', async () => {
            currentMockSystem.findTicketByRefId.mockResolvedValue(null); // No existing ticket by refId
            currentMockSystem.createStory.mockResolvedValue({ id: `${systemType}-NEW-1`, key: `${systemType}-NEW-1` });

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '1' });
            
            expect(currentMockSystem.findTicketByRefId).toHaveBeenCalledWith('REF-1', expect.any(String));
            expect(currentMockSystem.createStory).toHaveBeenCalledWith(
                expect.objectContaining({ id: 1, title: 'Task 1 without ticket' }),
                expect.any(String) // projectRoot
            );
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(
                expect.objectContaining({ id: 1 }),
                `${systemType}-NEW-1`
            );
            const updatedTask = mockTasksDataFileContent.tasks.find(t => t.id === 1);
            expect(currentMockSystem.getTicketId(updatedTask)).toBe(`${systemType}-NEW-1`);
        });

        it('should update an existing ticket if found by refId but not in metadata (direction: up)', async () => {
            const taskToSync = mockTasksDataFileContent.tasks.find(t => t.id === 1); // Task 1 has no stored ID
            currentMockSystem.findTicketByRefId.mockResolvedValue(`${systemType}-EXISTING-REF`); // Found by ref
            currentMockSystem.ticketExists.mockResolvedValue(true); // Ticket confirmed to exist
            currentMockSystem.updateTicketStatus.mockResolvedValue(true);

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '1' });

            expect(currentMockSystem.findTicketByRefId).toHaveBeenCalledWith('REF-1', expect.any(String));
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(taskToSync, `${systemType}-EXISTING-REF`);
            expect(currentMockSystem.ticketExists).toHaveBeenCalledWith(`${systemType}-EXISTING-REF`, expect.any(String));
            expect(currentMockSystem.updateTicketStatus).toHaveBeenCalledWith(
                `${systemType}-EXISTING-REF`,
                taskToSync.status, // current task status
                expect.any(String), // projectRoot
                taskToSync, // taskData
            );
            const updatedTask = mockTasksDataFileContent.tasks.find(t => t.id === 1);
            expect(currentMockSystem.getTicketId(updatedTask)).toBe(`${systemType}-EXISTING-REF`);
        });
        
        it('should update an existing ticket if ID is in metadata (direction: up)', async () => {
            const taskToSync = mockTasksDataFileContent.tasks.find(t => t.id === 2); // Task 2 has stored ID
            const existingTicketId = currentMockSystem.getTicketId(taskToSync);
            
            currentMockSystem.ticketExists.mockResolvedValue(true);
            currentMockSystem.updateTicketStatus.mockResolvedValue(true);

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '2' });

            expect(currentMockSystem.ticketExists).toHaveBeenCalledWith(existingTicketId, expect.any(String));
            expect(currentMockSystem.updateTicketStatus).toHaveBeenCalledWith(
                existingTicketId,
                taskToSync.status,
                expect.any(String),
                taskToSync
            );
            expect(currentMockSystem.createStory).not.toHaveBeenCalled();
        });

        it('should re-create ticket if stored ID does not exist on provider (direction: up)', async () => {
            const taskToSync = mockTasksDataFileContent.tasks.find(t => t.id === 2);
            const oldTicketId = currentMockSystem.getTicketId(taskToSync);

            currentMockSystem.ticketExists.mockResolvedValue(false); // Ticket doesn't exist
            currentMockSystem.findTicketByRefId.mockResolvedValue(null); // Also not found by refId
            currentMockSystem.createStory.mockResolvedValue({ id: `${systemType}-RECREATED`, key: `${systemType}-RECREATED` });

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '2' });

            expect(currentMockSystem.ticketExists).toHaveBeenCalledWith(oldTicketId, expect.any(String));
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(taskToSync, null); // Clears old ID
            expect(currentMockSystem.findTicketByRefId).toHaveBeenCalledWith('REF-2', expect.any(String));
            expect(currentMockSystem.createStory).toHaveBeenCalledWith(taskToSync, expect.any(String));
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(taskToSync, `${systemType}-RECREATED`);
            
            const updatedTask = mockTasksDataFileContent.tasks.find(t => t.id === 2);
            expect(currentMockSystem.getTicketId(updatedTask)).toBe(`${systemType}-RECREATED`);
        });

        it('should create tickets for subtasks (direction: up)', async () => {
            const parentTask = mockTasksDataFileContent.tasks.find(t => t.id === 3);
            const subTask = parentTask.subtasks[0];

            currentMockSystem.findTicketByRefId.mockResolvedValue(null); // No existing tickets
            currentMockSystem.createStory.mockResolvedValueOnce({ id: `${systemType}-PARENT-3`, key: `${systemType}-PARENT-3` }); // For parent
            currentMockSystem.createTask.mockResolvedValueOnce({ id: `${systemType}-SUB-3.1`, key: `${systemType}-SUB-3.1` });   // For subtask

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '3,3.1' });

            // Parent task
            expect(currentMockSystem.createStory).toHaveBeenCalledWith(parentTask, expect.any(String));
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(parentTask, `${systemType}-PARENT-3`);
            
            // Subtask
            expect(currentMockSystem.findTicketByRefId).toHaveBeenCalledWith('REF-3.1', expect.any(String), parentTask); // Subtask refId check
            expect(currentMockSystem.createTask).toHaveBeenCalledWith(
                subTask,
                `${systemType}-PARENT-3`, // Parent's new ticket ID
                expect.any(String) // projectRoot
            );
            expect(currentMockSystem.storeTicketId).toHaveBeenCalledWith(subTask, `${systemType}-SUB-3.1`);
        });

        it('should pull updates for a specific task (direction: down)', async () => {
            const taskToSync = mockTasksDataFileContent.tasks.find(t => t.id === 4);
            const ticketId = `${systemType}-PULL-4`;
            currentMockSystem.storeTicketId(taskToSync, ticketId); // Simulate ticket ID already exists
            
            currentMockSystem.getTicketDetails.mockResolvedValue({
                id: ticketId,
                title: 'Updated Title from Provider',
                status: 'in-progress', // Mapped by mapTicketStatusToTaskmaster
                priority: 'high',     // Mapped by mapTicketPriorityToTaskmaster
                description: 'Updated description.'
            });
            currentMockSystem.mapTicketStatusToTaskmaster.mockReturnValue('in-progress'); // Simulate mapping
            currentMockSystem.mapTicketPriorityToTaskmaster.mockReturnValue('high');


            await syncTickets(mockTasksPath, { direction: 'down', taskIds: '4' });
            
            expect(currentMockSystem.getTicketDetails).toHaveBeenCalledWith(ticketId, expect.any(String));
            
            const updatedTask = mockTasksDataFileContent.tasks.find(t => t.id === 4);
            expect(updatedTask.title).toBe('Updated Title from Provider');
            expect(updatedTask.status).toBe('in-progress');
            expect(updatedTask.priority).toBe('high');
            expect(updatedTask.description).toContain('Updated description.'); // sync-tickets might append or replace
            expect(updatedTask.metadata.lastTicketSync).toBeDefined();
        });
        
        it('should handle errors from ticketing system gracefully (e.g. createStory fails)', async () => {
            currentMockSystem.findTicketByRefId.mockResolvedValue(null);
            currentMockSystem.createStory.mockRejectedValue(new Error('API Limit Reached'));

            await syncTickets(mockTasksPath, { direction: 'up', taskIds: '1' });

            expect(taskFileUtils.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to create ticket for task 1'));
            expect(taskFileUtils.log).toHaveBeenCalledWith('error', expect.stringContaining('API Limit Reached'));
            const task = mockTasksDataFileContent.tasks.find(t => t.id === 1);
            expect(currentMockSystem.getTicketId(task)).toBeNull(); // No ticket ID stored
        });
    });

    describe('Jira Specific Logic', () => {
        beforeEach(() => {
            setupTicketingSystem('jira');
            mockJiraInstance.supportsFullImport.mockReturnValue(true); // Jira mock supports full import
        });

        it('should call importAllTicketsFromProvider for Jira if direction is "down" and no taskIds', async () => {
            // This function is defined within sync-tickets.js and not directly on the class, so we can't jest.spyOn it easily.
            // We test its effect: if it runs, it would modify tasksData. We can mock its internals if needed,
            // but for now, just ensure it's attempted for Jira.
            // We can check if ticketingSystem.getAllTickets() was called, which is a prerequisite for importAllTicketsFromProvider.
            mockJiraInstance.getAllTickets = jest.fn().mockResolvedValue([]); // Simulate it being callable

            await syncTickets(mockTasksPath, { direction: 'down' });
            expect(mockJiraInstance.getAllTickets).toHaveBeenCalled();
        });
    });
    
    describe('Non-Jira Full Import Prevention', () => {
        beforeEach(() => {
            setupTicketingSystem('github'); // Use GitHub which defaults supportsFullImport to false
        });

        it('should NOT call importAllTicketsFromProvider for non-Jira if direction is "down" and no taskIds and supportsFullImport is false', async () => {
            mockGitHubInstance.supportsFullImport.mockReturnValue(false);
            mockGitHubInstance.getAllTickets = jest.fn().mockResolvedValue([]); 

            await syncTickets(mockTasksPath, { direction: 'down' });
            
            expect(taskFileUtils.log).toHaveBeenCalledWith('info', expect.stringContaining('Ticketing system GitHubTicketing does not support full import. Skipping.'));
            expect(mockGitHubInstance.getAllTickets).not.toHaveBeenCalled();
        });
    });


    it('should exit early if ticketing is disabled and not forced', async () => {
        configManager.getTicketingIntegrationEnabled.mockReturnValue(false);
        await syncTickets(mockTasksPath, { force: false });
        expect(ticketingFactory.getTicketingInstance).not.toHaveBeenCalled();
        expect(taskFileUtils.log).toHaveBeenCalledWith('warn', 'Ticketing system integration is not enabled.');
    });
    
    it('should proceed if ticketing is disabled but forced', async () => {
        configManager.getTicketingIntegrationEnabled.mockReturnValue(false);
        setupTicketingSystem('github'); // Ensure a system is ready
        currentMockSystem = mockGitHubInstance;
        currentMockSystem.findTicketByRefId.mockResolvedValue(null);
        currentMockSystem.createStory.mockResolvedValue({ id: 'forced-1', key: 'forced-1' });


        await syncTickets(mockTasksPath, { force: true, taskIds: '1' });
        expect(ticketingFactory.getTicketingInstance).toHaveBeenCalled();
        expect(currentMockSystem.createStory).toHaveBeenCalled();
    });

    it('should exit if no ticketing system instance can be created', async () => {
        ticketingFactory.getTicketingInstance.mockResolvedValue(null);
        await syncTickets(mockTasksPath, {});
        expect(taskFileUtils.log).toHaveBeenCalledWith('error', 'No ticketing system configured or an error occurred.');
    });

});
