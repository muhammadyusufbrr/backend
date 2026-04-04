import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './google.strategy';
import { PrismaModule } from '../../prisma/prisma.module';
import { JwtStrategy } from './jwt.strategy';

// DIQQAT: O'zingizdagi papka tuzilishiga qarab EmailService import qilinadi
import { EmailService } from '../email/email.service'; 
// Agar TokenService ni alohida yaratgan bo'lsangiz, uni ham import qiling:
// import { TokenService } from './token.service'; 

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    GoogleStrategy,
    JwtStrategy,
    EmailService, // <--- SHU YERGA EMAIL SERVICE QO'SHILISHI SHART!
    // TokenService, // <--- AGAR YARATGAN BO'LSANGIZ, BUNI HAM QO'SHING
  ],
})
export class AuthModule {}