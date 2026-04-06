import {
  Controller,
  Post,
  Get,
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

  /**
   * POST /finance/sync
   * Uzum Finance API dan ma'lumotlarni oladi va bazaga saqlaydi
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@Req() req: Request) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.syncFinances(user.id);
  }

  /**
   * GET /finance/kpi?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * KPI xulosasini qaytaradi: daromad, xarajatlar, tannarx, sof foyda
   */
  @Get('kpi')
  async getKpi(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');

    return this.financeService.getKpiSummary(
      user.id,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
    );
  }

  /**
   * GET /finance/chart?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * Kunlik daromad va foyda grafigi uchun ma'lumotlar
   */
  @Get('chart')
  async getChart(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');

    return this.financeService.getChartData(
      user.id,
      startDate ? this.parseDate(startDate, 'startDate') : undefined,
      endDate ? this.parseDate(endDate, 'endDate') : undefined,
    );
  }

  /**
   * GET /finance/returns
   * Qaytarish sabablari guruhlangan holda qaytaradi
   */
  @Get('returns')
  async getReturns(@Req() req: Request) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getReturnReasons(user.id);
  }

  /**
   * GET /finance/top-products
   * Top 5 mahsulot: sof foyda va qaytarishlar bo'yicha
   */
  @Get('top-products')
  async getTopProducts(@Req() req: Request) {
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    return this.financeService.getTopProducts(user.id);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(
        `'${field}' qiymati yaroqsiz sana formati. Kutilgan format: YYYY-MM-DD`,
      );
    }
    return d;
  }
}
