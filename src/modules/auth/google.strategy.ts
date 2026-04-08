import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GoogleStrategyUser = {
  googleId: string;
  email: string;
  name: string;
  picture: string;
};

/**
 * `Array.isArray(x)` narrows `unknown` to `any[]`, so `arr[0]` becomes `any` and
 * triggers @typescript-eslint/no-unsafe-assignment. A custom predicate narrows to `unknown[]`.
 */
function isNonEmptyUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length >= 1;
}

function mapGoogleProfileToUser(profile: unknown): GoogleStrategyUser {
  if (typeof profile !== 'object' || profile === null) {
    throw new Error('Invalid Google profile');
  }
  const p = profile as Record<string, unknown>;

  if (typeof p.id !== 'string') {
    throw new Error('Invalid Google profile');
  }

  if (!isNonEmptyUnknownArray(p.emails)) {
    throw new Error('Invalid Google profile');
  }
  const emailEntry = p.emails[0];
  if (typeof emailEntry !== 'object' || emailEntry === null) {
    throw new Error('Invalid Google profile');
  }
  const emailRecord = emailEntry as Record<string, unknown>;
  if (typeof emailRecord.value !== 'string') {
    throw new Error('Invalid Google profile');
  }

  let displayName = '';
  if (typeof p.name === 'object' && p.name !== null) {
    const n = p.name as Record<string, unknown>;
    const given = typeof n.givenName === 'string' ? n.givenName : '';
    const family = typeof n.familyName === 'string' ? n.familyName : '';
    displayName = `${given} ${family}`.trim();
  }
  if (!displayName && typeof p.displayName === 'string') {
    displayName = p.displayName;
  }
  if (!displayName) {
    displayName = emailRecord.value;
  }

  let picture = '';
  if (isNonEmptyUnknownArray(p.photos)) {
    const photoEntry = p.photos[0];
    if (typeof photoEntry === 'object' && photoEntry !== null) {
      const photoRecord = photoEntry as Record<string, unknown>;
      if (typeof photoRecord.value === 'string') {
        picture = photoRecord.value;
      }
    }
  }

  return {
    googleId: p.id,
    email: emailRecord.value,
    name: displayName,
    picture,
  };
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'xato',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'xato',
      // DIQQAT: SHU YERNI HECH QANDAY O'ZGARUVCHISIZ, AYNAN SHUNDAY YOZING!
      callbackURL: 'http://localhost:3001/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: unknown,
    done: VerifyCallback,
  ): void {
    try {
      const user = mapGoogleProfileToUser(profile);
      done(null, user);
    } catch {
      done(new Error('Invalid Google profile'));
    }
  }
}
