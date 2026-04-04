import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { AddUzumTokenDto } from './dto/add-token.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UzumService {
  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async fetchAndSaveShops(userId: string, dto: AddUzumTokenDto) {
    try {
      // 1. Uzum API ga token orqali so'rov yuborish
      const response = await firstValueFrom(
        this.httpService.get('https://api-seller.uzum.uz/api/seller-openapi/v1/shops', {
          headers: {
            Authorization: `Bearer ${dto.token}`, // Yoki Uzum talab qilgan header
          },
        }),
      );

      const shops = response.data?.payload; // Swagger API javobiga ko'ra

      if (!shops || shops.length === 0) {
        throw new BadRequestException('Bu token orqali hech qanday do\'kon topilmadi.');
      }

      // 2. Tokenni yuqori darajada shifrlash
      const encryptedToken = this.encryptionService.encrypt(dto.token);

      // 3. Do'konlarni bazaga saqlash
      for (const shop of shops) {
        // Avval do'kon bazada bor yo'qligini tekshiramiz
        const existingShop = await this.prisma.shop.findUnique({
          where: { uzumShopId: String(shop.id) },
        });

        if (!existingShop) {
          await this.prisma.shop.create({
            data: {
              name: shop.name,
              uzumShopId: String(shop.id),
              uzumToken: encryptedToken,
              userId: userId,
            },
          });
        }
      }

      // 4. Foydalanuvchi rolini faol sotuvchiga o'tkazish
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: 'ACTIVE_SELLER' },
      });

      return {
        message: 'Do\'konlar muvaffaqiyatli sinxronlashtirildi va token shifrlandi!',
        shopsFound: shops.length,
      };
    } catch (error) {
      throw new BadRequestException("Uzum API bilan ulanishda xatolik. Token noto'g'ri bo'lishi mumkin.");
    }
  }
}