import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config'; // ConfigService qo'shildi
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService, 
  ) {}

  // ==========================================
  // YORDAMCHI FUNKSIYALAR
  // ==========================================

  private generateSixDigitCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 1. Ikkala tokenni yaratish (Access va Refresh)
  private async getTokens(userId: string, email: string) {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET') || 'access_secret',
          expiresIn: '15m', // Access token 15 daqiqa yashaydi
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh_secret',
          expiresIn: '7d', // Refresh token 7 kun yashaydi
        },
      ),
    ]);

    return { access_token: at, refresh_token: rt };
  }

  // 2. Refresh tokenni bazaga shifrlab saqlash
  private async updateRtHash(userId: string, rt: string) {
    const hash = await bcrypt.hash(rt, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: hash },
    });
  }

  // ==========================================
  // 1. RO'YXATDAN O'TISH (Emailga kod yuborish)
  // ==========================================
 // ==========================================
  // 1. RO'YXATDAN O'TISH (Emailga kod yuborish)
  // ==========================================
async register(data: { email: string; name: string; password: string }) {
  // 1. Bazadan foydalanuvchini qidiramiz
  const existingUser = await this.prisma.user.findUnique({ 
    where: { email: data.email } 
  });

  // Kodlarni tayyorlab olamiz
  const code = this.generateSixDigitCode(); 
  const hashedCode = await bcrypt.hash(code, 10);
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // 2. Agar foydalanuvchi bazada mavjud bo'lsa
  if (existingUser) {
    if (existingUser.isEmailVerified) {
      // Haqiqatan ham ro'yxatdan o'tib, emailni tasdiqlagan bo'lsa
      throw new BadRequestException('Bu email allaqachon ro`yxatdan o`tgan. Iltimos, tizimga kiring.');
    } else {
      // DIQQAT: Foydalanuvchi bor, lekin xatni tasdiqlamagan!
      // Xato bermaymiz, ma'lumotlarini va kodini yangilaymiz.
      await this.prisma.user.update({
        where: { email: data.email },
        data: {
          name: data.name, 
          password: hashedPassword,
          verificationCode: hashedCode, // Yangi heshlangan kod
        },
      });

      // Xatni qayta yuboramiz
      await this.emailService.sendVerificationCode(data.email, code);

      return { 
        message: 'Tasdiqlash kodi qayta yuborildi. Iltimos, emailingizni tekshiring.',
        userId: existingUser.id 
      };
    }
  }

  // 3. Agar foydalanuvchi bazada umuman yo'q bo'lsa (Mutlaqo yangi)
  const user = await this.prisma.user.create({
    data: {
      email: data.email,
      name: data.name, 
      password: hashedPassword,
      verificationCode: hashedCode,
      isEmailVerified: false, 
    },
  });

  // Ochiq kodni emailga yuboramiz
  await this.emailService.sendVerificationCode(data.email, code);

  return { 
    message: 'Ro`yxatdan o`tdingiz. Iltimos, emailingizga yuborilgan 6 xonali kodni kiriting.', 
    userId: user.id 
  };
}

  // ==========================================
  // 2. EMAILNI TASDIQLASH (Kodni tekshirish)
  // ==========================================
  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    
    if (!user || !user.verificationCode) throw new NotFoundException('Foydalanuvchi topilmadi');

    // BCRYPT ORQALI TEKSHIRAMIZ
    const isCodeMatch = await bcrypt.compare(code, user.verificationCode);
    if (!isCodeMatch) throw new BadRequestException('Tasdiqlash kodi noto`g`ri');

    await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true, verificationCode: null }, 
    });

    return { message: 'Email muvaffaqiyatli tasdiqlandi. Endi login qilishingiz mumkin.' };
  }

  // ==========================================
  // 3. LOGIN (Email va Parol bilan) - TOKENLAR BERILADI
  // ==========================================
  async login(data: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    
    if (!user || !user.password) throw new UnauthorizedException('Email yoki parol xato');
    if (!user.isEmailVerified) throw new UnauthorizedException('Iltimos, avval emailingizni tasdiqlang');

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Email yoki parol xato');

    // Ikkala tokenni yaratamiz va Refresh tokenni bazaga saqlaymiz
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return { 
      message: 'Muvaffaqiyatli kirdingiz', 
      ...tokens, 
      user 
    };
  }

  // ==========================================
  // 4. GOOGLE BILAN KIRISH - TOKENLAR BERILADI
  // ==========================================
  // ==========================================
  // 4. GOOGLE BILAN KIRISH VA RO'YXATDAN O'TISH (Ikkalasi birda)
  // ==========================================
  async googleLogin(req: any) {
    if (!req.user) throw new BadRequestException('Google ma`lumotlari topilmadi');
    
    const { email, name, googleId } = req.user;
    
    // 1. Foydalanuvchini bazadan izlaymiz
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNewUser = false; // Yangi yoki eskiligini aniqlash uchun bayroqcha

    // 2. GOOGLE REGISTER (Sign Up): Agar foydalanuvchi birinchi marta kelayotgan bo'lsa
    if (!user) {
      user = await this.prisma.user.create({
        data: { 
          email, 
          name, 
          googleId, 
          isEmailVerified: true // Google'dan kelgani uchun email tasdiqlangan hisoblanadi
        },
      });
      isNewUser = true; 
    }

    // 3. GOOGLE LOGIN (Sign In): Ikkala holat uchun ham tokenlarni yaratamiz va saqlaymiz
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    // 4. Dastur qayerdan kelganiga qarab to'g'ri xabar qaytaradi
    return { 
      // Agar yangi bo'lsa "Ro'yxatdan o'tdingiz", eski bo'lsa "Kirdingiz" deydi
      message: isNewUser ? 'Muvaffaqiyatli ro`yxatdan o`tdingiz' : 'Muvaffaqiyatli kirdingiz', 
      isNewUser, 
      ...tokens, 
      user 
    };
  }

  // ==========================================
  // 5. PAROLNI UNUTDIM (6 xonali kod yuborish)
  // ==========================================
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Bunday email tizimda yo`q');

    const code = this.generateSixDigitCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); 

    await this.prisma.user.update({
      where: { email },
      data: { resetCode: code, resetCodeExpiry: expiry },
    });

    // TODO: Nodemailer bilan emailga kod yuboriladi
    // ESKI KOD: console.log(`DIQQAT! ${email} uchun parolni tiklash kodi: ${code}`);
    
    // YANGI KOD:
    await this.emailService.sendPasswordResetCode(email, code);

    return { message: 'Parolni tiklash uchun emailingizga 6 xonali kod yuborildi.' };
  }

  async resetPassword(data: { email: string; code: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.resetCode !== data.code) throw new BadRequestException('Tasdiqlash kodi noto`g`ri');
    if (!user.resetCodeExpiry || user.resetCodeExpiry < new Date()) throw new BadRequestException('Kodning amal qilish muddati tugagan');

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { email: data.email },
      data: { 
        password: hashedPassword, 
        resetCode: null, 
        resetCodeExpiry: null 
      },
    });

    return { message: 'Parolingiz muvaffaqiyatli o`zgartirildi. Endi yangi parol bilan login qilishingiz mumkin.' };
  }

  // ==========================================
  // 7. TOKENTNI YANGILASH (Refresh)
  // ==========================================
  async refreshTokens(rt: string) {
    let decoded;
    try {
      decoded = await this.jwtService.verifyAsync(rt, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh_secret'
      });
    } catch (e) {
      throw new ForbiddenException('Refresh token yaroqsiz yoki muddati tugagan');
    }
    const userId = decoded.sub;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.hashedRefreshToken) throw new ForbiddenException('Ruxsat etilmagan');

    const rtMatches = await bcrypt.compare(rt, user.hashedRefreshToken);
    if (!rtMatches) throw new ForbiddenException('Ruxsat etilmagan');

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);

    return tokens;
  }

  // ==========================================
  // 8. TIZIMDAN CHIQISH (Logout)
  // ==========================================
  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, hashedRefreshToken: { not: null } },
      data: { hashedRefreshToken: null },
    });
    return { message: 'Tizimdan muvaffaqiyatli chiqdingiz' };
  }

  // ==========================================
  // 9. PROFILNI OLISH (Get Me)
  // ==========================================
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    // Maxfiy ma'lumotlarni yashiramiz
    const { password, hashedRefreshToken, verificationCode, resetCode, resetCodeExpiry, ...safeUser } = user;
    return safeUser;
  }
}