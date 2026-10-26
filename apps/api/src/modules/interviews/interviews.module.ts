import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { InterviewsController, InterviewFormsController } from './interviews.controller'
import { InterviewsService } from './interviews.service'
import { InterviewRemindersService } from './interview-reminders.service'

@Module({
  imports: [NotificationsModule],
  controllers: [InterviewsController, InterviewFormsController],
  providers: [InterviewsService, InterviewRemindersService],
})
export class InterviewsModule {}
