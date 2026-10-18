import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { LiveController } from './live.controller'

@Module({ imports: [JwtModule.register({})], controllers: [LiveController] })
export class LiveModule {}
