import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Outgoing email through Resend (resend.com), the same provider argroup uses. It calls Resend's
 * REST API directly, so no SDK is needed. Without RESEND_API_KEY nothing is sent and a warning is
 * logged instead.
 */
@Injectable()
export class EmailService {
  private apiKey: string
  private from: string
  /** Public site the email pulls its logo from; it must be reachable by recipients. */
  private appUrl: string
  private logger = new Logger(EmailService.name)

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('resend.apiKey') ?? ''
    if (!this.apiKey) this.logger.warn('RESEND_API_KEY not set, email sending is disabled')
    this.from   = `${config.get('resend.fromName') ?? 'Meta Voice'} <${config.get('resend.fromEmail') ?? 'noreply@metavoice.cloud'}>`
    this.appUrl = (config.get<string>('clientUrl') ?? 'https://metavoice.cloud').replace(/\/+$/, '')
  }

  get enabled() { return !!this.apiKey }

  async sendPasswordResetOtp(to: string, name: string, otp: string, minutes: number) {
    if (!this.apiKey) {
      this.logger.warn(`Skipped password reset code to ${to}, email is not configured`)
      return
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: `${otp} is your Meta Voice password reset code`,
        html: this.otpHtml(name, otp, minutes),
        text: [
          `Dear ${name},`,
          '',
          `Your Meta Voice password reset code is ${otp}`,
          '',
          `The code expires in ${minutes} minutes and can be used once.`,
          'If you did not ask to reset your password, you can ignore this email and nothing will change.',
          '',
          'Meta Voice',
        ].join('\n'),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      this.logger.error(`Resend refused the password reset email (${res.status}): ${detail.slice(0, 300)}`)
      throw new Error('Email not sent')
    }
  }

  /**
   * Tables and inline styles on purpose: Outlook and Gmail strip <style> blocks, flexbox and most
   * modern CSS. Aptos is not a web font in mail clients; recipients without Office fall through to
   * Segoe UI or Helvetica.
   */
  private otpHtml(name: string, otp: string, minutes: number): string {
    const FONT   = "'Aptos','Segoe UI',Helvetica,Arial,sans-serif"
    const NAVY   = '#132E57'
    const TEAL   = '#1E8496'
    const BODY   = '#44526B'
    const MUTED  = '#8A97AB'
    const BORDER = '#E4E8EF'
    const safe   = name.replace(/[<>&"]/g, '')

    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F6F9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;">
            <tr>
              <td align="center" style="padding:32px 40px 4px;">
                <img src="${this.appUrl}/logo.png" alt="Meta Voice" width="110" style="width:110px;max-width:40%;height:auto;display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px 0;font-family:${FONT};font-size:11pt;line-height:1.65;color:${BODY};">
                <p style="margin:0 0 14px;color:${NAVY};font-size:11pt;">Dear <strong>${safe}</strong>,</p>
                <p style="margin:0;">Use the code below to reset your Meta Voice password.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 40px 4px;">
                <div style="display:inline-block;background:#F4F8FA;border:1px solid ${BORDER};border-radius:8px;padding:14px 28px;">
                  <span style="font-family:${FONT};font-size:26pt;font-weight:700;letter-spacing:0.18em;color:${TEAL};">${otp}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:10px 40px 0;font-family:${FONT};font-size:10pt;color:${MUTED};">
                This code expires in ${minutes} minutes and can be used once.
              </td>
            </tr>
            <tr>
              <td style="padding:22px 40px 32px;">
                <div style="border-top:1px solid ${BORDER};padding-top:16px;font-family:${FONT};font-size:9pt;line-height:1.6;color:${MUTED};">
                  <p style="margin:0 0 3px;">If you did not ask to reset your password you can ignore this email, nothing will change. Never share this code with anyone.</p>
                  <p style="margin:0;color:${NAVY};font-weight:600;">Meta Voice</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  }
}
