import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { InterviewsService } from './interviews.service'

// HR desk only (Admin, Director, HR Manager); the service checks the manager type.
@Controller('interviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
export class InterviewsController {
  constructor(private interviews: InterviewsService) {}

  @Get()          list(@CurrentUser() u: any, @Query() q: Record<string, any>) { return this.interviews.list(u, q) }
  @Get('stats')   stats(@CurrentUser() u: any) { return this.interviews.stats(u) }
  @Get('meta')    meta(@CurrentUser() u: any) { return this.interviews.meta(u) }
  @Get('reminders') reminders(@CurrentUser() u: any) { return this.interviews.pendingReminders(u) }

  @Post()         schedule(@CurrentUser() u: any, @Body() b: Record<string, any>) { return this.interviews.schedule(u, b) }
  @Post('walk-in') walkIn(@CurrentUser() u: any, @Body() b: Record<string, any>) { return this.interviews.walkIn(u, b) }

  @Get(':id')     get(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.get(u, id) }
  @Put(':id')     details(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.updateDetails(u, id, b) }
  @Delete(':id')  remove(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.remove(u, id) }
  @Put(':id/candidate')    candidate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.updateCandidate(u, id, b) }
  @Post(':id/reschedule')  reschedule(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.reschedule(u, id, b) }
  @Post(':id/arrived')     arrived(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.arrived(u, id) }
  @Post(':id/no-show')     noShow(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.noShow(u, id, b) }
  @Post(':id/cancel')      cancel(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.cancel(u, id, b) }
  @Post(':id/email')       email(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.resendEmail(u, id) }
  @Post(':id/notes')       note(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.addNote(u, id, b) }
  @Put(':id/evaluation')   evaluate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.evaluate(u, id, b) }
  @Post(':id/reminder-ack') ack(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.ackReminder(u, id, b) }
}

@Controller('interview-forms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
export class InterviewFormsController {
  constructor(private interviews: InterviewsService) {}

  @Get()                list(@CurrentUser() u: any) { return this.interviews.listForms(u) }
  @Post()               create(@CurrentUser() u: any, @Body() b: Record<string, any>) { return this.interviews.saveForm(u, null, b) }
  @Put(':id')           update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: Record<string, any>) { return this.interviews.saveForm(u, id, b) }
  @Post(':id/duplicate') duplicate(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.duplicateForm(u, id) }
  @Delete(':id')        remove(@CurrentUser() u: any, @Param('id') id: string) { return this.interviews.removeForm(u, id) }
}
