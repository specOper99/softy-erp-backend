import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANT_REPO_TRANSACTION_CATEGORY } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { isPostgresUniqueViolation } from '../../../common/utils/error.util';
import { CreateTransactionCategoryDto, UpdateTransactionCategoryDto } from '../dto/transaction-category.dto';
import { TransactionCategory } from '../entities/transaction-category.entity';

@Injectable()
export class TransactionCategoriesService {
  constructor(
    @Inject(TENANT_REPO_TRANSACTION_CATEGORY)
    private readonly categoryRepository: TenantAwareRepository<TransactionCategory>,
  ) {}

  async findAll(): Promise<TransactionCategory[]> {
    return this.categoryRepository.find({
      order: { name: 'ASC' },
      relations: ['parent', 'children'],
    });
  }

  async findById(id: string): Promise<TransactionCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException('finance.category_not_found');
    }

    return category;
  }

  async create(dto: CreateTransactionCategoryDto): Promise<TransactionCategory> {
    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      applicableType: dto.applicableType,
      parentId: dto.parentId,
    });

    try {
      return await this.categoryRepository.save(category);
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('finance.category_name_already_exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTransactionCategoryDto): Promise<TransactionCategory> {
    const category = await this.findById(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('finance.category_circular_reference');
      }

      const parent = await this.categoryRepository.findOne({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('finance.parent_category_not_found');
      }
    }

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
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('finance.category_name_already_exists');
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const category = await this.findById(id);

    const children = await this.categoryRepository.count({
      where: { parentId: id },
    });

    if (children > 0) {
      throw new ConflictException('finance.category_has_children');
    }

    await this.categoryRepository.remove(category);
  }
}
