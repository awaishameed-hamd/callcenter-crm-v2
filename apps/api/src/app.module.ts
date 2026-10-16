import { Module }       from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration    from './config/configuration'

import { PrismaModule }    from './modules/prisma/prisma.module'
import { AuthModule }      from './modules/auth/auth.module'
import { UsersModule }     from './modules/users/users.module'
import { CustomersModule } from './modules/customers/customers.module'
import { DidsModule }      from './modules/dids/dids.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { ReportsModule }   from './modules/reports/reports.module'

// TODO: add after copying from argroup
// import { AttendanceModule }  from './modules/attendance/attendance.module'
// import { WorkingDaysModule } from './modules/working-days/working-days.module'
// import { LeavesModule }      from './modules/leaves/leaves.module'
// import { ChatModule }        from './modules/chat/chat.module'
// import { NotificationsModule } from './modules/notifications/notifications.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    DidsModule,
    DashboardModule,
    ReportsModule,
  ],
})
export class AppModule {}
