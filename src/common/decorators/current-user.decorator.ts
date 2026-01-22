import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';

interface RequestWithUser extends Request {
  user?: User;
}

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): User | User[keyof User] | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
