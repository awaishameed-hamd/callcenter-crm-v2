import { IsString, IsEmail, IsEnum, IsOptional, MinLength, IsDateString } from 'class-validator'
import { Role, ManagerType } from '@crm/shared'

export class CreateUserDto {
  @IsString()
  displayName: string

  @IsEmail()
  email: string

  @IsString() @MinLength(8)
  password: string

  @IsEnum(Role)
  role: Role

  @IsEnum(ManagerType) @IsOptional()
  managerType?: ManagerType

  @IsString() @IsOptional()
  phone?: string

  @IsString() @IsOptional()
  agentType?: string

  @IsString() @IsOptional()
  department?: string

  @IsDateString() @IsOptional()
  dateOfJoining?: string

  @IsString() @IsOptional()
  cnic?: string

  @IsString() @IsOptional()
  address?: string
}
