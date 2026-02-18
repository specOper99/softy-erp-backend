import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateVendorDto } from '../dto';
import { Vendor } from '../entities';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
  ) {}

  async create(dto: CreateVendorDto): Promise<Vendor> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const vendor = this.vendorRepository.create({
      tenantId,
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      notes: dto.notes ?? null,
    });

    return this.vendorRepository.save(vendor);
  }

  async findAll(): Promise<Vendor[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.vendorRepository.find({
      where: { tenantId },
      order: { name: 'ASC', createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Vendor> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const vendor = await this.vendorRepository.findOne({
      where: { id, tenantId },
    });

    if (!vendor) {
      throw new NotFoundException('finance.vendor_not_found');
    }

    return vendor;
  }
}
