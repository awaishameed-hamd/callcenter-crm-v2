import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min, Matches } from 'class-validator'
import { AttendanceStatus } from '@prisma/client'

export class UpdateAttendanceDto {
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus

  @IsOptional()
  @IsString()
  loginTime?: string  // HH:MM override

  @IsOptional()
  @IsBoolean()
  isLate?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  lateMinutes?: number

  @IsOptional()
  @IsString()
  notes?: string
}

/** Body of POST /attendance/create: the staff member and day plus the same editable fields. */
export class CreateAttendanceDto extends UpdateAttendanceDto {
  @IsString()
  userId: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string
}
