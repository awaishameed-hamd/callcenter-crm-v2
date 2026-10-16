import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request  = ctx.getRequest()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    const body = exception instanceof HttpException ? (exception.getResponse() as any) : null
    const message =
      exception instanceof HttpException
        ? body?.message ?? exception.message
        : 'Internal server error'
    const errors = body && typeof body === 'object' && body.errors ? body.errors : undefined

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    }

    response.status(status).json({
      success:    false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      timestamp:  new Date().toISOString(),
      path:       request.url,
    })
  }
}
