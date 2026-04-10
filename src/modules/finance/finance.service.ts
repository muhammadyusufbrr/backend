import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, type AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Uzum API Types ───────────────────────────────────────────────────────────

interface UzumFinanceOrderItem {
  id: number | bigint;
  shopId: number | bigint;
  orderId: number | bigint;
  productId: number | bigint;
  skuTitle: string;
  status: string;
  date: number;
  sellPrice: number;
  amount: number;
  amountReturns: number;
  commission: number;
  sellerProfit: number;
  purchasePrice: number | null;
  logisticDeliveryFee: number;
  returnCause?: string | null;
}

interface UzumFinanceResponse {
  orderItems: UzumFinanceOrderItem[];
  totalElements?: number;
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

  // ─── resolve UzumAccount ──────────────────────────────────────────────────

  private async resolveAccount(userId: string) {
    const account = await this.prisma.uzumAccount.findUnique({
      where: { sellerId: userId },
      include: { shops: true },
    });
    if (!account) {
      throw new NotFoundException(
        'Uzum hisobi topilmadi. Avval Uzum API ni ulang.',
      );
    }
    return account;
  }

  // ─── Date filter ──────────────────────────────────────────────────────────

  private dateFilter(startDate?: Date, endDate?: Date) {
    if (!startDate && !endDate) return {};
    return {
      dateIssued: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      },
    };
  }

  // ─── Rule 2: Shop filter — null = barcha do'konlar ───────────────────────
  // shopId null yoki yo'q bo'lsa WHERE ga hech narsa qo'shmaymiz (barcha do'konlar)
  // shopId berilsa faqat shu do'kon BigInt bilan filtr qilamiz

  private shopFilter(shopId?: string | null) {
    if (!shopId || shopId === 'all') return {};
    return { shopId: BigInt(shopId) };
  }

  // ─── Rule 3: To'g'ri moliyaviy hisob ─────────────────────────────────────
  // effectiveAmount = amount - amountReturns
  // Revenue = sellerPrice * effectiveAmount
  // COGS    = purchasePrice * effectiveAmount
  // Expenses = commission + logisticDeliveryFee (Uzum total beradi, ko'paytirmaymiz)
  // NetProfit = Revenue - Expenses - COGS

  private calcItem(item: {
    sellerPrice: number;
    amount: number;
    amountReturns: number;
    commission: number;
    logisticDeliveryFee: number;
    purchasePrice: number;
  }) {
    const effectiveAmount = Math.max(0, item.amount - item.amountReturns);
    const revenue = item.sellerPrice * effectiveAmount;
    const cogs = item.purchasePrice * effectiveAmount;
    const expenses = item.commission + item.logisticDeliveryFee;
    const profit = revenue - expenses - cogs;
    return { revenue, cogs, expenses, profit };
  }

  // ─── syncFinances ─────────────────────────────────────────────────────────

  async syncFinances(
    userId: string,
    dateFrom?: number,
    dateTo?: number,
    shopId?: string | null,
  ): Promise<{ synced: number }> {
    const account = await this.resolveAccount(userId);

    // Rule 2: shopId null/all → barcha do'konlar
    const shopIds =
      shopId && shopId !== 'all'
        ? [Number(shopId)]
        : account.shops.map((s) => Number(s.uzumShopId));

    if (shopIds.length === 0) return { synced: 0 };

    // Rule 1: Pagination o'zgaruvchilari
    let allOrderItems: UzumFinanceOrderItem[] = [];
    let currentPage = 0;
    const pageSize = 100;
    let hasMoreData = true;

    while (hasMoreData) {
      let response: AxiosResponse<UzumFinanceResponse>;

      try {
        response = await firstValueFrom(
          this.httpService.get<UzumFinanceResponse>(this.UZUM_FINANCE_URL, {
            headers: { Authorization: account.token },
            // Rule 2: page va size qo'shildi
            params: {
              shopIds,
              group: false,
              page: currentPage,
              size: pageSize,
              dateFrom,
              dateTo,
            },
            paramsSerializer: (params: {
              shopIds: number[];
              group: boolean;
              page: number;
              size: number;
              dateFrom?: number;
              dateTo?: number;
            }) => {
              const parts: string[] = [];
              // Rule 2: shopIds=1&shopIds=2 format (brackets yo'q)
              params.shopIds.forEach((id) => parts.push(`shopIds=${id}`));
              parts.push(`group=${params.group}`);
              parts.push(`page=${params.page}`);
              parts.push(`size=${params.size}`);
              if (params.dateFrom) parts.push(`dateFrom=${params.dateFrom}`);
              if (params.dateTo) parts.push(`dateTo=${params.dateTo}`);
              return parts.join('&');
            },
          }),
        );
      } catch (err) {
        const axiosError = err as AxiosError;
        const status = axiosError.response?.status;
        this.logger.error(
          `Uzum Finance API error (page ${currentPage}): HTTP ${status ?? 'xato'}`,
          axiosError.response?.data,
        );
        throw new InternalServerErrorException(
          `Uzum Finance API bilan ulanishda xatolik (page: ${currentPage})`,
        );
      }

      const fetchedItems: UzumFinanceOrderItem[] = Array.isArray(
        response.data?.orderItems,
      )
        ? response.data.orderItems
        : [];

      const totalElements = response.data?.totalElements ?? 0;

      // Rule 3: Akkumulyatsiya
      allOrderItems = [...allOrderItems, ...fetchedItems];

      this.logger.log(
        `Page ${currentPage}: ${fetchedItems.length} ta, ` +
          `jami: ${allOrderItems.length}/${totalElements}`,
      );

      // Rule 3: Break sharti
      if (fetchedItems.length === 0 || allOrderItems.length >= totalElements) {
        hasMoreData = false;
      } else {
        currentPage++;
      }
    }

    this.logger.log(`Uzum jami qaytardi: ${allOrderItems.length} ta item`);

    if (allOrderItems.length === 0) return { synced: 0 };

    // Rule 4: Mavjud Prisma $transaction va upsert logikasi — allOrderItems bilan
    await this.prisma.$transaction(
      allOrderItems.map((item) =>
        this.prisma.financeItem.upsert({
          where: { id: BigInt(item.id) },
          update: {
            shopId: BigInt(item.shopId),
            orderId: BigInt(item.orderId),
            productId: BigInt(item.productId),
            skuTitle: item.skuTitle,
            status: item.status,
            dateIssued: new Date(item.date),
            sellerPrice: item.sellPrice,
            amount: item.amount,
            amountReturns: item.amountReturns,
            commission: item.commission,
            sellerProfit: item.sellerProfit,
            purchasePrice: item.purchasePrice ?? 0,
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
            dateIssued: new Date(item.date),
            sellerPrice: item.sellPrice,
            amount: item.amount,
            amountReturns: item.amountReturns,
            commission: item.commission,
            sellerProfit: item.sellerProfit,
            purchasePrice: item.purchasePrice ?? 0,
            logisticDeliveryFee: item.logisticDeliveryFee,
            returnCause: item.returnCause ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ),
    );

    this.logger.log(`Synced: ${allOrderItems.length} ta`);
    return { synced: allOrderItems.length };
  }

  // ─── getKpiSummary — Rule 3 ───────────────────────────────────────────────

  async getKpiSummary(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    shopId?: string | null,
  ): Promise<KpiSummary> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        ...this.dateFilter(startDate, endDate),
        ...this.shopFilter(shopId),
      },
      select: {
        sellerPrice: true,
        amount: true,
        amountReturns: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
      },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCogs = 0;

    for (const item of items) {
      const { revenue, cogs, expenses } = this.calcItem(item);
      totalRevenue += revenue;
      totalExpenses += expenses;
      totalCogs += cogs;
    }

    const netProfit = totalRevenue - totalExpenses - totalCogs;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalCogs: Math.round(totalCogs * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
    };
  }

  // ─── getChartData — Rule 3 ────────────────────────────────────────────────

  async getChartData(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    shopId?: string | null,
  ): Promise<ChartDataPoint[]> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        ...this.dateFilter(startDate, endDate),
        ...this.shopFilter(shopId),
      },
      select: {
        dateIssued: true,
        sellerPrice: true,
        amount: true,
        amountReturns: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
      },
      orderBy: { dateIssued: 'asc' },
    });

    const dayMap = new Map<string, { revenue: number; profit: number }>();
    const tashkentFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    for (const item of items) {
      // const dateKey = item.dateIssued.toISOString().slice(0, 10);
      const dateKey = tashkentFormatter.format(item.dateIssued);
      const { revenue, profit } = this.calcItem(item);

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

  // ─── getReturnReasons — Rule 4: startDate/endDate qo'shildi ──────────────

  async getReturnReasons(
    userId: string,
    shopId?: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ReturnReason[]> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        amountReturns: { gt: 0 },
        ...this.dateFilter(startDate, endDate),
        ...this.shopFilter(shopId),
      },
      select: {
        returnCause: true,
        amountReturns: true,
      },
    });

    const causeMap = new Map<string, { count: number; totalReturns: number }>();

    for (const item of items) {
      const key = item.returnCause ?? "Noma'lum";
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

  // ─── getTopProducts — Rule 3 + Rule 4: startDate/endDate qo'shildi ───────

  async getTopProducts(
    userId: string,
    shopId?: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TopProductsResult> {
    const account = await this.resolveAccount(userId);

    const items = await this.prisma.financeItem.findMany({
      where: {
        uzumAccountId: account.id,
        ...this.dateFilter(startDate, endDate),
        ...this.shopFilter(shopId),
      },
      select: {
        skuTitle: true,
        sellerPrice: true,
        amount: true,
        amountReturns: true,
        commission: true,
        logisticDeliveryFee: true,
        purchasePrice: true,
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
      const { profit } = this.calcItem(item);

      productMap.set(item.skuTitle, {
        netProfit: existing.netProfit + profit,
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
