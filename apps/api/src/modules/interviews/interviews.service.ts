import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { EmailService } from '../email/email.service'
import { Actor, assertHrDesk } from '../../common/utils/staff-policy'
import { V, fail, pageArgs, toPage } from '../../common/utils/validate'
import { PKT_TZ, todayIn, isYmd, parseYmd, zonedToUtc, dayRangeUtc, monthStart, addDays, dateOnly } from '../../common/utils/time'

export const KINDS    = ['SCHEDULED', 'WALK_IN'] as const
export const STATUSES = ['SCHEDULED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const
export const RESULTS  = ['PENDING', 'SELECTED', 'REJECTED', 'ON_HOLD'] as const
export const MODES    = ['In person', 'Phone', 'Video'] as const
export const QUESTION_TYPES = ['text', 'textarea', 'rating', 'yesno', 'choice', 'number'] as const
const GENDERS  = ['Male', 'Female', 'Other']
const CV_KEY_RE = /^cv\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/

export type Question = { id: string; label: string; type: string; options?: string[]; required?: boolean }

const CANDIDATE_LIST = { id: true, fullName: true, phone: true, email: true, city: true, cvKey: true, cvName: true }
const PERSON = { select: { id: true, displayName: true } }

/** "Monday, 27 October 2026 at 7:30 PM" in Pakistan time */
export function fmtWhen(d: Date) {
  const date = d.toLocaleDateString('en-GB', { timeZone: PKT_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { timeZone: PKT_TZ, hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

@Injectable()
export class InterviewsService {
  private logger = new Logger(InterviewsService.name)

  constructor(private prisma: PrismaService, private email: EmailService) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Date and time are typed in Pakistan time; stored as UTC. */
  private when(date: unknown, time: unknown, label = 'Interview time') {
    if (!isYmd(date)) fail(`${label}: choose a date.`)
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''))
    if (!m || +m[1] > 23 || +m[2] > 59) fail(`${label}: choose a time.`)
    const { y, m: mo, d } = parseYmd(date as string)
    const at = zonedToUtc(y, mo, d, +m![1], +m![2], 0, PKT_TZ)
    if (at.getTime() < Date.now() - 5 * 60_000) fail(`${label} is in the past.`)
    return at
  }

  private candidateData(b: Record<string, any>, creating: boolean) {
    const cvKey = V.str(b.cvKey, 'CV', { max: 120 })
    if (cvKey && !CV_KEY_RE.test(cvKey)) fail('The CV upload is not valid. Please upload it again.')
    const gender = V.str(b.gender, 'Gender')
    if (gender && !GENDERS.includes(gender)) fail('Choose a gender from the list.')
    const num = (v: unknown, label: string, max: number) => {
      const n = V.num(v, label)
      if (n !== undefined && n !== null && (n < 0 || n > max)) fail(`${label} must be between 0 and ${max}.`)
      return n
    }
    const date = (v: unknown, label: string) => { const s = V.date(v, label); return s === undefined ? undefined : s === null ? null : dateOnly(s) }
    const data = {
      fullName:        V.str(b.fullName, 'Full name', { required: creating, max: 120 }) ?? undefined,
      fatherName:      V.str(b.fatherName, 'Father name', { max: 120 }),
      email:           V.email(b.email, 'Email'),
      phone:           V.str(b.phone, 'Phone', { required: creating, max: 30 }) ?? undefined,
      altPhone:        V.str(b.altPhone, 'Alternate phone', { max: 30 }),
      cnic:            V.str(b.cnic, 'CNIC', { max: 20 }),
      gender,
      dateOfBirth:     date(b.dateOfBirth, 'Date of birth'),
      city:            V.str(b.city, 'City', { max: 80 }),
      address:         V.str(b.address, 'Address', { max: 255 }),
      education:       V.str(b.education, 'Education', { max: 80 }),
      experienceYears: num(b.experienceYears, 'Total experience', 60),
      callCenterYears: num(b.callCenterYears, 'Call center experience', 60),
      lastCompany:     V.str(b.lastCompany, 'Last company', { max: 120 }),
      lastDesignation: V.str(b.lastDesignation, 'Last designation', { max: 120 }),
      currentSalary:   V.int(b.currentSalary, 'Current salary', { min: 0 }),
      expectedSalary:  V.int(b.expectedSalary, 'Expected salary', { min: 0 }),
      preferredShift:  V.str(b.preferredShift, 'Preferred shift', { max: 40 }),
      availableFrom:   date(b.availableFrom, 'Available from'),
      source:          V.str(b.source, 'Source', { max: 60 }),
      referredBy:      V.str(b.referredBy, 'Referred by', { max: 120 }),
      cvKey,
      cvName:          V.str(b.cvName, 'CV file name', { max: 255 }),
      notes:           V.str(b.notes, 'Notes', { max: 5000 }),
    }
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  }

  private async details(b: Record<string, any>, kind: string) {
    const formId = V.str(b.formId, 'Interview form')
    let formName: string | undefined
    if (formId) {
      const f = await this.prisma.interviewForm.findUnique({ where: { id: formId }, select: { name: true } })
      if (!f) fail('Choose an interview form from the list.')
      formName = f!.name
    }
    const position = V.str(b.position, 'Position', { max: 120 }) ?? formName
    if (!position) fail('Choose the position.')
    const interviewerId = V.str(b.interviewerId, 'Interviewer')
    if (interviewerId && !(await this.prisma.user.findUnique({ where: { id: interviewerId }, select: { id: true } }))) fail('Choose an interviewer from the list.')
    const mode = V.str(b.mode, 'Mode') ?? 'In person'
    if (!MODES.includes(mode as any)) fail('Choose how the interview happens.')
    const durationMin = V.int(b.durationMin, 'Duration', { min: 5, max: 480 }) ?? 30
    return { formId: formId ?? null, position: position!, interviewerId: interviewerId ?? null, mode, durationMin, location: V.str(b.location, 'Location', { max: 255 }) ?? null, kind }
  }

  private event(interviewId: string, type: string, actorId: string | null, note?: string | null, data?: Record<string, unknown>) {
    return this.prisma.interviewEvent.create({ data: { interviewId, type, actorId, note: note ?? null, data: (data ?? undefined) as any } })
  }

  private async load(id: string) {
    const iv = await this.prisma.interview.findUnique({ where: { id }, include: { candidate: true } })
    if (!iv) throw new NotFoundException('Interview not found.')
    return iv
  }

  /** Sends the invite / reschedule / cancellation email and records how it went in the trail. */
  private async mail(interviewId: string, kind: 'invite' | 'reschedule' | 'cancel', actorId: string | null, reason?: string | null) {
    const iv = await this.load(interviewId)
    const to = iv.candidate.email
    if (!to) return
    if (!this.email.enabled) { await this.event(interviewId, 'EMAIL_FAILED', actorId, 'Email is not set up on the server.'); return }
    try {
      await this.email.sendInterviewEmail(kind, to, {
        name: iv.candidate.fullName, position: iv.position, when: iv.scheduledAt ? fmtWhen(iv.scheduledAt) : '',
        mode: iv.mode, location: iv.location, reason: reason ?? null,
      })
      await this.event(interviewId, 'EMAIL_SENT', actorId, `${kind === 'invite' ? 'Invitation' : kind === 'reschedule' ? 'New time' : 'Cancellation'} emailed to ${to}`)
    } catch {
      await this.event(interviewId, 'EMAIL_FAILED', actorId, `Could not email ${to}`)
    }
  }

  // ── Reading ─────────────────────────────────────────────────────────────────

  async list(actor: Actor, q: Record<string, any>) {
    assertHrDesk(actor)
    const view = String(q.view ?? 'upcoming')
    const now = new Date()
    const today = dayRangeUtc(todayIn(PKT_TZ), addDays(todayIn(PKT_TZ), 1), PKT_TZ)
    const where: Prisma.InterviewWhereInput = {}
    if (view === 'today') where.OR = [{ scheduledAt: today }, { kind: 'WALK_IN', createdAt: today }]
    else if (view === 'upcoming') Object.assign(where, { status: 'SCHEDULED', scheduledAt: { gte: new Date(now.getTime() - 60 * 60_000) } })
    else if (view === 'awaiting') where.status = 'ARRIVED'
    else if (view === 'completed') where.status = 'COMPLETED'
    else if (view === 'no_show') where.status = 'NO_SHOW'
    else if (view === 'cancelled') where.status = 'CANCELLED'
    else if (view === 'walk_in') where.kind = 'WALK_IN'
    if (q.result && RESULTS.includes(q.result)) where.result = q.result
    if (isYmd(q.from) || isYmd(q.to)) {
      const range = dayRangeUtc(isYmd(q.from) ? q.from : '2000-01-01', addDays(isYmd(q.to) ? q.to : '2100-01-01', 1), PKT_TZ)
      where.AND = [{ OR: [{ scheduledAt: range }, { scheduledAt: null, createdAt: range }] }]
    }
    if (q.search) {
      const s = { contains: String(q.search).trim(), mode: 'insensitive' as const }
      where.AND = [...((where.AND as any[]) ?? []), { OR: [{ position: s }, { candidate: { fullName: s } }, { candidate: { phone: s } }, { candidate: { email: s } }, { candidate: { cnic: s } }] }]
    }
    const soonFirst = view === 'upcoming' || view === 'today'
    const { skip, take, page } = pageArgs(q.page, 25)
    const [rows, total] = await Promise.all([
      this.prisma.interview.findMany({
        where, skip, take,
        orderBy: soonFirst ? [{ scheduledAt: 'asc' }, { createdAt: 'asc' }] : [{ updatedAt: 'desc' }],
        include: { candidate: { select: CANDIDATE_LIST }, interviewer: PERSON, form: { select: { id: true, name: true } } },
      }),
      this.prisma.interview.count({ where }),
    ])
    return toPage(rows, total, page, take)
  }

  async stats(actor: Actor) {
    assertHrDesk(actor)
    const t = todayIn(PKT_TZ)
    const today = dayRangeUtc(t, addDays(t, 1), PKT_TZ)
    const month = dayRangeUtc(monthStart(t), addDays(t, 1), PKT_TZ)
    const [todayCount, upcoming, awaiting, completed, selected, noShows] = await Promise.all([
      this.prisma.interview.count({ where: { OR: [{ scheduledAt: today }, { kind: 'WALK_IN', createdAt: today }], status: { not: 'CANCELLED' } } }),
      this.prisma.interview.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() } } }),
      this.prisma.interview.count({ where: { status: 'ARRIVED' } }),
      this.prisma.interview.count({ where: { status: 'COMPLETED', completedAt: month } }),
      this.prisma.interview.count({ where: { result: 'SELECTED', completedAt: month } }),
      this.prisma.interview.count({ where: { status: 'NO_SHOW', updatedAt: month } }),
    ])
    return { today: todayCount, upcoming, awaiting, completedThisMonth: completed, selectedThisMonth: selected, noShowsThisMonth: noShows }
  }

  /** Forms and staff for the schedule screen. */
  async meta(actor: Actor) {
    assertHrDesk(actor)
    const [forms, interviewers] = await Promise.all([
      this.prisma.interviewForm.findMany({ where: { isActive: true }, orderBy: [{ kind: 'desc' }, { sortOrder: 'asc' }], select: { id: true, name: true, kind: true, description: true } }),
      this.prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'DIRECTOR', 'MANAGER'] } }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true, role: true, managerType: true } }),
    ])
    return { forms, interviewers, modes: MODES }
  }

  async get(actor: Actor, id: string) {
    assertHrDesk(actor)
    const iv = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: true, interviewer: PERSON, createdBy: PERSON,
        form: { select: { id: true, name: true, kind: true, questions: true, isActive: true } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: PERSON } },
      },
    })
    if (!iv) throw new NotFoundException('Interview not found.')
    const history = await this.prisma.interview.findMany({
      where: { candidateId: iv.candidateId, id: { not: id } }, orderBy: { createdAt: 'desc' },
      select: { id: true, position: true, kind: true, status: true, result: true, scheduledAt: true, createdAt: true },
    })
    return { ...iv, history }
  }

  // ── Scheduling ──────────────────────────────────────────────────────────────

  async schedule(actor: Actor, b: Record<string, any>) {
    assertHrDesk(actor)
    const at = this.when(b.date, b.time)
    const det = await this.details(b, 'SCHEDULED')
    const candidateId = V.str(b.candidateId, 'Candidate')
    const created = await this.prisma.$transaction(async tx => {
      const cand = candidateId
        ? await tx.candidate.update({ where: { id: candidateId }, data: this.candidateData(b, false) as any })
        : await tx.candidate.create({ data: { ...(this.candidateData(b, true) as any), createdById: actor.id } })
      const iv = await tx.interview.create({ data: { ...det, candidateId: cand.id, scheduledAt: at, status: 'SCHEDULED', createdById: actor.id } })
      await tx.interviewEvent.create({ data: { interviewId: iv.id, type: 'SCHEDULED', actorId: actor.id, note: `${det.position} interview on ${fmtWhen(at)}`, data: { scheduledAt: at.toISOString() } } })
      return iv
    })
    if (V.bool(b.sendEmail) !== false) await this.mail(created.id, 'invite', actor.id)
    return this.get(actor, created.id)
  }

  async walkIn(actor: Actor, b: Record<string, any>) {
    assertHrDesk(actor)
    const det = await this.details(b, 'WALK_IN')
    const created = await this.prisma.$transaction(async tx => {
      const cand = await tx.candidate.create({ data: { ...(this.candidateData(b, true) as any), createdById: actor.id } })
      const now = new Date()
      const iv = await tx.interview.create({ data: { ...det, candidateId: cand.id, status: 'ARRIVED', arrivedAt: now, createdById: actor.id } })
      await tx.interviewEvent.create({ data: { interviewId: iv.id, type: 'WALK_IN', actorId: actor.id, note: `Walked in for ${det.position}` } })
      return iv
    })
    return this.get(actor, created.id)
  }

  async updateCandidate(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    const data = this.candidateData(b, false)
    if (!Object.keys(data).length) fail('Nothing to update.')
    await this.prisma.candidate.update({ where: { id: iv.candidateId }, data: data as any })
    await this.event(id, 'CANDIDATE_UPDATED', actor.id, `Updated: ${Object.keys(data).join(', ')}`)
    return this.get(actor, id)
  }

  async updateDetails(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    const det = await this.details({ position: iv.position, formId: iv.formId, mode: iv.mode, durationMin: iv.durationMin, location: iv.location, interviewerId: iv.interviewerId, ...b }, iv.kind)
    await this.prisma.interview.update({ where: { id }, data: det })
    await this.event(id, 'NOTE', actor.id, 'Interview details updated')
    return this.get(actor, id)
  }

  async reschedule(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (iv.status === 'COMPLETED') fail('A completed interview cannot be rescheduled.')
    const at = this.when(b.date, b.time, 'New time')
    const reason = V.str(b.reason, 'Reason', { max: 500 })
    await this.prisma.interview.update({
      where: { id },
      data: { scheduledAt: at, status: 'SCHEDULED', kind: 'SCHEDULED', rescheduleCount: { increment: 1 }, reminderSentAt: null, arrivedAt: null },
    })
    await this.event(id, 'RESCHEDULED', actor.id, reason ?? null, { from: iv.scheduledAt?.toISOString() ?? null, to: at.toISOString() })
    if (V.bool(b.sendEmail) !== false) await this.mail(id, 'reschedule', actor.id, reason)
    return this.get(actor, id)
  }

  async arrived(actor: Actor, id: string) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (iv.status !== 'SCHEDULED' && iv.status !== 'NO_SHOW') fail('Only a scheduled interview can be marked as arrived.')
    const now = new Date()
    const late = iv.scheduledAt ? Math.round((now.getTime() - iv.scheduledAt.getTime()) / 60_000) : 0
    await this.prisma.interview.update({ where: { id }, data: { status: 'ARRIVED', arrivedAt: now } })
    await this.event(id, 'ARRIVED', actor.id, late > 5 ? `Arrived ${late} minutes late` : late < -5 ? `Arrived ${-late} minutes early` : 'Arrived on time', { minutesLate: late })
    return this.get(actor, id)
  }

  async noShow(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (iv.status !== 'SCHEDULED') fail('Only a scheduled interview can be marked as a no-show.')
    await this.prisma.interview.update({ where: { id }, data: { status: 'NO_SHOW' } })
    await this.event(id, 'NO_SHOW', actor.id, V.str(b.note, 'Note', { max: 500 }) ?? 'Did not come')
    return this.get(actor, id)
  }

  async cancel(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (iv.status === 'COMPLETED') fail('A completed interview cannot be cancelled.')
    const reason = V.str(b.reason, 'Reason', { max: 500 })
    await this.prisma.interview.update({ where: { id }, data: { status: 'CANCELLED' } })
    await this.event(id, 'CANCELLED', actor.id, reason ?? null)
    if (V.bool(b.sendEmail) === true && iv.scheduledAt) await this.mail(id, 'cancel', actor.id, reason)
    return this.get(actor, id)
  }

  async resendEmail(actor: Actor, id: string) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (!iv.candidate.email) fail('This candidate has no email address.')
    if (iv.status !== 'SCHEDULED' || !iv.scheduledAt) fail('Only an upcoming interview can be emailed.')
    await this.mail(id, 'invite', actor.id)
    return this.get(actor, id)
  }

  async addNote(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    await this.load(id)
    const type = b.type === 'CALLED' ? 'CALLED' : 'NOTE'
    const note = V.str(b.note, 'Note', { required: type === 'NOTE', max: 2000 })
    await this.event(id, type, actor.id, note ?? 'Called the candidate')
    return this.get(actor, id)
  }

  async remove(actor: Actor, id: string) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    await this.prisma.interview.delete({ where: { id } })
    const others = await this.prisma.interview.count({ where: { candidateId: iv.candidateId } })
    if (!others) await this.prisma.candidate.delete({ where: { id: iv.candidateId } })
    return { message: 'Interview deleted.' }
  }

  // ── The interview itself ────────────────────────────────────────────────────

  /** Saves answers as they are given; with complete: true it records the result and closes it. */
  async evaluate(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    const iv = await this.load(id)
    if (iv.status === 'CANCELLED') fail('This interview was cancelled.')
    const formId = V.str(b.formId, 'Interview form') ?? iv.formId
    if (!formId) fail('Choose an interview form first.')
    const form = await this.prisma.interviewForm.findUnique({ where: { id: formId! } })
    if (!form) fail('Choose an interview form from the list.')
    // Once answered, the questions are kept with the interview so later form edits do not change it
    const questions: Question[] = iv.formId === formId && iv.formSnapshot ? (iv.formSnapshot as any) : (form!.questions as any)
    const raw = (b.answers && typeof b.answers === 'object') ? b.answers as Record<string, unknown> : {}
    const answers: Record<string, unknown> = {}
    for (const q of questions) {
      const v = raw[q.id]
      if (v === undefined || v === null || v === '') continue
      if (q.type === 'rating') { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 5) fail(`"${q.label}" needs a rating from 1 to 5.`); answers[q.id] = n }
      else if (q.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) fail(`"${q.label}" needs a number.`); answers[q.id] = n }
      else if (q.type === 'yesno') answers[q.id] = v === true || v === 'yes' ? 'yes' : 'no'
      else if (q.type === 'choice') { if (!(q.options ?? []).includes(String(v))) fail(`Choose an option for "${q.label}".`); answers[q.id] = String(v) }
      else answers[q.id] = String(v).slice(0, 5000)
    }
    const rating = V.int(b.rating, 'Overall rating', { min: 1, max: 5 })
    const remarks = V.str(b.remarks, 'Remarks', { max: 5000 })
    const interviewerId = V.str(b.interviewerId, 'Interviewer') ?? iv.interviewerId
    const complete = V.bool(b.complete) === true
    const result = V.str(b.result, 'Result')
    if (result && !RESULTS.includes(result as any)) fail('Choose a result.')
    if (complete) {
      if (!result || result === 'PENDING') fail('Choose the result: Selected, Rejected or On hold.')
      const missing = questions.filter(q => q.required && answers[q.id] === undefined).map(q => q.label)
      if (missing.length) fail(`Answer the required questions: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`)
    }
    const now = new Date()
    await this.prisma.interview.update({
      where: { id },
      data: {
        formId: formId!, formSnapshot: questions as any, answers: answers as any,
        rating: rating ?? null, remarks: remarks ?? null, interviewerId: interviewerId ?? null,
        ...(result ? { result } : {}),
        ...(complete ? { status: 'COMPLETED', completedAt: iv.completedAt ?? now, arrivedAt: iv.arrivedAt ?? now } : {}),
      },
    })
    if (complete) await this.event(id, 'COMPLETED', actor.id, `Result: ${result!.replace('_', ' ').toLowerCase()}${rating ? `, rated ${rating}/5` : ''}`, { result, rating })
    else await this.event(id, 'EVALUATION_SAVED', actor.id, `${Object.keys(answers).length} of ${questions.length} questions answered`)
    return this.get(actor, id)
  }

  // ── Reminders (30 minutes before) ───────────────────────────────────────────

  /** Reminders this user still has to see: sent, interview not started yet, not acknowledged by them. */
  async pendingReminders(actor: Actor) {
    assertHrDesk(actor)
    const rows = await this.prisma.interview.findMany({
      where: {
        status: 'SCHEDULED', reminderSentAt: { not: null },
        scheduledAt: { gt: new Date(Date.now() - 15 * 60_000) },
        NOT: { events: { some: { actorId: actor.id, type: { in: ['CALLED', 'REMINDER_SEEN'] } } } },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { candidate: { select: { fullName: true, phone: true, altPhone: true } } },
    })
    return rows.map(r => ({ id: r.id, position: r.position, scheduledAt: r.scheduledAt, mode: r.mode, candidate: r.candidate }))
  }

  async ackReminder(actor: Actor, id: string, b: Record<string, any>) {
    assertHrDesk(actor)
    await this.load(id)
    await this.event(id, V.bool(b.called) ? 'CALLED' : 'REMINDER_SEEN', actor.id, V.bool(b.called) ? 'Called the candidate before the interview' : 'Saw the 30 minute reminder')
    return { ok: true }
  }

  // ── Forms ───────────────────────────────────────────────────────────────────

  private questions(v: unknown): Question[] {
    if (!Array.isArray(v) || !v.length) fail('Add at least one question.')
    if ((v as unknown[]).length > 80) fail('A form can have up to 80 questions.')
    const seen = new Set<string>()
    return (v as any[]).map((q, i) => {
      const label = V.str(q?.label, `Question ${i + 1}`, { required: true, max: 300 })!
      const type = String(q?.type ?? 'text')
      if (!QUESTION_TYPES.includes(type as any)) fail(`Question ${i + 1}: choose a valid answer type.`)
      let id = typeof q?.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(q.id) ? q.id : `q_${randomUUID().slice(0, 8)}`
      if (seen.has(id)) id = `q_${randomUUID().slice(0, 8)}`
      seen.add(id)
      const out: Question = { id, label, type, required: q?.required === true }
      if (type === 'choice') {
        const opts = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => String(o).trim()).filter(Boolean)
        if (opts.length < 2) fail(`Question ${i + 1}: give at least two options.`)
        out.options = Array.from(new Set(opts)).slice(0, 20) as string[]
      }
      return out
    })
  }

  async listForms(actor: Actor) {
    assertHrDesk(actor)
    const forms = await this.prisma.interviewForm.findMany({ orderBy: [{ kind: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { interviews: true } } } })
    return forms.map(({ _count, ...f }) => ({ ...f, used: _count.interviews }))
  }

  async saveForm(actor: Actor, id: string | null, b: Record<string, any>) {
    assertHrDesk(actor)
    const kind = V.str(b.kind, 'Type') ?? 'SCHEDULED'
    if (!KINDS.includes(kind as any)) fail('Choose Scheduled or Walk-in.')
    const data = {
      name: V.str(b.name, 'Form name', { required: true, max: 120 })!,
      kind,
      description: V.str(b.description, 'Description', { max: 300 }) ?? null,
      questions: this.questions(b.questions) as any,
      ...(b.isActive !== undefined ? { isActive: V.bool(b.isActive) !== false } : {}),
    }
    if (id) {
      if (!(await this.prisma.interviewForm.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Form not found.')
      return this.prisma.interviewForm.update({ where: { id }, data })
    }
    const last = await this.prisma.interviewForm.aggregate({ _max: { sortOrder: true } })
    return this.prisma.interviewForm.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } })
  }

  async duplicateForm(actor: Actor, id: string) {
    assertHrDesk(actor)
    const f = await this.prisma.interviewForm.findUnique({ where: { id } })
    if (!f) throw new NotFoundException('Form not found.')
    return this.saveForm(actor, null, { name: `${f.name} (copy)`, kind: f.kind, description: f.description, questions: f.questions })
  }

  /** A form already used keeps its history and is turned off; an unused one is deleted. */
  async removeForm(actor: Actor, id: string) {
    assertHrDesk(actor)
    const used = await this.prisma.interview.count({ where: { formId: id } })
    if (used) {
      await this.prisma.interviewForm.update({ where: { id }, data: { isActive: false } })
      return { message: 'This form has interviews on record, so it was turned off instead of deleted.' }
    }
    await this.prisma.interviewForm.delete({ where: { id } }).catch(() => { throw new NotFoundException('Form not found.') })
    return { message: 'Form deleted.' }
  }
}
