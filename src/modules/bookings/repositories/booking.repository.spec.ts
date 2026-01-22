import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { BookingRepository } from './booking.repository';

describe('BookingRepository', () => {
  let repository: BookingRepository;
  let mockTypeOrmRepository: Repository<Booking>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<Booking>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingRepository,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<BookingRepository>(BookingRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
