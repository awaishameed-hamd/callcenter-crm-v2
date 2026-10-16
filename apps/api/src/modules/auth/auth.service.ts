import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { JwtService }       from '@nestjs/jwt'
import { ConfigService }    from '@nestjs/config'
import * as bcrypt          from 'bcryptjs'
import { v4 as uuidv4 }    from 'uuid'
import { PrismaService }    from '../prisma/prisma.service'
import { LoginDto }         from './dto/login.dto'
import { AttendanceService } from '../attendance/attendance.service'

@Injectable()
export class AuthService {
  constructor(
    private prisma:      PrismaService,
    private jwt:         JwtService,
    private config:      ConfigService,
    private attendance:  AttendanceService,
  ) {}

  async login(dto: LoginDto) {
    const isEmail = dto.identifier.includes('@')
    const user = await this.prisma.user.findUnique({
      where: isEmail
        ? { email: dto.identifier.trim().toLowerCase() }
        : { userCode: dto.identifier.trim().toUpperCase() },
    })
    if (!user)          throw new UnauthorizedException('Invalid credentials')
    if (!user.isActive) throw new UnauthorizedException('Account is inactive')

    const ok = await bcrypt.compare(dto.password, user.password)
    if (!ok) throw new UnauthorizedException('Invalid credentials')

    const tokens = await this.generateTokens(user.id, user.email, user.role)
    await this.saveRefreshToken(user.id, tokens.refreshToken)

    this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})

    const attendance = await this.attendance.autoMarkOnLogin(user.id, user.role).catch(() => null)

    return {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      attendance,
      user: {
        id:           user.id,
        userCode:     user.userCode,
        email:        user.email,
        displayName:  user.displayName,
        role:         user.role,
        managerType:  user.managerType,
        avatar:       user.avatar,
        profileLocked: user.profileLocked,
      },
    }
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where:   { token: refreshToken },
      include: { user: true },
    })
    if (!stored || stored.expiresAt < new Date()) throw new UnauthorizedException('Invalid or expired refresh token')
    if (!stored.user.isActive) throw new UnauthorizedException('Account is inactive')

    await this.prisma.refreshToken.delete({ where: { id: stored.id } })
    const tokens = await this.generateTokens(stored.user.id, stored.user.email, stored.user.role)
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken)
    return tokens
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    return { message: 'Logged out' }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id: true, userCode: true, email: true, displayName: true,
        role: true, managerType: true, agentType: true, avatar: true,
        phone: true, isActive: true, profileLocked: true,
        dateOfJoining: true, department: true, cnic: true, address: true,
        basicSalary: true, punctualityAllowance: true, travellingAllowance: true,
        otherAllowance: true, bank: true, bankAccountNo: true,
      },
    })
    if (!user) throw new UnauthorizedException()
    return user
  }

  async updateProfile(userId: string, dto: { displayName?: string; phone?: string; email?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { profileLocked: true } })
    if (!user) throw new UnauthorizedException()
    if (user.profileLocked) throw new ForbiddenException('Your profile is locked. Contact an admin.')

    const data: any = {}
    if (dto.displayName) data.displayName = dto.displayName
    if (dto.phone !== undefined) data.phone = dto.phone
    if (dto.email) data.email = dto.email.toLowerCase()

    return this.prisma.user.update({
      where:  { id: userId },
      data,
      select: { id: true, displayName: true, email: true, phone: true, avatar: true },
    })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) throw new BadRequestException('Current password is incorrect')

    const hashed = await bcrypt.hash(newPassword, 12)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
    return { message: 'Password changed successfully' }
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role }
    const [accessToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret:    this.config.get('jwt.accessSecret'),
        expiresIn: this.config.get('jwt.accessExpiresIn'),
      }),
    ])
    return { accessToken, refreshToken: uuidv4() + uuidv4() }
  }

  private async saveRefreshToken(userId: string, token: string) {
    const days = parseInt(
      (this.config.get<string>('jwt.refreshExpiresIn') ?? '7d').replace('d', ''), 10,
    )
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } })
  }
}
