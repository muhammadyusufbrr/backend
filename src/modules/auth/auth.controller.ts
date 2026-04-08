import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==========================================
  // 1. RO'YXATDAN O'TISH VA KIRISH
  // ==========================================

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.email, body.code);
  }

  @Post('resend-verification')
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerificationCode(body.email);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  // ==========================================
  // 2. GOOGLE ORQALI KIRISH
  // ==========================================

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Google oynasini ochadi
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    try {
      const googleUser = req.user as
        | { email: string; name: string; googleId?: string }
        | undefined;

      const result = await this.authService.googleLogin(googleUser);

      const roleParam =
        typeof result.user.role === 'string'
          ? result.user.role
          : 'PENDING_SELLER';

      // Tokenlarni URL params orqali Next.js ga uzatamiz
      // Next.js /api/auth/google/callback → httpOnly cookie set qiladi
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token ?? '',
        role: roleParam,
      });

      return res.redirect(
        `${frontendUrl}/api/auth/google/callback?${params.toString()}`,
      );
    } catch (error) {
      console.error('Google Callback Xatosi:', error);
      return res.redirect(`${frontendUrl}/signin?error=google_auth_failed`);
    }
  }

  // ==========================================
  // 3. PAROLNI TIKLASH
  // ==========================================

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  // ==========================================
  // 4. REFRESH TOKEN VA LOGOUT
  // ==========================================

  @Post('refresh')
  refreshTokens(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: Request & { user: { id: string } }) {
    return this.authService.logout(req.user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: Request & { user: { id: string } }) {
    return this.authService.getMe(req.user.id);
  }
}
