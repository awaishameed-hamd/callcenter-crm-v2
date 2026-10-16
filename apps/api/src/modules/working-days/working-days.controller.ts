import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common'
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard'
import { RolesGuard }         from '../../common/guards/roles.guard'
import { Roles }              from '../../common/decorators/roles.decorator'
import { WorkingDaysService } from './working-days.service'
import { AttendanceService }  from '../attendance/attendance.service'
import { SetupWorkingDaysDto } from './dto/setup-working-days.dto'
import { Role } from '@crm/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { assertHrDesk } from '../../common/utils/staff-policy'

@Controller('working-days')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkingDaysController {
  constructor(
    private readonly svc:        WorkingDaysService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  getMonth(
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number,
    @Query('year',  new DefaultValuePipe(new Date().getFullYear()),  ParseIntPipe) year:  number,
  ) {
    return this.svc.getMonth(month, year)
  }

  @Post('setup')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  setup(@CurrentUser() user: any, @Body() dto: SetupWorkingDaysDto) {
    assertHrDesk(user)
    return this.svc.setupMonth(dto)
  }

  @Patch(':date/login-time')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  updateLoginTime(
    @CurrentUser() user: any,
    @Param('date') date: string,
    @Body('login_time') loginTime: string,
  ) {
    assertHrDesk(user)
    return this.svc.updateLoginTime(date, loginTime)
  }

  @Patch('settings/:key')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  updateSetting(
    @CurrentUser() user: any,
    @Param('key') key: string,
    @Body('value') value: string,
  ) {
    assertHrDesk(user)
    return this.attendance.updateSetting(key, value)
  }
}
