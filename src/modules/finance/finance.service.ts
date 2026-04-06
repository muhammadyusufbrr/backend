import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Uzum API Response Types ──────────────────────────────────────────────────

interface UzumFinanceOrderItem {
  id: number | bigint;
  shopId: number | bigint;
  orderId: number | bigint;
  productId: number | bigint;
  skuTitle: string;
  status: string;
  dateIssued: number; // Unix epoch milliseconds
  sellerPrice: number;
  amount: number;
  amountReturns: number;
  commission: number;
  sellerProfit: number;
  purchasePrice: number;
  logisticDeliveryFee: number;
  returnCause?: string;
}

interface UzumFinanceResponse {
  orderItems: UzumFinanceOrderItem[];
}

// ─── Analytics Return Types ───────────────────────────────────────────────────

export interface KpiSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalCogs: number;
  netProfit: number;
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface ReturnReason {
  cause: string;
  count: number;
  totalReturns: number;
}

export interface TopProduct {
  skuTitle: string;
  value: number;
}

export interface TopProductsResult {
  byProfit: TopProduct[];
  byReturns: TopProduct[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  private readonly UZUM_FINANCE_URL =
    'https://api-seller.uzum.uz/api/seller-openapi/v1/finance/orders';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Helper: resolve UzumAccount ──────────────────────────────────────────

  private async resolveAccount(userId: string) {
    const account = await this.prisma.uzumAccount.findUnique({
      where: { sellerId: userId },
      include: { shops: true },
    });

    if (!account) {
      throw new NotFoundException(
        "Uzum hisobi topilmadi. Avval Uzum API ni ulang ('{POST /uzum/connect}').",
      );
    }

    return account;
  }

  // ─── Date filter where clause ─────────────────────────────────────────────

  private dateFilter(startDate?: Date, endDate?: Date) {
    if (!startDate && !endDate) return {};
    return {
      dateIssued: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      },
    };
  }

  // ─── syncFinances ─────────────────────────────────────────────────────────

  async syncFinances(userId: string): Promise<{ synced: number }> {
    const account = await this.resolveAccount(userId);

    const shopIds = account.shops.map((s) => String(s.uzumShopId));

    if (shopIds.length === 0) {
      return { synced: 0 };
    }

    // Fetch from Uzum Finance API
    let orderItems: UzumFinanceOrderItem[];
    try {
      const response = await firstValueFrom(
        this.httpService.get<UzumFinanceResponse>(this.UZUM_FINANCE_URL, {
          headers: { Authorization: account.token },
          params: { shopIds: shopIds.join(',') },
        }),
      );
      orderItems = Array.isArray(response.data?.orderItems)
        ? response.data.orderItems
        : [];
    } catch (err) {
      const axiosError = err as AxiosError;
      const status = axiosError.response?.status;
      this.logger.error(
        `Uzum Finance API error for user ${userId}: HTTP ${status ?? 'tarmoq xatosi'}`,
        axiosError.response?.data,
      );
      throw new InternalServerErrorException(
        `Uzum Finance API bilan ulanishda xatolik: HTTP ${status ?? 'tarmoq xatosi'}`,
      );
    }

    if (orderItems.length === 0) {
      return { synced: 0 };
    }

    // Upsert all items in a single transaction
    await this.prisma.$transaction(
      orderItems.map((item) =>
        this.prisma.financeItem.upsert({
          where: { id: BigInt(item.id) },
          update: {
            shopId: BigInt(item.shopId),
            orderId: BigInt(item.orderId),
            productId: BigInt(item.productId),
            skuTitle: item.skuTitle,
            status: item.status,
            dateIssued: new Date(item.dateIssued),
            sellerPrice: item.sellerPrice,
            amount: item.amount,
            amountReturns: item.amountReturns,
            commission: item.commission,
            sellerProfit: item.sellerProfit,
            purchasePrice: item.purchasePrice,
            logisticDeliveryFee: item.logisticDeliveryFee,
            returnCause: item.returnCause ?? null,
            updatedAt: new Date(),
          },
          create: {
            id: BigInt(item.id),
            uzumAccountId: account.id,
            shopId: BigInt(item.shopId),
            orderId: BigInt(item.orderId),
            productId: BigInt(item.productId),
            skuTitle: item.skuTitle,
            status: item.status,
            dateIssued: new Date(item.dateIssued),
            sellerPrice: item.sellerPrice,
            amount: item.amount,
            amountReturns: item.amountReturns,
            commission: item.commission,
            sellerProfit: item.sellerProfit,
            purchasePrice: item.purchasePrice,
            logisticDeliveryFee: item.logisticDeliveryFee,
            returnCause: item.returnCause ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ),
    );

    this.logger.log(
      `Synced ${orderItems.length} finance items for user ${userId}`,
    );
    return { synced: orderItems.length };
  }

  // ─── getKpiSummary ────────────────────────────────────────────────────────

  async getKpiSummary(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<KpiSummary> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        ...this.dateFilter(startDate, endDate),
      },
      select: {
        sellerPrice: true,
        amount: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
        sellerProfit: true,
      },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCogs = 0;

    for (const item of items) {
      totalRevenue += item.sellerPrice * item.amount;
      totalExpenses += item.commission + item.logisticDeliveryFee;
      totalCogs += item.purchasePrice * item.amount;
    }

    const netProfit = totalRevenue - totalExpenses - totalCogs;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalCogs: Math.round(totalCogs * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
    };
  }

  // ─── getChartData ─────────────────────────────────────────────────────────

  async getChartData(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ChartDataPoint[]> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        ...this.dateFilter(startDate, endDate),
      },
      select: {
        dateIssued: true,
        sellerPrice: true,
        amount: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
      },
      orderBy: { dateIssued: 'asc' },
    });

