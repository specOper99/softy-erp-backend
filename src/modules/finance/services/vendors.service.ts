import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANT_REPO_VENDOR } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { CreateVendorDto, UpdateVendorDto } from '../dto';
import { Vendor } from '../entities';

@Injectable()
export class VendorsService {
  constructor(
    @Inject(TENANT_REPO_VENDOR)
    private readonly vendorRepository: TenantAwareRepository<Vendor>,
  ) {}

  async create(dto: CreateVendorDto): Promise<Vendor> {
    const vendor = this.vendorRepository.create({
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      notes: dto.notes ?? null,
    });

    return this.vendorRepository.save(vendor);
  }

  async findAll(): Promise<Vendor[]> {
    return this.vendorRepository.find({
      order: { name: 'ASC', createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Vendor> {
    const vendor = await this.vendorRepository.findOne({
      where: { id },
    });

    if (!vendor) {
      throw new NotFoundException('finance.vendor_not_found');
    }

    return vendor;
  }

  async update(id: string, dto: UpdateVendorDto): Promise<Vendor> {
    const vendor = await this.findById(id);
    if (dto.name !== undefined) vendor.name = dto.name;
    if (dto.email !== undefined) vendor.email = dto.email ?? null;
    if (dto.phone !== undefined) vendor.phone = dto.phone ?? null;
    if (dto.notes !== undefined) vendor.notes = dto.notes ?? null;
    return this.vendorRepository.save(vendor);
  }

  async remove(id: string): Promise<void> {
    const vendor = await this.findById(id);
    await this.vendorRepository.remove(vendor);
  }
}
