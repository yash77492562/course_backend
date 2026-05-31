import { Injectable } from '@nestjs/common';
import { PaginationDto, PaginatedResult } from '../dto/pagination.dto';

@Injectable()
export class PaginationService {
  createPaginatedResult<T>(
    data: T[],
    total: number,
    paginationDto: PaginationDto,
  ): PaginatedResult<T> {
    const { page = 1, limit = 10 } = paginationDto;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  getSkip(page: number = 1, limit: number = 10): number {
    return (page - 1) * limit;
  }

  buildPrismaQuery(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search, sortBy, sortOrder = 'desc' } = paginationDto;
    
    const query: any = {
      skip: this.getSkip(page, limit),
      take: limit,
    };

    if (sortBy) {
      query.orderBy = {
        [sortBy]: sortOrder,
      };
    } else {
      query.orderBy = {
        createdAt: sortOrder,
      };
    }

    return query;
  }

  buildSearchFilter(search: string, searchFields: string[]) {
    if (!search) return {};

    return {
      OR: searchFields.map(field => ({
        [field]: {
          contains: search,
          mode: 'insensitive',
        },
      })),
    };
  }
}