import { Module }         from '@nestjs/common'
import { ConfigModule }   from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import configuration      from './config/configuration'

import { PrismaModule }        from './modules/prisma/prisma.module'
import { AuthModule }          from './modules/auth/auth.module'
import { UsersModule }         from './modules/users/users.module'
import { ClientsModule }       from './modules/clients/clients.module'
import { VerticalsModule }     from './modules/verticals/verticals.module'
import { EmailModule }         from './modules/email/email.module'
import { InterviewsModule }    from './modules/interviews/interviews.module'
import { CustomersModule }     from './modules/customers/customers.module'
import { DashboardModule }     from './modules/dashboard/dashboard.module'
import { ReportsModule }       from './modules/reports/reports.module'
import { CrmModule }           from './modules/crm/crm.module'
import { InvoicingModule }     from './modules/invoicing/invoicing.module'
import { AccountingModule }    from './modules/accounting/accounting.module'
import { AttendanceModule }    from './modules/attendance/attendance.module'
import { WorkingDaysModule }   from './modules/working-days/working-days.module'
import { LeavesModule }        from './modules/leaves/leaves.module'
import { ChatModule }          from './modules/chat/chat.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { FilesModule }         from './modules/files/files.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    VerticalsModule,
    EmailModule,
    InterviewsModule,
    ClientsModule,
    CustomersModule,
    DashboardModule,
    ReportsModule,
    CrmModule,
    InvoicingModule,
    AccountingModule,
    AttendanceModule,
    WorkingDaysModule,
    LeavesModule,
    NotificationsModule,
    FilesModule,
    ChatModule,
  ],
})
export class AppModule {}
