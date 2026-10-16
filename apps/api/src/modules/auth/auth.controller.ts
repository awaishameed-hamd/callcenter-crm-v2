import { Controller, Post, Get, Put, Body, UseGuards } from '@nestjs/common'
import { AuthService }  from './auth.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body('identifier') identifier: string, @Body('password') password: string) {
    return this.auth.login(identifier, password)
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) { return this.auth.refresh(token) }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body('refreshToken') token: string) { return this.auth.logout(token) }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) { return this.auth.me(user.id) }
}

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private auth: AuthService) {}

  @Put()
  update(@CurrentUser() user: any, @Body() body: Record<string, any>) { return this.auth.updateProfile(user.id, body) }

  @Put('password')
  changePassword(@CurrentUser() user: any, @Body() body: Record<string, any>) { return this.auth.changePassword(user.id, body) }
}
