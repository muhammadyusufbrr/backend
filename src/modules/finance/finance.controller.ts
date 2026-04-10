import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @Req() req: Request,
    @Body() body: { dateFrom?: number; dateTo?: number; shopId?: string },
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.syncFinances(
      user.id,
      body.dateFrom,
      body.dateTo,
      body.shopId ?? null,
    );
  }

  @Get('kpi')
  async getKpi(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('shopId') shopId?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getKpiSummary(
      user.id,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
      shopId || null,
    );
  }

  @Get('chart')
  async getChart(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('shopId') shopId?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getChartData(
      user.id,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
      shopId || null,
    );
  }

  // Rule 4: returns — startDate/endDate qo'shildi
  @Get('returns')
  async getReturns(
    @Req() req: Request,
    @Query('shopId') shopId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getReturnReasons(
      user.id,
      shopId || null,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
    );
  }

  // Rule 4: top-products — startDate/endDate qo'shildi
  @Get('top-products')
  async getTopProducts(
    @Req() req: Request,
    @Query('shopId') shopId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getTopProducts(
      user.id,
      shopId || null,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
    );
  }

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(
        `'${field}' yaroqsiz format. Kutilgan: YYYY-MM-DD`,
      );
    }
    return d;
  }
}
