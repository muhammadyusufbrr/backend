import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

interface UzumShopResponse {
  id: number | bigint;
  name: string;
}

export interface ConnectUzumApiResult {
  message: string;
  shops: { uzumShopId: string; name: string }[];
}

@Injectable()
export class UzumService {
  private readonly logger = new Logger(UzumService.name);
  private readonly UZUM_SHOPS_URL =
    'https://api-seller.uzum.uz/api/seller-openapi/v1/shops';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  async connectUzumApi(
    userId: string,
    token: string,
  ): Promise<ConnectUzumApiResult> {
    // 1. Uzum API ga so'rov yuborish — "Bearer" QUSHILMAYDI
    let shops: UzumShopResponse[];
    try {
      const response = await firstValueFrom(
        this.httpService.get<UzumShopResponse[]>(
          this.UZUM_SHOPS_URL,
          {
            headers: { Authorization: token },
          },
        ),
      );
      shops = Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      const axiosError = err as AxiosError;
      const status = axiosError.response?.status;
      console.error('UZUM CONNECT ERROR:', axiosError.response?.data ?? err);
      this.logger.warn(
        `Uzum API error for user ${userId}: HTTP ${status ?? 'unknown'}`,
      );

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Uzum API kaliti xato yoki yaroqsiz');
      }

      if (status === 404) {
        throw new BadRequestException(
          'Uzum API tokeni topilmadi yoki noto\'g\'ri. Iltimos tokenni qayta tekshiring.',
        );
      }

      throw new InternalServerErrorException(
        `Uzum API bilan ulanishda xatolik: HTTP ${status ?? 'tarmoq xatosi'}`,
      );
    }

    // 2. UzumAccount ni upsert qilish (token yangilanishi mumkin)
    const uzumAccount = await this.prisma.uzumAccount.upsert({
      where: { sellerId: userId },
      update: { token },
      create: { sellerId: userId, token },
    });

    // 3. Har bir do'konni upsert qilish
    for (const shop of shops) {
      await this.prisma.uzumShop.upsert({
        where: { uzumShopId: BigInt(shop.id) },
        update: { name: shop.name, accountId: uzumAccount.id },
        create: {
          uzumShopId: BigInt(shop.id),
          name: shop.name,
          accountId: uzumAccount.id,
        },
      });
    }

    const shopList = shops.map((s) => ({
      uzumShopId: String(s.id),
      name: s.name,
    }));

    return {
      message: `Uzum API muvaffaqiyatli ulandi. ${shops.length} ta do'kon sinxronlashtirildi.`,
      shops: shopList,
    };
  }

  async getUzumStatus(userId: string) {
    const account = await this.prisma.uzumAccount.findUnique({
      where: { sellerId: userId },
      include: { shops: true },
    });

    if (!account) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      connectedAt: account.createdAt,
      updatedAt: account.updatedAt,
      shops: account.shops.map((s) => ({
        uzumShopId: String(s.uzumShopId),
        name: s.name,
      })),
    };
  }

  async disconnectUzum(userId: string) {
    const account = await this.prisma.uzumAccount.findUnique({
      where: { sellerId: userId },
    });

    if (!account) {
      return { message: 'Uzum API allaqachon uzilgan' };
    }

    // Cascade deletes UzumShop records too (via onDelete: Cascade in schema)
    await this.prisma.uzumAccount.delete({
      where: { sellerId: userId },
    });

    return { message: 'Uzum API muvaffaqiyatli uzildi' };
  }
}