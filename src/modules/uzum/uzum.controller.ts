import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { UzumService } from './uzum.service';
import { AddUzumTokenDto } from './dto/add-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 
import type { Request } from 'express';

@Controller('api/uzum')
export class UzumController {
  constructor(private readonly uzumService: UzumService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sync-shops')
  async syncShops(@Req() req: Request, @Body() dto: AddUzumTokenDto) {
    const user = req.user as { id: string };
    const userId = user.id; 
    return this.uzumService.fetchAndSaveShops(userId, dto);
  }
}