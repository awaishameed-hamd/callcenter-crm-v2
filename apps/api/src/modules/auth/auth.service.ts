import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { JwtService }    from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import * as bcrypt       from 'bcryptjs'
import { v4 as uuidv4 }  from 'uuid'
import { Role, ManagerType } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { USER_SELECT } from '../users/users.service'
import { V, fail, defined } from '../../common/utils/validate'
import { PKT_TZ, todayIn, monthStart, monthEnd, dateOnly, fmtLongDate } from '../../common/utils/time'

function clock12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

@Injectable()
export class AuthService {
  constructor(
    private prisma:     PrismaService,
    private jwt:        JwtService,
    private config:     ConfigService,
    private attendance: AttendanceService,
  ) {}

  async login(identifier: string, password: string) {
    const id = String(identifier ?? '').trim()
    if (!id || !password) throw new UnauthorizedException('Invalid credentials.')
    const user = await this.prisma.user.findUnique({
      where: id.includes('@') ? { email: id.toLowerCase() } : { userCode: id.toUpperCase() },
    })
    if (!user || !(await bcrypt.compare(password, user.password))) throw new UnauthorizedException('Invalid credentials.')
    if (!user.isActive) throw new ForbiddenException('Account is inactive.')

    const tokens = await this.generateTokens(user.id, user.email ?? '', user.role)
    await this.saveRefreshToken(user.id, tokens.refreshToken)
    this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})

    const marked = await this.attendance.autoMarkOnLogin(user.id, user.role).catch(() => null)
    const attendanceInfo = marked && 'loginTime' in marked && marked.loginTime && marked.date
      ? { time: clock12(marked.loginTime), date: fmtLongDate(marked.date), isLate: marked.isLate, lateMinutes: marked.lateMinutes }
      : null

    let showWorkingDaysPopup = false
    if (user.role === Role.MANAGER && user.managerType === ManagerType.HR) {
      const today = todayIn(PKT_TZ)
      const configured = await this.prisma.workingDay.count({
        where: { date: { gte: dateOnly(monthStart(today)), lte: dateOnly(monthEnd(today)) } },
      })
      showWorkingDaysPopup = configured === 0
    }

    return {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user:         await this.me(user.id),
      attendanceMarked: !!attendanceInfo,
      attendanceInfo,
      showWorkingDaysPopup,
    }
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken ?? '' }, include: { user: true } })
    if (!stored || stored.expiresAt < new Date()) throw new UnauthorizedException('Invalid or expired refresh token')
    if (!stored.user.isActive) throw new UnauthorizedException('Account is inactive')
    await this.prisma.refreshToken.delete({ where: { id: stored.id } })
    const tokens = await this.generateTokens(stored.user.id, stored.user.email ?? '', stored.user.role)
    // Rotated tokens keep the session's original login time; the early-login attendance batch reads it.
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken, stored.createdAt)
    return tokens
  }

  async logout(refreshToken: string) {
    if (refreshToken) await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    return { message: 'Logged out successfully.' }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
    if (!user) throw new UnauthorizedException()
    return user
  }

  async updateProfile(userId: string, b: Record<string, any>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { profileLocked: true } })
    if (!user) throw new UnauthorizedException()
    if (user.profileLocked) throw new ForbiddenException('Your profile is locked. Contact an administrator.')

    const email = V.email(b.email, 'Email')
    if (email) {
      const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (taken && taken.id !== userId) fail('The email has already been taken.')
    }
    // Joining date, department and salary are admin-managed and never taken from the profile form.
    const dob = V.date(b.dateOfBirth, 'Date of birth')
    const extra = V.obj(b.extraFields, 'Extra fields')
    const data = defined({
      displayName:      V.str(b.displayName, 'Display name', { max: 255 }) ?? undefined,
      firstName:        V.str(b.firstName, 'First name', { max: 100 }) ?? undefined,
      midName:          V.str(b.midName, 'Middle name', { max: 100 }),
      lastName:         V.str(b.lastName, 'Last name', { max: 100 }) ?? undefined,
      email,
      phone:            V.str(b.phone, 'Phone', { max: 30 }),
      dateOfBirth:      dob === undefined ? undefined : dob === null ? null : dateOnly(dob),
      address:          V.str(b.address, 'Address'),
      experience:       V.str(b.experience, 'Experience', { max: 255 }),
      cnic:             V.str(b.cnic, 'CNIC', { max: 15 }),
      permanentAddress: V.str(b.permanentAddress, 'Permanent address'),
      currentAddress:   V.str(b.currentAddress, 'Current address'),
      bank:             V.str(b.bank, 'Bank', { max: 255 }),
      accountTitle:     V.str(b.accountTitle, 'Account title', { max: 255 }),
      bankAccountNo:    V.str(b.bankAccountNo, 'Account number', { max: 100 }),
      ibanNo:           V.str(b.ibanNo, 'IBAN', { max: 100 }),
      extraFields:      extra === null ? Prisma.DbNull : (extra as Prisma.InputJsonValue | undefined),
    })
    return this.prisma.user.update({ where: { id: userId }, data: data as Prisma.UserUpdateInput, select: USER_SELECT })
  }

  async changePassword(userId: string, b: Record<string, any>) {
    const current = V.str(b.currentPassword, 'Current password', { required: true })!
    const next    = V.str(b.newPassword, 'New password', { required: true, min: 8 })!
    if (next !== b.newPasswordConfirmation) fail('The new password confirmation does not match.')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()
    if (!(await bcrypt.compare(current, user.password))) fail('Current password is incorrect.')
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(next, 12) } })
    return { message: 'Password updated successfully.' }
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, role }, {
      secret:    this.config.get('jwt.accessSecret'),
      expiresIn: this.config.get('jwt.accessExpiresIn'),
    })
    return { accessToken, refreshToken: uuidv4() + uuidv4() }
  }

  private async saveRefreshToken(userId: string, token: string, createdAt?: Date) {
    const days = parseInt((this.config.get<string>('jwt.refreshExpiresIn') ?? '7d').replace('d', ''), 10)
    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt: new Date(Date.now() + days * 86_400_000), ...(createdAt ? { createdAt } : {}) } })
  }
}
