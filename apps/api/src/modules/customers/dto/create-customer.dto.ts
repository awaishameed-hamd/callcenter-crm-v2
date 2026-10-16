import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator'
import { Vertical } from '@crm/shared'

export class CreateCustomerDto {
  @IsString()              firstName:    string
  @IsString()              lastName:     string
  @IsDateString() @IsOptional() dob?:   string
  @IsString() @IsOptional() state?:     string
  @IsString() @IsOptional() phone?:     string
  @IsString() @IsOptional() address?:   string
  @IsEnum(Vertical)        vertical:    Vertical
  @IsString()              didId:       string
  @IsString() @IsOptional() policyNumber?: string
  @IsDateString() @IsOptional() effectiveDate?: string
  @IsString() @IsOptional() notes?:     string
}
