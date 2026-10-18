import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { success: boolean; data: T; timestamp: string }> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<{ success: boolean; data: T; timestamp: string }> {
    // Server-sent event streams (@Sse) must reach the browser as plain events, not wrapped
    if (Reflect.getMetadata('__sse__', context.getHandler())) return next.handle()
    return next.handle().pipe(
      map((data) => ({
        success:   true,
        data,
        timestamp: new Date().toISOString(),
      })),
    )
  }
}
