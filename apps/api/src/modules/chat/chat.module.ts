import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { ChatGateway } from './chat.gateway'
import { PresenceService } from './presence.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    JwtModule.register({}),
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers:   [ChatService, ChatGateway, PresenceService],
  exports:     [ChatGateway],
})
export class ChatModule {}
