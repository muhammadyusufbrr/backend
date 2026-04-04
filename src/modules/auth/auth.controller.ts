import { Controller, Post, Get, Body, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Response } from 'express'; 

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==========================================
  // 1. ODDY RO'YXATDAN O'TISH VA KIRISH
  // ==========================================
  
  @Post('register')
  register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmail(body.email, body.code);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body);
  }

  // ==========================================
  // 2. GOOGLE ORQALI KIRISH
  // ==========================================

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {
    // Bu shunchaki Google oynasini ochib beradi
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001'; 
    
    try {
      // 1. AuthService orqali tokenlar va userni olamiz
      const result = await this.authService.googleLogin(req);

      // 2. Katta O'zgarish: Tokenlarni URL ga osib qo'ymaymiz!
      // NestJS o'zi brauzerga HttpOnly cookie o'rnatib qo'yadi.
      res.cookie('access_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Localhost da false bo'ladi
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 1 kun
        path: '/',
      });

      // Agar refresh token ham ishlatsangiz, uni ham xuddi shunday saqlang
      if (result.refresh_token) {
        res.cookie('refresh_token', result.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 kun
          path: '/',
        });
      }

      // 3. Foydalanuvchini toza va xavfsiz URL bilan Asosiy sahifaga otib yuboramiz
      return res.redirect(`${frontendUrl}/`);

    } catch (error) {
      console.error("Google Callback Xatosi:", error);
      // Agar qandaydir xatolik chiqsa, Frontendning login sahifasiga xato xabari bilan qaytaramiz
      return res.redirect(`${frontendUrl}/signin?error=google_auth_failed`);
    }
  }
  // ==========================================
  // 3. PAROLNI TIKLASH
  // ==========================================

  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { email: string; code: string; newPassword: string }) {
    return this.authService.resetPassword(body);
  }

  // ==========================================
  // 4. XAVFSIZLIK: REFRESH TOKEN VA LOGOUT
  // ==========================================

  @Post('refresh')
  refreshTokens(@Body() body: { userId: string; refreshToken: string }) {
    return this.authService.refreshTokens(body.userId, body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req) {
    return this.authService.logout(req.user.id);
  }
}