import { Controller, Post, Get, Put, Body, UseGuards } from '@nestjs/common'
import { AuthService }   from './auth.service'
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard'
import { CurrentUser }   from '../../common/decorators/current-user.decorator'
import { LoginDto }      from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.auth.refresh(token)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body('refreshToken') token: string) {
    return this.auth.logout(token)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.auth.me(user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: { displayName?: string; phone?: string; email?: string },
  ) {
    return this.auth.updateProfile(user.id, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword)
  }
}
