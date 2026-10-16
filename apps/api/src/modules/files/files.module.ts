import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { FilesController } from './files.controller'

@Module({
  imports:     [JwtModule.register({})],
  controllers: [FilesController],
})
export class FilesModule {}
