import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsNotEmpty, IsString } from 'class-validator';
import { UzumService } from './uzum.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class ConnectUzumDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('uzum')
export class UzumController {
  constructor(private readonly uzumService: UzumService) {}

  /**
   * POST /uzum/connect
   * Foydalanuvchining Uzum API tokenini tekshiradi va do'konlarini sinxronlashtirad
   */
  @UseGuards(JwtAuthGuard)
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Req() req: Request,
    @Body() body: ConnectUzumDto,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    return this.uzumService.connectUzumApi(user.id, body.token);
  }

  /**
   * GET /uzum/status
   * Foydalanuvchining Uzum ulanish holati va do'konlar ro'yxatini qaytaradi
   */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req: Request) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    return this.uzumService.getUzumStatus(user.id);
  }

  /**
   * DELETE /uzum/disconnect
   * Foydalanuvchining Uzum hisobini va do'konlarini o'chiradi
   */
  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Req() req: Request) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    return this.uzumService.disconnectUzum(user.id);
  }
}