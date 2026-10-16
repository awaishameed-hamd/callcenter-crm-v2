import { IsString, IsNotEmpty } from 'class-validator'

export class LoginDto {
  @IsString() @IsNotEmpty()
  identifier: string  // email or userCode

  @IsString() @IsNotEmpty()
  password: string
}
