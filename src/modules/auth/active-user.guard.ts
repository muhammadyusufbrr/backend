import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user.role === UserRole.OWNER || user.role === UserRole.ACTIVE_SELLER) {
      return true;
    }

    throw new ForbiddenException('Hisobingiz hali faollashtirilmagan. Iltimos, administrator bilan bog`laning.');
  }
}