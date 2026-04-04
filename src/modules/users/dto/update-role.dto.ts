import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateRoleDto {
  @IsNotEmpty()
  @IsEnum(UserRole, { message: 'Noto\'g\'ri rol tanlandi' })
  role: UserRole;
}