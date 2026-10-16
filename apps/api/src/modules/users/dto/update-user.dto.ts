import { IsString, IsEmail, IsEnum, IsOptional, IsBoolean, IsDateString } from 'class-validator'
import { Role, ManagerType } from '@crm/shared'

export class UpdateUserDto {
  @IsString()    @IsOptional() displayName?: string
  @IsEmail()     @IsOptional() email?: string
  @IsEnum(Role)  @IsOptional() role?: Role
  @IsEnum(ManagerType) @IsOptional() managerType?: ManagerType
  @IsString()    @IsOptional() phone?: string
  @IsBoolean()   @IsOptional() isActive?: boolean
  @IsString()    @IsOptional() password?: string
  @IsString()    @IsOptional() agentType?: string
  @IsString()    @IsOptional() department?: string
  @IsDateString() @IsOptional() dateOfJoining?: string
  @IsString()    @IsOptional() cnic?: string
  @IsString()    @IsOptional() address?: string
  @IsBoolean()   @IsOptional() profileLocked?: boolean
}
