import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private transporter;

  constructor(private configService: ConfigService) {
    const email = this.configService.get<string>('SMTP_EMAIL');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    
    // DIQQAT: Shu yozuvlar terminalda chiqishi shart! Buni albatta tekshiramiz.
    console.log("---- EMAIL SOZLAMALARI ----");
    console.log("EMAIL:", email);
    console.log("PAROL:", password ? "Topildi (Yashirin)" : "TOPILMADI (undefined)");
    console.log("---------------------------");

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', // service: 'gmail' o'rniga shu ishonchliroq
      port: 587,
      secure: false, 
      auth: {
        user: email,
        pass: password,
      },
    });
  }

  // Ro'yxatdan o'tish uchun tasdiqlash kodini yuborish
  async sendVerificationCode(to: string, code: string) {
    const mailOptions = {
      from: `"UzumSotuv Support" <${this.configService.get<string>('SMTP_EMAIL')}>`,
      to: to,
      subject: 'Tasdiqlash kodi',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>Hush kelibsiz!</h2>
          <p>Sizning tasdiqlash kodingiz:</p>
          <h1 style="color: #4CAF50; font-size: 40px; letter-spacing: 5px;">${code}</h1>
          <p>Kodni hech kimga bermang!</p>
        </div>
      `,
    };
    
    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email muvaffaqiyatli yuborildi: ${to}`);
    } catch (error) {
      console.error(`Email yuborishda xato:`, error);
    }
  }

  // Parolni tiklash uchun kod yuborish
  async sendPasswordResetCode(to: string, code: string) {
    const mailOptions = {
      from: `"UzumSotuv Support" <${this.configService.get<string>('SMTP_EMAIL')}>`,
      to: to,
      subject: 'Parolni tiklash kodi',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>Parolni tiklash</h2>
          <p>Parolingizni tiklash uchun quyidagi 6 xonali koddan foydalaning:</p>
          <h1 style="color: #E53935; font-size: 40px; letter-spacing: 5px;">${code}</h1>
          <p>Bu kod 15 daqiqa davomida amal qiladi.</p>
        </div>
      `,
    };
    
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error(`Parol tiklash xatini yuborishda xato:`, error);
    }
  }
}