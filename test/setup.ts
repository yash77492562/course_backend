import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

// Global test setup
beforeAll(async () => {
  // Setup global test configuration
});

afterAll(async () => {
  // Cleanup global test resources
});

// Mock Redis for tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    setex: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  }));
});

// Mock BullMQ for tests
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getJobCounts: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));