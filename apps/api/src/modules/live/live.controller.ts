import { CanActivate, Controller, ExecutionContext, Injectable, MessageEvent, Sse, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Observable, interval, merge } from 'rxjs'
import { map } from 'rxjs/operators'
import { salesChanged$ } from './sales-events'

// A browser's EventSource cannot send an Authorization header, so the access token comes as
// ?token=. It is checked in a guard because Nest starts the event stream (status 200) before the
// handler itself runs.
@Injectable()
class QueryTokenGuard implements CanActivate {
  constructor(private jwt: JwtService, private config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    const token = ctx.switchToHttp().getRequest().query?.token
    try {
      this.jwt.verify(String(token ?? ''), { secret: this.config.get<string>('jwt.accessSecret') })
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}

// Server-sent events. The stream carries no data, only "sales changed" ticks; each page then
// refetches what it is allowed to see.
@Controller('live')
export class LiveController {
  @Sse('sales')
  @UseGuards(QueryTokenGuard)
  sales(): Observable<MessageEvent> {
    return merge(
      salesChanged$.pipe(map(() => ({ type: 'sales', data: 'changed' }))),
      // nginx closes a silent connection after 60 s; a ping every 25 s keeps it open
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }))),
    )
  }
}
