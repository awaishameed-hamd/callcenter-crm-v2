import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common'
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
}
