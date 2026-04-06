import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Admin panel uchun hamma foydalanuvchilarni chiqarish
  async getAllUsers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;

    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
      }
    };
  }

  // Rolni o'zgartirish mantiqi
  async updateUserRole(targetUserId: string, dto: UpdateRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: dto.role },
      select: { id: true, email: true, role: true }
    });

    return {
      message: 'Foydalanuvchi roli muvaffaqiyatli yangilandi',
      user: updatedUser,
    };
  }
}