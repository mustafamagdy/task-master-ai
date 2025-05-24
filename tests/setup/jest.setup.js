// Global Jest setup
import { jest } from '@jest/globals';

// Mock process.exit to prevent tests from actually exiting
jest.spyOn(process, 'exit').mockImplementation(() => {
  console.log('process.exit was mocked and did not terminate the process');
  return undefined;
});

// Set test timeout
jest.setTimeout(30000);

// Global afterAll hook to ensure all mocks are restored
afterAll(() => {
  jest.restoreAllMocks();
}); 