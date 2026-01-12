import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EmployeeWallet } from '../../finance/entities/employee-wallet.entity';
import { WalletService } from '../../finance/services/wallet.service';
import { CreateProfileDto, UpdateProfileDto } from '../dto';
import { Profile } from '../entities';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(EmployeeWallet)
    private readonly walletRepository: Repository<EmployeeWallet>,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // Profile Methods
  async createProfile(dto: CreateProfileDto): Promise<Profile> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate user belongs to the same tenant
      const user = await queryRunner.manager.findOne('User', {
        where: { id: dto.userId, tenantId },
      });
      if (!user) {
        throw new BadRequestException('hr.user_not_found_in_tenant');
      }

      // Step 2: Create wallet for the user within the profile transaction
      await this.walletService.getOrCreateWalletWithManager(
        queryRunner.manager,
        dto.userId,
      );

      // Step 2: Create profile
      const profile = queryRunner.manager.create(Profile, {
        ...dto,
        tenantId,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
      });
      const savedProfile = await queryRunner.manager.save(profile);

      // Step 3: Audit Log (outside transaction if preferred, but here included for consistency)
      await this.auditService.log(
        {
          action: 'CREATE',
          entityName: 'Profile',
          entityId: savedProfile.id,
          newValues: {
            userId: dto.userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            baseSalary: dto.baseSalary,
          },
        },
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      return savedProfile;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      if ((e as { code?: string }).code === '23505') {
        this.logger.warn(`Profile already exists for user ${dto.userId}`);
        throw new ConflictException(
          `Profile already exists for user ${dto.userId}`,
        );
      }
      this.logger.error('Failed to create profile', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllProfiles(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Profile[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.profileRepository.find({
      where: { tenantId },
      relations: ['user'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllProfilesCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: Profile[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const limit = query.limit || 20;

    const qb = this.profileRepository.createQueryBuilder('profile');

    qb.leftJoinAndSelect('profile.user', 'user')
      .where('profile.tenantId = :tenantId', { tenantId })
      .orderBy('profile.createdAt', 'DESC')
      .addOrderBy('profile.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
      const [dateStr, id] = decoded.split('|');
      const date = new Date(dateStr);

      qb.andWhere(
        '(profile.createdAt < :date OR (profile.createdAt = :date AND profile.id < :id))',
        { date, id },
      );
    }

    const profiles = await qb.getMany();
    let nextCursor: string | null = null;

    if (profiles.length > limit) {
      profiles.pop();
      const lastItem = profiles[profiles.length - 1];
      const cursorData = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return { data: profiles, nextCursor };
  }

  async findProfileById(id: string): Promise<Profile> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const profile = await this.profileRepository.findOne({
      where: { id, tenantId },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException('hr.profile_not_found');
    }
    return profile;
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.profileRepository.findOne({
      where: { userId, tenantId },
      relations: ['user'],
    });
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
}
