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

  private async send(to: string, subject: string, html: string, text: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, html, text }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      this.logger.error(`Resend refused "${subject}" (${res.status}): ${detail.slice(0, 300)}`)
      throw new Error('Email not sent')
    }
  }

  /** Interview invitation, new time, or cancellation for a candidate. */
  async sendInterviewEmail(kind: 'invite' | 'reschedule' | 'cancel', to: string, d: { name: string; position: string; when: string; mode: string; location?: string | null; reason?: string | null }) {
    if (!this.apiKey) throw new Error('Email is not configured')
    const where = d.mode === 'In person' ? (d.location || 'the Meta Voice office') : d.mode === 'Phone' ? 'over the phone (we will call you)' : `by video call${d.location ? ` (${d.location})` : ''}`
    const subject = kind === 'invite' ? `Your interview at Meta Voice: ${d.when}`
      : kind === 'reschedule' ? `New time for your Meta Voice interview: ${d.when}`
      : 'Your Meta Voice interview has been cancelled'
    const lead = kind === 'invite' ? `Thank you for applying. We would like to invite you for an interview for the <strong>${this.esc(d.position)}</strong> position at Meta Voice.`
      : kind === 'reschedule' ? `Your interview for the <strong>${this.esc(d.position)}</strong> position at Meta Voice has been moved to a new time.`
      : `Your interview for the <strong>${this.esc(d.position)}</strong> position at Meta Voice, set for ${this.esc(d.when)}, has been cancelled.`
    const rows = kind === 'cancel' ? [] : [['Position', d.position], ['Date and time', `${d.when} (Pakistan time)`], ['Where', where]]
    const tail = kind === 'cancel' ? 'We will contact you if a new time is arranged.'
      : 'Please bring your CNIC and an updated CV, and arrive 10 minutes early. If you cannot make it, reply to this email or call us so we can arrange another time.'
    const text = [`Dear ${d.name},`, '', lead.replace(/<[^>]+>/g, ''), ...rows.map(([k, v]) => `${k}: ${v}`), ...(d.reason ? [`Note: ${d.reason}`] : []), '', tail, '', 'Meta Voice HR'].join('\n')
    await this.send(to, subject, this.interviewHtml(d.name, lead, rows, d.reason ?? null, tail), text)
  }

  private esc(s: string) { return s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!)) }

  private interviewHtml(name: string, lead: string, rows: string[][], reason: string | null, tail: string) {
    const FONT = "'Aptos','Segoe UI',Helvetica,Arial,sans-serif", NAVY = '#132E57', TEAL = '#1E8496', BODY = '#44526B', MUTED = '#8A97AB', BORDER = '#E4E8EF'
    const table = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;border:1px solid ${BORDER};border-radius:8px;">${rows.map(([k, v], i) =>
      `<tr><td style="padding:10px 14px;font-family:${FONT};font-size:9.5pt;color:${MUTED};width:120px;${i ? `border-top:1px solid ${BORDER};` : ''}">${this.esc(k)}</td><td style="padding:10px 14px;font-family:${FONT};font-size:10.5pt;font-weight:600;color:${NAVY};${i ? `border-top:1px solid ${BORDER};` : ''}">${this.esc(v)}</td></tr>`).join('')}</table>` : ''
    return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F6F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;">
<tr><td align="center" style="padding:30px 40px 4px;"><img src="${this.appUrl}/logo.png" alt="Meta Voice" width="100" style="width:100px;max-width:40%;height:auto;display:block;border:0;" /></td></tr>
<tr><td style="padding:18px 40px 0;font-family:${FONT};font-size:11pt;line-height:1.65;color:${BODY};">
<p style="margin:0 0 12px;color:${NAVY};">Dear <strong>${this.esc(name)}</strong>,</p><p style="margin:0;">${lead}</p>${table}
${reason ? `<p style="margin:12px 0 0;padding:10px 14px;background:#F4F8FA;border-left:3px solid ${TEAL};border-radius:4px;">${this.esc(reason)}</p>` : ''}
<p style="margin:16px 0 0;">${this.esc(tail)}</p></td></tr>
<tr><td style="padding:22px 40px 30px;"><div style="border-top:1px solid ${BORDER};padding-top:14px;font-family:${FONT};font-size:9pt;color:${MUTED};"><p style="margin:0;color:${NAVY};font-weight:600;">Meta Voice HR</p></div></td></tr>
</table></td></tr></table></body></html>`
  }

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
