// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, VerifyCallback } from 'passport-google-oauth20';
// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
//   constructor(private configService: ConfigService) {
//     super({
//       clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'hozircha_bosh',
//       clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'hozircha_bosh',
//       callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:3000/api/auth/google/callback',
//       scope: ['email', 'profile'],
//     });
//   }

//   async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
//     const { name, emails, id } = profile;
//     const user = {
//       googleId: id,
//       email: emails[0].value,
//       name: `${name.givenName} ${name.familyName}`,
//       picture: profile.photos[0].value,
//     };
//     done(null, user);
//   }
// }import { PassportStrategy } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'xato',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'xato',
      // DIQQAT: SHU YERNI HECH QANDAY O'ZGARUVCHISIZ, AYNAN SHUNDAY YOZING!
      callbackURL: 'http://localhost:3000/api/auth/google/callback', 
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { name, emails, id } = profile;
    const user = {
      googleId: id,
      email: emails[0].value,
      name: `${name.givenName} ${name.familyName}`,
      picture: profile.photos[0].value,
    };
    done(null, user);
  }
}