import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ValidationPipe }         from '@nestjs/common'
import { AppModule }              from './app.module'
import { GlobalExceptionFilter }  from './common/filters/http-exception.filter'
import { TransformInterceptor }   from './common/interceptors/transform.interceptor'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.enableCors({
    origin:      process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  app.setGlobalPrefix('api')
  // Room for a profile photo sent as a data URL (the browser shrinks it to about 30 KB first)
  app.useBodyParser('json', { limit: '1mb' })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: true,
      transform:            true,
      transformOptions:     { enableImplicitConversion: true },
    }),
  )

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new TransformInterceptor())

  const port = process.env.PORT ?? 4000
  await app.listen(port)
  console.log(`CallCenter CRM API running on http://localhost:${port}/api`)
}

bootstrap()
