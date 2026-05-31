import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from '../pagination.service';
import { PaginationDto } from '../../dto/pagination.dto';

describe('PaginationService - Unit Tests', () => {
  let service: PaginationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationService],
    }).compile();

    service = module.get<PaginationService>(PaginationService);
  });

  describe('createPaginatedResult', () => {
    it('should create paginated result with default values', () => {
      // Arrange
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const total = 25;
      const paginationDto: PaginationDto = {};

      // Act
      const result = service.createPaginatedResult(data, total, paginationDto);

      // Assert
      expect(result).toEqual({
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      });
    });

    it('should create paginated result with custom page and limit', () => {
      // Arrange
      const data = [{ id: 11 }, { id: 12 }];
      const total = 25;
      const paginationDto: PaginationDto = { page: 2, limit: 5 };

      // Act
      const result = service.createPaginatedResult(data, total, paginationDto);

      // Assert
      expect(result).toEqual({
        data,
        pagination: {
          page: 2,
          limit: 5,
          total: 25,
          totalPages: 5,
          hasNext: true,
          hasPrev: true,
        },
      });
    });

    it('should handle last page correctly', () => {
      // Arrange
      const data = [{ id: 21 }, { id: 22 }, { id: 23 }];
      const total = 23;
      const paginationDto: PaginationDto = { page: 3, limit: 10 };

      // Act
      const result = service.createPaginatedResult(data, total, paginationDto);

      // Assert
      expect(result).toEqual({
        data,
        pagination: {
          page: 3,
          limit: 10,
          total: 23,
          totalPages: 3,
          hasNext: false,
          hasPrev: true,
        },
      });
    });

    it('should handle single page result', () => {
      // Arrange
      const data = [{ id: 1 }, { id: 2 }];
      const total = 2;
      const paginationDto: PaginationDto = { page: 1, limit: 10 };

      // Act
      const result = service.createPaginatedResult(data, total, paginationDto);

      // Assert
      expect(result).toEqual({
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });

    it('should handle empty data', () => {
      // Arrange
      const data: any[] = [];
      const total = 0;
      const paginationDto: PaginationDto = { page: 1, limit: 10 };

      // Act
      const result = service.createPaginatedResult(data, total, paginationDto);

      // Assert
      expect(result).toEqual({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });

  describe('getSkip', () => {
    it('should calculate skip for first page', () => {
      // Act
      const skip = service.getSkip(1, 10);

      // Assert
      expect(skip).toBe(0);
    });

    it('should calculate skip for second page', () => {
      // Act
      const skip = service.getSkip(2, 10);

      // Assert
      expect(skip).toBe(10);
    });

    it('should calculate skip for custom page and limit', () => {
      // Act
      const skip = service.getSkip(3, 5);

      // Assert
      expect(skip).toBe(10);
    });

    it('should use default values when not provided', () => {
      // Act
      const skip = service.getSkip();

      // Assert
      expect(skip).toBe(0);
    });
  });

  describe('buildPrismaQuery', () => {
    it('should build query with default values', () => {
      // Arrange
      const paginationDto: PaginationDto = {};

      // Act
      const query = service.buildPrismaQuery(paginationDto);

      // Assert
      expect(query).toEqual({
        skip: 0,
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should build query with custom pagination', () => {
      // Arrange
      const paginationDto: PaginationDto = {
        page: 2,
        limit: 5,
        sortBy: 'title',
        sortOrder: 'asc',
      };

      // Act
      const query = service.buildPrismaQuery(paginationDto);

      // Assert
      expect(query).toEqual({
        skip: 5,
        take: 5,
        orderBy: {
          title: 'asc',
        },
      });
    });

    it('should use default sort order when not provided', () => {
      // Arrange
      const paginationDto: PaginationDto = {
        sortBy: 'name',
      };

      // Act
      const query = service.buildPrismaQuery(paginationDto);

      // Assert
      expect(query.orderBy).toEqual({
        name: 'desc',
      });
    });

    it('should use createdAt when sortBy is not provided', () => {
      // Arrange
      const paginationDto: PaginationDto = {
        sortOrder: 'asc',
      };

      // Act
      const query = service.buildPrismaQuery(paginationDto);

      // Assert
      expect(query.orderBy).toEqual({
        createdAt: 'asc',
      });
    });
  });

  describe('buildSearchFilter', () => {
    it('should build search filter for multiple fields', () => {
      // Arrange
      const search = 'test query';
      const searchFields = ['title', 'description', 'category'];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({
        OR: [
          {
            title: {
              contains: 'test query',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'test query',
              mode: 'insensitive',
            },
          },
          {
            category: {
              contains: 'test query',
              mode: 'insensitive',
            },
          },
        ],
      });
    });

    it('should return empty object when search is empty', () => {
      // Arrange
      const search = '';
      const searchFields = ['title', 'description'];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({});
    });

    it('should return empty object when search is null', () => {
      // Arrange
      const search = null as any;
      const searchFields = ['title', 'description'];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({});
    });

    it('should return empty object when search is undefined', () => {
      // Arrange
      const search = undefined as any;
      const searchFields = ['title', 'description'];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({});
    });

    it('should handle single search field', () => {
      // Arrange
      const search = 'single field search';
      const searchFields = ['title'];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({
        OR: [
          {
            title: {
              contains: 'single field search',
              mode: 'insensitive',
            },
          },
        ],
      });
    });

    it('should handle empty search fields array', () => {
      // Arrange
      const search = 'test';
      const searchFields: string[] = [];

      // Act
      const filter = service.buildSearchFilter(search, searchFields);

      // Assert
      expect(filter).toEqual({
        OR: [],
      });
    });
  });
});