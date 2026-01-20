import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Role } from '../enums/role.enum';
import { UsersService } from '../services/users.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUser = { id: 'uuid', email: 'test@example.com', role: Role.ADMIN };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockUser),
            findAll: jest.fn().mockResolvedValue([mockUser]),
            findOne: jest.fn().mockResolvedValue(mockUser),
            findByEmail: jest.fn().mockResolvedValue(mockUser),
            update: jest.fn().mockResolvedValue(mockUser),
            remove: jest.fn().mockResolvedValue(undefined),
            findAllCursor: jest.fn().mockResolvedValue({ data: [mockUser], nextCursor: null }),
          },
        },
        { provide: getRepositoryToken(Tenant), useValue: {} },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'password',
        role: Role.FIELD_STAFF,
      };
      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      await controller.findAll({} as PaginationDto);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findAllCursor', () => {
    it('should call service.findAllCursor', async () => {
      const query = { limit: 10, cursor: 'abc' };
      await controller.findAllCursor(query);
      expect(service.findAllCursor).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      await controller.findOne('uuid');
      expect(service.findOne).toHaveBeenCalledWith('uuid');
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { email: 'updated@example.com' };
      await controller.update('uuid', dto);
      expect(service.update).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      await controller.remove('uuid');
      expect(service.remove).toHaveBeenCalledWith('uuid');
    });
  });
});
