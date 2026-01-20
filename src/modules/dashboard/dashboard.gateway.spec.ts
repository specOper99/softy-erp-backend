import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { DashboardGateway } from './dashboard.gateway';

describe('DashboardGateway', () => {
  let gateway: DashboardGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardGateway,
        // Mock WsJwtGuard since it is used in UseGuards
        {
          provide: WsJwtGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            isBlacklisted: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    gateway = module.get<DashboardGateway>(DashboardGateway);

    // Mock the server with .to() method
    const mockEmit = jest.fn();
    const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    gateway.server = {
      emit: jest.fn(),
      to: mockTo,
    } as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('handleConnection() joins tenant room when token is valid', async () => {
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer valid-token' }, query: {}, auth: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const jwtService = gateway['jwtService'];
    (jwtService.verifyAsync as jest.Mock).mockReturnValue({ tenantId: 'tenant-123', sub: 'user-123' });

    await gateway.handleConnection(mockClient);

    expect(mockClient.join).toHaveBeenCalledWith('tenant:tenant-123');
  });

  it('handleConnection() does nothing when token is invalid', async () => {
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer invalid-token' }, query: {}, auth: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const jwtService = gateway['jwtService'];
    (jwtService.verifyAsync as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    await gateway.handleConnection(mockClient);

    expect(mockClient.join).not.toHaveBeenCalled();
  });

  it('should handle disconnection', () => {
    gateway.handleDisconnect({} as any);
    // Expect nothing to happen essentially as it is empty
  });

  it('broadcastMetricsUpdate() emits only to tenant room', () => {
    const tenantId = 'tenant-1';
    const type = 'BOOKING';
    const data = { a: 1 };

    gateway.broadcastMetricsUpdate(tenantId, type, data);

    expect(gateway.server.to).toHaveBeenCalledWith(`tenant:${tenantId}`);
    expect(gateway.server.emit).not.toHaveBeenCalled();
  });

  it('should broadcast metrics update', () => {
    const tenantId = 'tenant-1';
    const type = 'BOOKING';
    const data = { count: 1 };

    gateway.broadcastMetricsUpdate(tenantId, type, data);

    // Check that .to() was called with the correct room
    expect(gateway.server.to).toHaveBeenCalledWith(`tenant:${tenantId}`);

    // Check that emit was called on the namespace returned by .to()
    const mockNamespace = gateway.server.to.mock.results[0].value;
    expect(mockNamespace.emit).toHaveBeenCalledWith('metrics:update', { type, data });
  });
});
