import { Controller, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard) 
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.OWNER)
  @Get()
  async getAllUsers(
    @Query('search') search?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.usersService.getAllUsers(Number(page), Number(limit), search);
  }

  @Roles(UserRole.OWNER) 
  @Patch(':id/role')
  async updateRole(
    @Param('id') targetUserId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateUserRole(targetUserId, dto);
  }
}