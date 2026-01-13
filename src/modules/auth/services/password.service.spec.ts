import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { UsersService } from '../../users/services/users.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('PasswordService', () => {
  let service: PasswordService;
  let passwordResetRepository: Repository<PasswordResetToken>;
  let usersService: UsersService;
  let mailService: MailService;
  let _dataSource: DataSource;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockPasswordResetRepo = {
    update: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
  };

  const mockMailService = {
    queuePasswordReset: jest.fn(),
  };

  const mockTokenService = {};

  const mockDataSource = {
    manager: {
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetRepo,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
    passwordResetRepository = module.get<Repository<PasswordResetToken>>(getRepositoryToken(PasswordResetToken));
    usersService = module.get<UsersService>(UsersService);
    mailService = module.get<MailService>(MailService);
    _dataSource = module.get<DataSource>(DataSource);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    it('should calculate crypto hash even if user not found (Timing Attack Mitigation)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword('nonexistent@example.com');

      expect(usersService.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
      // Ensure we didn't save anything
      expect(passwordResetRepository.save).not.toHaveBeenCalled();
      expect(mailService.queuePasswordReset).not.toHaveBeenCalled();
    });

    it('should generate token and send email if user exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await service.forgotPassword('test@example.com');

      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(passwordResetRepository.update).toHaveBeenCalled();
      expect(passwordResetRepository.save).toHaveBeenCalled();
      expect(mailService.queuePasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          name: 'test@example.com',
          token: expect.any(String),
        }),
      );
    });
  });
});