    const dayMap = new Map<string, { revenue: number; profit: number }>();

    for (const item of items) {
      const dateKey = item.dateIssued.toISOString().slice(0, 10); // YYYY-MM-DD
      const revenue = item.sellerPrice * item.amount;
      const expenses = item.commission + item.logisticDeliveryFee;
      const cogs = item.purchasePrice * item.amount;
      const profit = revenue - expenses - cogs;

      const existing = dayMap.get(dateKey) ?? { revenue: 0, profit: 0 };
      dayMap.set(dateKey, {
        revenue: existing.revenue + revenue,
        profit: existing.profit + profit,
      });
    }

    return Array.from(dayMap.entries()).map(([date, vals]) => ({
      date,
      revenue: Math.round(vals.revenue * 100) / 100,
      profit: Math.round(vals.profit * 100) / 100,
    }));
  }

  // ─── getReturnReasons ─────────────────────────────────────────────────────

  async getReturnReasons(userId: string): Promise<ReturnReason[]> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        amountReturns: { gt: 0 },
      },
      select: {
        returnCause: true,
        amountReturns: true,
      },
    });

    const causeMap = new Map<string, { count: number; totalReturns: number }>();

    for (const item of items) {
      const key = item.returnCause ?? 'Nomaʼlum';
      const existing = causeMap.get(key) ?? { count: 0, totalReturns: 0 };
      causeMap.set(key, {
        count: existing.count + 1,
        totalReturns: existing.totalReturns + item.amountReturns,
      });
    }

    return Array.from(causeMap.entries())
      .map(([cause, vals]) => ({ cause, ...vals }))
      .sort((a, b) => b.totalReturns - a.totalReturns);
  }

  // ─── getTopProducts ───────────────────────────────────────────────────────

  async getTopProducts(userId: string): Promise<TopProductsResult> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: { uzumAccountId: account.id },
      select: {
        skuTitle: true,
        sellerPrice: true,
        amount: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
        amountReturns: true,
      },
    });

    const productMap = new Map<
      string,
      { netProfit: number; amountReturns: number }
    >();

    for (const item of items) {
      const existing = productMap.get(item.skuTitle) ?? {
        netProfit: 0,
        amountReturns: 0,
      };
      const revenue = item.sellerPrice * item.amount;
      const expenses = item.commission + item.logisticDeliveryFee;
      const cogs = item.purchasePrice * item.amount;

      productMap.set(item.skuTitle, {
        netProfit: existing.netProfit + (revenue - expenses - cogs),
        amountReturns: existing.amountReturns + item.amountReturns,
      });
    }

    const products = Array.from(productMap.entries()).map(
      ([skuTitle, vals]) => ({ skuTitle, ...vals }),
    );

    const byProfit = [...products]
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 5)
      .map((p) => ({
        skuTitle: p.skuTitle,
        value: Math.round(p.netProfit * 100) / 100,
      }));

    const byReturns = [...products]
      .sort((a, b) => b.amountReturns - a.amountReturns)
      .slice(0, 5)
      .map((p) => ({ skuTitle: p.skuTitle, value: p.amountReturns }));

    return { byProfit, byReturns };
  }
}
