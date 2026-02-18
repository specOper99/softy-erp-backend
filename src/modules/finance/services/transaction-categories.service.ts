import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateTransactionCategoryDto, UpdateTransactionCategoryDto } from '../dto/transaction-category.dto';
import { TransactionCategory } from '../entities/transaction-category.entity';

@Injectable()
export class TransactionCategoriesService {
  private readonly logger = new Logger(TransactionCategoriesService.name);

  constructor(
    @InjectRepository(TransactionCategory)
    private readonly categoryRepository: Repository<TransactionCategory>,
  ) {}

  /**
   * Find all categories for the current tenant
   */
  async findAll(): Promise<TransactionCategory[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.categoryRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
      relations: ['parent', 'children'],
    });
  }

  /**
   * Find a category by ID
   */
  async findById(id: string): Promise<TransactionCategory> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const category = await this.categoryRepository.findOne({
      where: { id, tenantId },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException('finance.category_not_found');
    }

    return category;
  }

  /**
   * Create a new category
   */
  async create(dto: CreateTransactionCategoryDto): Promise<TransactionCategory> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      applicableType: dto.applicableType,
      parentId: dto.parentId,
      tenantId,
    });

    try {
      return await this.categoryRepository.save(category);
    } catch (error: unknown) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException('finance.category_name_already_exists');
      }
      throw error;
    }
  }

  /**
   * Update an existing category
   */
  async update(id: string, dto: UpdateTransactionCategoryDto): Promise<TransactionCategory> {
    const category = await this.findById(id);

    // Handle parent validation - prevent circular reference
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('finance.category_circular_reference');
      }

      // Check if parent exists and belongs to same tenant
      const parent = await this.categoryRepository.findOne({
        where: { id: dto.parentId, tenantId: category.tenantId },
      });

      if (!parent) {
        throw new NotFoundException('finance.parent_category_not_found');
      }
    }

    // Apply updates
    if (dto.name !== undefined) {
      category.name = dto.name;
    }
    if (dto.description !== undefined) {
      category.description = dto.description;
    }
    if (dto.applicableType !== undefined) {
      category.applicableType = dto.applicableType;
    }
    if (dto.parentId !== undefined) {
      category.parentId = dto.parentId;
    }
    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    try {
      return await this.categoryRepository.save(category);
    } catch (error: unknown) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException('finance.category_name_already_exists');
      }
      throw error;
    }
  }

  /**
   * Delete a category (soft delete by setting isActive to false)
   * Actually deletes the record since we don't have soft delete implemented
   */
  async delete(id: string): Promise<void> {
    const category = await this.findById(id);

    // Check if category has children
    const children = await this.categoryRepository.count({
      where: { parentId: id, tenantId: category.tenantId },
    });

    if (children > 0) {
      throw new ConflictException('finance.category_has_children');
    }

    await this.categoryRepository.remove(category);
  }
}
