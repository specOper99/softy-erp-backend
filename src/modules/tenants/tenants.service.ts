import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantRepository.create(createTenantDto);
    return this.tenantRepository.save(tenant);
  }

  async createWithManager(manager: EntityManager, createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = manager.create(Tenant, createTenantDto);
    return manager.save(tenant);
  }

  // PERFORMANCE: Added pagination to prevent unbounded query memory consumption
  async findAll(query: PaginationDto = new PaginationDto()): Promise<Tenant[]> {
    return this.tenantRepository.find({
      skip: query.getSkip(),
      take: query.getTake(),
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with slug ${slug} not found`);
    }
    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    const { parentTenantId, ...rest } = updateTenantDto;

    Object.assign(tenant, rest);

    if (parentTenantId) {
      // Efficiently set relation by ID without loading the whole entity
      tenant.parent = { id: parentTenantId } as Tenant;
    }

    return this.tenantRepository.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantRepository.remove(tenant);
  }
}
