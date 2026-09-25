import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type {
  ListAdminCategoriesDto,
  ListPublicCategoriesDto,
} from './dto/list-category-query.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';
import { addCategorySlugSuffix, createCategorySlug } from './category-slug.js';

const categoryResponseSelect = {
  id: true,
  code: true,
  name: true,
  slug: true,
  scope: true,
  description: true,
  icon: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CategorySelect;

export type CategoryResponse = Prisma.CategoryGetPayload<{
  select: typeof categoryResponseSelect;
}>;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    const existingCode = await this.prisma.category.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (existingCode)
      throw new ConflictException('Category code already exists');

    const baseSlug = createCategorySlug(dto.name);
    let slug = await this.findAvailableSlug(baseSlug);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.category.create({
          data: {
            code: dto.code,
            name: dto.name,
            slug,
            scope: dto.scope,
            description: dto.description,
            icon: dto.icon,
            sortOrder: dto.sortOrder,
            isActive: true,
          },
          select: categoryResponseSelect,
        });
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const duplicateCode = await this.prisma.category.findUnique({
          where: { code: dto.code },
          select: { id: true },
        });
        if (duplicateCode) {
          throw new ConflictException('Category code already exists');
        }
        slug = addCategorySlugSuffix(baseSlug, randomUUID().slice(0, 8));
      }
    }

    throw new ConflictException('Could not generate a unique Category slug');
  }

  listPublic(query: ListPublicCategoriesDto): Promise<CategoryResponse[]> {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        scope: query.scope,
        ...this.searchWhere(query.search),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: categoryResponseSelect,
    });
  }

  async findPublicBySlug(slug: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      select: categoryResponseSelect,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  listAdmin(query: ListAdminCategoriesDto): Promise<CategoryResponse[]> {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
        scope: query.scope,
        isActive: query.isActive,
        ...this.searchWhere(query.search),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: categoryResponseSelect,
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    try {
      return await this.prisma.category.update({
        where: { id, deletedAt: null },
        data: dto,
        select: categoryResponseSelect,
      });
    } catch (error: unknown) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Category not found');
      }
      throw error;
    }
  }

  activate(id: string): Promise<CategoryResponse> {
    return this.setActive(id, true);
  }

  deactivate(id: string): Promise<CategoryResponse> {
    return this.setActive(id, false);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.prisma.category.updateMany({
      where: { id, deletedAt: null },
      data: { isActive: false, deletedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('Category not found');
  }

  private async setActive(
    id: string,
    isActive: boolean,
  ): Promise<CategoryResponse> {
    const result = await this.prisma.category.updateMany({
      where: { id, deletedAt: null },
      data: { isActive },
    });
    if (result.count !== 1) throw new NotFoundException('Category not found');
    return this.findAdminById(id);
  }

  private async findAdminById(id: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: categoryResponseSelect,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private searchWhere(search?: string): Prisma.CategoryWhereInput {
    if (!search) return {};
    return {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  private async findAvailableSlug(baseSlug: string): Promise<string> {
    const existing = await this.prisma.category.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });
    return existing
      ? addCategorySlugSuffix(baseSlug, randomUUID().slice(0, 8))
      : baseSlug;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isRecordNotFoundError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
