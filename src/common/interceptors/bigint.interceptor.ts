import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Converts BigInt values to strings during JSON serialization.
 * Prisma BigInt fields cannot be serialized by the default JSON.stringify,
 * which would crash NestJS response pipeline.
 */
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (data === undefined || data === null) return data;
        const serialized = JSON.stringify(data, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        );
        if (serialized === undefined) return data;
        return JSON.parse(serialized) as unknown;
      }),
    );
  }
}
