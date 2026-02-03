import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { createPaginatedResponse, PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { AuditPublisher } from '../../audit/audit.publisher';
import { WalletService } from '../../finance/services/wallet.service';
import { UsersService } from '../../users/services/users.service';
import { CreateProfileDto, ProfileFilterDto, UpdateProfileDto } from '../dto';
import { Profile } from '../entities';
import { ProfileRepository } from '../repositories/profile.repository';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);
  private readonly tenantTx: TenantScopedManager;

  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly walletService: WalletService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  // Profile Methods
  async createProfile(dto: CreateProfileDto): Promise<Profile> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    try {
      return await this.tenantTx.run(async (manager) => {
        // Step 1: Validate user belongs to the same tenant
        const user = await this.usersService.findOne(dto.userId);
        if (!user) {
          throw new NotFoundException('User not found');
        }
        if (user.tenantId !== tenantId) {
          throw new BadRequestException('hr.user_not_found_in_tenant');
        }

        // Step 2: Create wallet for the user within the profile transaction
        await this.walletService.getOrCreateWalletWithManager(manager, dto.userId);

        // Step 3: Create profile
        const profile = this.profileRepository.create({
          ...dto,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        });
        const savedProfile = await manager.save(profile);

        // Step 4: Audit Log
        await this.auditService.log({
          action: 'CREATE',
          entityName: 'Profile',
          entityId: savedProfile.id,
          newValues: {
            userId: dto.userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            baseSalary: dto.baseSalary,
          },
        });

        return savedProfile;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        this.logger.warn(`Profile already exists for user ${dto.userId}`);
        throw new ConflictException(`Profile already exists for user ${dto.userId}`);
      }
      this.logger.error('Failed to create profile', e);
      throw e;
    } finally {
      // No cleanup needed with TenantScopedManager
    }
  }

  async findAllProfiles(query: PaginationDto = new PaginationDto()): Promise<Profile[]> {
    const profiles = await this.profileRepository.find({
      skip: query.getSkip(),
      take: query.getTake(),
    });

    await this.populateProfilesWithUsers(profiles);

    return profiles;
  }

  /**
   * @deprecated Use findAllProfilesWithFiltersCursor for better performance with large datasets
   */
  async findAllProfilesWithFilters(filter: ProfileFilterDto): Promise<PaginatedResponseDto<Profile>> {
    const qb = this.profileRepository.createQueryBuilder('profile');

    // Apply filters
    this.applyProfileFilters(qb, filter);

    // Get total count
    const total = await qb.getCount();

    // Apply pagination
    qb.skip(filter.getSkip()).take(filter.getTake());

    // Order by
    qb.orderBy('profile.hireDate', 'DESC').addOrderBy('profile.lastName', 'ASC');

    const profiles = await qb.getMany();

    // Populate user data
    await this.populateProfilesWithUsers(profiles);

    return createPaginatedResponse(profiles, total, filter.page || 1, filter.getTake());
  }

  async findAllProfilesWithFiltersCursor(
    filter: ProfileFilterDto,
  ): Promise<{ data: Profile[]; nextCursor: string | null }> {
    const qb = this.profileRepository.createQueryBuilder('profile');

    // Apply cursor pagination with filters
    const result = await CursorPaginationHelper.paginate(qb, {
      cursor: filter.cursor,
      limit: filter.limit,
      alias: 'profile',
      filters: (qb) => this.applyProfileFilters(qb, filter),
    });

    // Populate user data
    await this.populateProfilesWithUsers(result.data);

    return result;
  }

  private applyProfileFilters(qb: SelectQueryBuilder<Profile>, filter: ProfileFilterDto): void {
    if (filter.status) {
      qb.andWhere('profile.status = :status', { status: filter.status });
    }

    if (filter.department) {
      qb.andWhere('profile.department = :department', { department: filter.department });
    }

    if (filter.contractType) {
      qb.andWhere('profile.contractType = :contractType', { contractType: filter.contractType });
    }

    if (filter.search) {
      qb.andWhere(
        new Brackets((qb2) => {
          qb2
            .where('profile.firstName ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('profile.lastName ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('profile.employeeId ILIKE :search', { search: `%${filter.search}%` });
        }),
      );
    }
  }

  async findAllProfilesCursor(query: CursorPaginationDto): Promise<{ data: Profile[]; nextCursor: string | null }> {
    const limit = query.limit || 20;

    const qb = this.profileRepository.createQueryBuilder('profile');

    // Helper adds orderBy and cursor filter
    const { data: profiles, nextCursor } = await CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit,
      alias: 'profile',
    });

    await this.populateProfilesWithUsers(profiles);

    return { data: profiles, nextCursor };
  }

  async findProfileById(id: string): Promise<Profile> {
    const profile = await this.profileRepository.findOne({
      where: { id },
    });
    if (!profile) {
      throw new NotFoundException('hr.profile_not_found');
    }
    const user = await this.usersService.findOne(profile.userId);
    profile.user = user;
    return profile;
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const profile = await this.profileRepository.findOne({
      where: { userId },
    });

    if (profile) {
      const user = await this.usersService.findOne(userId);
      profile.user = user;
    }

    return profile;
  }

  async softDeleteProfileByUserId(userId: string): Promise<void> {
    // Use findOne without throwing if not found, as this might be called asynchronously
    const profile = await this.profileRepository.findOne({
      where: { userId },
    });

    if (profile) {
      await this.profileRepository.softRemove(profile);
      await this.auditService.log({
        action: 'DELETE',
        entityName: 'Profile',
        entityId: profile.id,
        notes: `Profile deleted via UserDeletedEvent for userId ${userId}`,
      });
    }
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.findProfileById(id);
    const oldValues = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      baseSalary: profile.baseSalary,
      jobTitle: profile.jobTitle,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      address: profile.address,
      city: profile.city,
      country: profile.country,
      department: profile.department,
      team: profile.team,
      contractType: profile.contractType,
    };

    Object.assign(profile, {
      ...dto,
      hireDate: dto.hireDate ? new Date(dto.hireDate) : profile.hireDate,
    });
    const savedProfile = await this.profileRepository.save(profile);

    // Only log if there are meaningful changes
    if (
      dto.baseSalary !== undefined ||
      dto.firstName ||
      dto.lastName ||
      dto.jobTitle ||
      dto.emergencyContactName ||
      dto.emergencyContactPhone ||
      dto.address ||
      dto.city ||
      dto.country ||
      dto.department ||
      dto.team ||
      dto.contractType
    ) {
      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'Profile',
        entityId: id,
        oldValues,
        newValues: dto,
      });
    }

    return savedProfile;
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = await this.findProfileById(id);
    await this.profileRepository.remove(profile);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'Profile',
      entityId: id,
      oldValues: {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
    });
  }

  private async populateProfilesWithUsers(profiles: Profile[]): Promise<void> {
    if (!profiles.length) return;
    const userIds = profiles.map((p) => p.userId);
    const users = await this.usersService.findMany(userIds);

    profiles.forEach((profile) => {
      profile.user = users.find((u) => u.id === profile.userId);
    });
  }
}
