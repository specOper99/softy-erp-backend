import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { TransactionCategory } from '../entities/transaction-category.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionCategoriesService } from './transaction-categories.service';

describe('TransactionCategoriesService', () => {
  let service: TransactionCategoriesService;
  let repository: MockRepository<TransactionCategory>;

  const mockCategory: TransactionCategory = {
    id: 'category-uuid-123',
    name: 'Operational',
    description: 'Operational expenses',
    applicableType: TransactionType.EXPENSE,
    isActive: true,
    parentId: 'parent-id-placeholder' as string | null,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null as unknown as TransactionCategory,
    children: [] as unknown as TransactionCategory[],
  } as TransactionCategory;

  const mockCategory2: TransactionCategory = {
    id: 'category-uuid-456',
    name: 'Admin',
    description: 'Admin expenses',
    applicableType: TransactionType.EXPENSE,
    isActive: true,
    parentId: 'parent-id-placeholder' as string | null,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null as unknown as TransactionCategory,
    children: [] as unknown as TransactionCategory[],
  } as TransactionCategory;

  beforeEach(async () => {
    repository = createMockRepository<TransactionCategory>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCategoriesService,
        {
          provide: getRepositoryToken(TransactionCategory),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<TransactionCategoriesService>(TransactionCategoriesService);
    jest.clearAllMocks();
    mockTenantContext('tenant-123');
  });

  describe('findAll', () => {
    it('should return all categories for tenant', async () => {
      repository.find.mockResolvedValue([mockCategory, mockCategory2]);

      const result = await service.findAll();

      expect(result).toEqual([mockCategory, mockCategory2]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        order: { name: 'ASC' },
        relations: ['parent', 'children'],
      });
    });

    it('should return empty array when no categories exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return category by id', async () => {
      repository.findOne.mockResolvedValue(mockCategory);

      const result = await service.findById('category-uuid-123');

      expect(result).toEqual(mockCategory);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'category-uuid-123', tenantId: 'tenant-123' },
        relations: ['parent', 'children'],
      });
    });

    it('should throw NotFoundException when category not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new category', async () => {
      const dto = {
        name: 'New Category',
        description: 'Test description',
        applicableType: TransactionType.EXPENSE,
      };
      repository.save.mockImplementation((cat: any) => Promise.resolve({ ...cat, id: 'new-uuid' }));

      const result = await service.create(dto);

      expect(result.name).toBe('New Category');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate name', async () => {
      const dto = { name: 'Existing Category' };
      repository.save.mockRejectedValue({ code: '23505' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should create category with parentId', async () => {
      const dto = {
        name: 'Sub Category',
        parentId: 'category-uuid-123',
      };
      repository.save.mockImplementation((cat: any) => Promise.resolve({ ...cat, id: 'new-sub-uuid' }));

      const result = await service.create(dto);

      expect(result.parentId).toBe('category-uuid-123');
    });
  });

  describe('update', () => {
    it('should update category fields', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockResolvedValue({ ...mockCategory, name: 'Updated Name' });

      const result = await service.update('category-uuid-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when updating non-existent category', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update('invalid-id', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('should prevent circular reference when setting parent to self', async () => {
      repository.findOne.mockResolvedValue(mockCategory);

      await expect(service.update('category-uuid-123', { parentId: 'category-uuid-123' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException on duplicate name', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockRejectedValue({ code: '23505' });

      await expect(service.update('category-uuid-123', { name: 'Existing' })).rejects.toThrow(ConflictException);
    });

    it('should update isActive field', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockResolvedValue({ ...mockCategory, isActive: false });

      const result = await service.update('category-uuid-123', { isActive: false });

      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete category when no children', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.count.mockResolvedValue(0);
      repository.remove.mockResolvedValue(mockCategory);

      await service.delete('category-uuid-123');

      expect(repository.remove).toHaveBeenCalledWith(mockCategory);
    });

    it('should throw ConflictException when category has children', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.count.mockResolvedValue(2);

      await expect(service.delete('category-uuid-123')).rejects.toThrow(ConflictException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when category not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });
});
