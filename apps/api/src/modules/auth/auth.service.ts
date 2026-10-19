import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common'
import { JwtService }    from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import * as bcrypt       from 'bcryptjs'
import * as crypto       from 'crypto'
import * as fs           from 'fs'
import * as path         from 'path'
import { v4 as uuidv4 }  from 'uuid'
import { Role, ManagerType } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { EmailService } from '../email/email.service'
import { uploadRoot, AVATAR_RE } from '../files/files.controller'
import { USER_SELECT } from '../users/users.service'
import { V, fail, defined } from '../../common/utils/validate'
import { PKT_TZ, todayIn, monthStart, monthEnd, dateOnly, fmtLongDate } from '../../common/utils/time'

function clock12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// Password reset: long enough to find the mail, short enough that a stolen code goes stale fast
const OTP_TTL_MIN   = 10
const RESET_TTL_MIN = 15   // time to type the new password once the code is accepted
const MAX_OTP_TRIES = 5

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name)

  constructor(
    private prisma:     PrismaService,
    private jwt:        JwtService,
    private config:     ConfigService,
    private attendance: AttendanceService,
    private email:      EmailService,
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
      fatherName:       V.str(b.fatherName, 'Father name', { max: 100 }),
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

  // ── Profile photo (stored on the server, shown everywhere) ─────────────────

  /** Saves a small image sent as a data URL (the browser shrinks it first) and returns its file name. */
  async setAvatar(userId: string, image: unknown) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(image ?? ''))
    if (!m) fail('Please choose a JPG, PNG or WebP image.')
    const bytes = Buffer.from(m![2], 'base64')
    if (bytes.length > 400 * 1024) fail('That image is too large.')
    const dir = path.join(uploadRoot(), 'avatars')
    fs.mkdirSync(dir, { recursive: true })
    const name = `${uuidv4()}.${m![1] === 'jpeg' ? 'jpg' : m![1]}`
    fs.writeFileSync(path.join(dir, name), bytes)
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } })
    await this.prisma.user.update({ where: { id: userId }, data: { avatar: name } })
    this.dropAvatarFile(before?.avatar)
    return { avatar: name }
  }

  async clearAvatar(userId: string) {
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } })
    await this.prisma.user.update({ where: { id: userId }, data: { avatar: null } })
    this.dropAvatarFile(before?.avatar)
    return { avatar: null }
  }

  private dropAvatarFile(name?: string | null) {
    if (name && AVATAR_RE.test(name)) fs.rm(path.join(uploadRoot(), 'avatars', name), { force: true }, () => {})
  }

  // ── Forgot password by emailed code (the argroup flow) ──────────────────────

  /** Man****@****ample.com: enough for the owner to recognise, not enough for anyone else to learn. */
  private maskEmail(email: string): string {
    const at = email.lastIndexOf('@')
    if (at < 1) return '****'
    const local  = email.slice(0, at)
    const domain = email.slice(at + 1)
    const shown  = local.slice(0, Math.min(3, Math.max(1, local.length - 1)))
    const hide   = Math.min(4, Math.max(1, Math.floor(domain.length / 2)))
    return `${shown}****@****${domain.slice(hide)}`
  }

  /** Login takes an email or a User ID, so the reset does too. */
  private findByIdentifier(identifier: unknown) {
    const id = String(identifier ?? '').trim()
    if (!id) return Promise.resolve(null)
    return this.prisma.user.findUnique({ where: id.includes('@') ? { email: id.toLowerCase() } : { userCode: id.toUpperCase() } })
  }

  /** Step 0: confirms the account and shows only a masked address, so the user picks the right one. */
  async lookupForReset(identifier: unknown) {
    // Until RESEND_API_KEY is set on the server no code can be emailed, so say so up front
    if (!this.email.enabled) fail('Password reset by email is not set up yet. Please ask your admin to reset your password.')
    const user = await this.findByIdentifier(identifier)
    if (!user) fail('No account found with that email or user ID.')
    if (!user!.isActive) fail('That account is inactive. Please contact your admin.')
    if (!user!.email) fail('That account has no email address on file. Please ask your admin to add one.')
    return { maskedEmail: this.maskEmail(user!.email!), name: user!.displayName }
  }

  /** Step 1: emails a 6-digit code. Answers the same either way, so it cannot reveal who has an account. */
  async forgotPassword(identifier: unknown) {
    const generic = { message: 'If that account exists, a reset code has been sent to its email address.' }
    const user = await this.findByIdentifier(identifier)
    // Inactive accounts are a deliberate lockout; a reset must not undo it
    if (!user || !user.isActive || !user.email) return generic

    const otp = String(crypto.randomInt(100000, 1000000))
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash: await bcrypt.hash(otp, 10), resetOtpExp: new Date(Date.now() + OTP_TTL_MIN * 60_000), resetOtpTries: 0,
        resetToken: null, resetTokenExp: null,   // a fresh request voids any ticket already issued
      },
    })
    try {
      await this.email.sendPasswordResetOtp(user.email, user.displayName, otp, OTP_TTL_MIN)
    } catch {
      this.logger.error(`Failed to send reset code to user ${user.userCode}`)   // not surfaced: it would leak that the account exists
    }
    return generic
  }

  /** Step 2: a correct code buys a single-use ticket, so the new password never travels with the code. */
  async verifyResetOtp(identifier: unknown, otpIn: unknown) {
    const otp = V.str(otpIn, 'Code', { required: true })!
    if (!/^\d{6}$/.test(otp)) fail('The code is 6 digits.')
    const user = await this.findByIdentifier(identifier)
    if (!user || !user.resetOtpHash || !user.resetOtpExp) fail('That code is not valid. Please check it and try again.')
    if (user!.resetOtpExp! < new Date()) fail('That code has expired. Please request a new one.')
    if (user!.resetOtpTries >= MAX_OTP_TRIES) fail('Too many incorrect attempts. Please request a new code.')
    if (!(await bcrypt.compare(otp, user!.resetOtpHash!))) {
      await this.prisma.user.update({ where: { id: user!.id }, data: { resetOtpTries: { increment: 1 } } })
      fail('That code is not valid. Please check it and try again.')
    }
    const resetToken = uuidv4() + uuidv4()
    await this.prisma.user.update({
      where: { id: user!.id },
      data: { resetToken, resetTokenExp: new Date(Date.now() + RESET_TTL_MIN * 60_000), resetOtpHash: null, resetOtpExp: null, resetOtpTries: 0 },
    })
    return { resetToken }
  }

  /** Step 3: sets the new password and signs every existing session out. */
  async resetPassword(resetTokenIn: unknown, passwordIn: unknown) {
    const resetToken = V.str(resetTokenIn, 'Reset ticket', { required: true })!
    const password   = V.str(passwordIn, 'Password', { required: true, min: 8 })!
    const user = await this.prisma.user.findUnique({ where: { resetToken } })
    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) fail('This reset has expired. Please start again.')
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user!.id },
        data: { password: await bcrypt.hash(password, 12), resetToken: null, resetTokenExp: null, resetOtpHash: null, resetOtpExp: null, resetOtpTries: 0 },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: user!.id } }),
    ])
    return { message: 'Password updated. You can now sign in with your new password.' }
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
