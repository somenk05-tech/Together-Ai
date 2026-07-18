import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from './types';

/** Injects the authenticated user (set by JwtAuthGuard) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtUser;
  },
);
