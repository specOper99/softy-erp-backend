import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateProcessingTypeDto, UpdateProcessingTypeDto } from '../dto/processing-type.dto';
import { ProcessingType } from '../entities/processing-type.entity';
import { ProcessingTypeRepository } from '../repositories/processing-type.repository';

@Injectable()
export class ProcessingTypeService {
  constructor(private readonly repository: ProcessingTypeRepository) {}

  async findAll(): Promise<ProcessingType[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.repository.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ProcessingType> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const entity = await this.repository.findOne({ where: { id, tenantId } });
    if (!entity)
      throw new NotFoundException({
        code: 'processing_type.not_found',
        args: { id },
      });
    return entity;
  }

  async findByIds(ids: string[]): Promise<ProcessingType[]> {
    if (ids.length === 0) return [];
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.repository.find({ where: { id: In(ids), tenantId } });
  }

  async create(dto: CreateProcessingTypeDto): Promise<ProcessingType> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const exists = await this.repository.findOne({ where: { tenantId, name: dto.name } });
    if (exists) throw new ConflictException('processing_type.name_already_exists');

    const entity = this.repository.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      price: dto.price ?? 0,
      defaultCommissionAmount: dto.defaultCommissionAmount ?? 0,
    });
    return this.repository.save(entity);
  }

  async update(id: string, dto: UpdateProcessingTypeDto): Promise<ProcessingType> {
    const entity = await this.findOne(id);

    if (dto.name !== undefined && dto.name !== entity.name) {
      const tenantId = TenantContextService.getTenantIdOrThrow();
      const conflict = await this.repository.findOne({ where: { tenantId, name: dto.name } });
      if (conflict) throw new ConflictException('processing_type.name_already_exists');
      entity.name = dto.name;
    }
    if (dto.description !== undefined) entity.description = dto.description ?? null;
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) entity.isActive = dto.isActive;
    if (dto.price !== undefined) entity.price = dto.price;
    if (dto.defaultCommissionAmount !== undefined) entity.defaultCommissionAmount = dto.defaultCommissionAmount;

    return this.repository.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repository.remove(entity);
  }
}
