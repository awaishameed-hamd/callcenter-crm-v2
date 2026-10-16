import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail, pageArgs, toPage } from '../../common/utils/validate'
import { PKT_TZ, todayIn, dateOnly, fmtDateOnly, diffDays, parseYmd, ymd } from '../../common/utils/time'
import { DEFAULT_COA } from './default-coa'

type Tx = Prisma.TransactionClient

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']
const CURRENCIES    = ['PKR', 'USD', 'GBP', 'EUR']
const PARTY_TYPES   = ['customer', 'supplier', 'both']
const FORM_TYPES    = ['expense', 'sales_receipt', 'invoice', 'bill', 'bank_deposit', 'cheque', 'journal']
const NEEDS_PAYMENT_ACCOUNT = ['expense', 'sales_receipt', 'bank_deposit', 'cheque']
const NOTES_REQUIRED     = ['Property, Plant & Equipment', 'Intangible Assets', 'Right of Use Assets', 'Investment Properties', 'Lease Liability', 'Concession Assets']
const SUB_NOTES_REQUIRED = ['Property, Plant & Equipment', 'Intangible Assets', 'Investment Properties']

const normalBalance = (type: string) => (type === 'asset' || type === 'expense' ? 'debit' : 'credit')
const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0)
const r2 = (v: number) => Math.round(v * 100) / 100
// A reversed voucher stays in the ledger next to its reversing journal, so the two net to zero.
// (The Laravel CRM dropped reversed originals from totals, which double-counted every reversal.)
const POSTED: Prisma.VoucherWhereInput = { status: { in: ['posted', 'reversed'] } }
const OPEN_ONLY: Prisma.VoucherWhereInput = { status: 'posted' }

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // ══ Chart of accounts ═══════════════════════════════════════════════════════

  private async lineTotals(where: Prisma.VoucherLineWhereInput = {}) {
    const rows = await this.prisma.voucherLine.groupBy({
      by: ['accountId'],
      where: { ...where, voucher: { ...POSTED, ...(where.voucher as Prisma.VoucherWhereInput ?? {}) } },
      _sum: { debitPkr: true, creditPkr: true },
    })
    return new Map(rows.map(r => [r.accountId, { d: n(r._sum.debitPkr), c: n(r._sum.creditPkr) }]))
  }

  async coaIndex(q: Record<string, string | undefined>) {
    const where: Prisma.AccountWhereInput = {}
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ accountCode: s }, { accountName: s }]
    }
    if (q.type) where.accountType = q.type
    if (V.bool(q.postingOnly)) where.isPosting = true
    if (q.active !== undefined) where.isActive = V.bool(q.active) ?? false
    const [accounts, totals] = await Promise.all([
      this.prisma.account.findMany({ where, orderBy: { accountCode: 'asc' } }),
      this.lineTotals(),
    ])
    return accounts.map(a => {
      const t = totals.get(a.id) ?? { d: 0, c: 0 }
      return { ...a, balance: r2(a.normalBalance === 'debit' ? t.d - t.c : t.c - t.d) }
    })
  }

  private readAccount(b: Record<string, any>) {
    const accountType = V.oneOf(b.accountType, 'Account type', ACCOUNT_TYPES, { required: true })!
    const data = {
      accountCode: V.str(b.accountCode, 'Account code', { required: true, max: 20 })!,
      accountName: V.str(b.accountName, 'Account name', { required: true, max: 255 })!,
      level1:      V.str(b.level1, 'Level 1', { required: true })!,
      level2:      V.str(b.level2, 'Main classification', { required: true })!,
      level3:      V.str(b.level3, 'Sub classification', { required: true })!,
      level4:      V.str(b.level4, 'Notes classification') ?? null,
      level5:      V.str(b.level5, 'Sub notes classification') ?? null,
      accountType,
      normalBalance: normalBalance(accountType),
      currency:    V.oneOf(b.currency, 'Currency', CURRENCIES, { required: true })!,
      isPosting:   V.bool(b.isPosting) ?? true,
      description: V.str(b.description, 'Description') ?? null,
    }
    if (NOTES_REQUIRED.includes(data.level3) && !data.level4) fail('Notes Classification is required for this Sub Classification.')
    if (SUB_NOTES_REQUIRED.includes(data.level3) && !data.level5) fail('Sub Notes Classification is required for PPE, Intangible Assets, and Investment Properties.')
    return data
  }

  private async assertCodeFree(code: string, ignoreId?: string) {
    const hit = await this.prisma.account.findUnique({ where: { accountCode: code }, select: { id: true } })
    if (hit && hit.id !== ignoreId) fail('The account code has already been taken.')
  }

  async coaStore(b: Record<string, any>) {
    const data = this.readAccount(b)
    await this.assertCodeFree(data.accountCode)
    const parentId = V.str(b.parentId, 'Parent account') ?? null
    if (parentId && !(await this.prisma.account.findUnique({ where: { id: parentId }, select: { id: true } }))) fail('The selected parent account is invalid.')
    return this.prisma.account.create({ data: { ...data, parentId, isActive: true } })
  }

  async coaUpdate(id: string, b: Record<string, any>) {
    await this.account(id)
    const data = this.readAccount(b)
    await this.assertCodeFree(data.accountCode, id)
    return this.prisma.account.update({ where: { id }, data: { ...data, isActive: V.bool(b.isActive) ?? true } })
  }

  private async account(id: string) {
    const a = await this.prisma.account.findUnique({ where: { id } })
    if (!a) throw new NotFoundException('Account not found.')
    return a
  }

  async coaBalance(id: string) {
    const a = await this.account(id)
    const t = (await this.lineTotals({ accountId: id })).get(id) ?? { d: 0, c: 0 }
    return {
      accountId: a.id, accountName: a.accountName, currency: a.currency,
      balance: r2(a.normalBalance === 'debit' ? t.d - t.c : t.c - t.d),
      totalDebit: r2(t.d), totalCredit: r2(t.c),
    }
  }

  async loadDefaults() {
    if (await this.prisma.account.count()) fail('Chart of Accounts already has entries.')
    await this.prisma.account.createMany({
      data: DEFAULT_COA.map(([accountCode, accountName, level1, level2, level3, accountType, level4, level5]) => ({
        accountCode, accountName, level1, level2, level3, level4: level4 ?? null, level5: level5 ?? null,
        accountType, normalBalance: normalBalance(accountType), currency: 'PKR', isPosting: true, isActive: true,
      })),
    })
    return { message: `${DEFAULT_COA.length} default accounts loaded.` }
  }

  // ══ CoA classifications ═════════════════════════════════════════════════════

  classIndex() {
    return this.prisma.coaClass.findMany({ orderBy: [{ level: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })
  }

  async classStore(b: Record<string, any>) {
    const level = V.int(b.level, 'Level', { required: true, min: 2, max: 5 })!
    const parentId = V.str(b.parentId, 'Parent') ?? null
    if (parentId && !(await this.prisma.coaClass.findUnique({ where: { id: parentId }, select: { id: true } }))) fail('The selected parent is invalid.')
    return this.prisma.coaClass.create({
      data: {
        level, parentId,
        name:        V.str(b.name, 'Name', { required: true, max: 255 })!,
        accountType: V.oneOf(b.accountType, 'Account type', ACCOUNT_TYPES) ?? null,
        codeDigit:   V.int(b.codeDigit, 'Code digit', { min: 1, max: 9 }) ?? null,
        isActive:    true,
      },
    })
  }

  private async coaClass(id: string) {
    const c = await this.prisma.coaClass.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('Classification not found.')
    return c
  }

  async classUpdate(id: string, b: Record<string, any>) {
    await this.coaClass(id)
    return this.prisma.coaClass.update({
      where: { id },
      data: {
        name:        V.str(b.name, 'Name', { required: true, max: 255 })!,
        accountType: V.oneOf(b.accountType, 'Account type', ACCOUNT_TYPES) ?? null,
        codeDigit:   V.int(b.codeDigit, 'Code digit', { min: 1, max: 9 }) ?? null,
      },
    })
  }

  async classToggle(id: string) {
    const c = await this.coaClass(id)
    return this.prisma.coaClass.update({ where: { id }, data: { isActive: !c.isActive } })
  }

  private async descendants(id: string): Promise<string[]> {
    const children = await this.prisma.coaClass.findMany({ where: { parentId: id }, select: { id: true } })
    const nested = await Promise.all(children.map(c => this.descendants(c.id)))
    return children.flatMap((c, i) => [c.id, ...nested[i]])
  }

  async classDelete(id: string) {
    await this.coaClass(id)
    const all = await this.prisma.coaClass.findMany({ where: { id: { in: [id, ...(await this.descendants(id))] } } })
    for (const cls of all) {
      const col = `level${cls.level}` as 'level2' | 'level3' | 'level4' | 'level5'
      const count = await this.prisma.account.count({ where: { [col]: cls.name } })
      if (count > 0) fail(`Cannot delete "${cls.name}": ${count} account(s) in the ledger are using this classification. Reclassify those accounts first.`)
    }
    await this.prisma.coaClass.delete({ where: { id } })
    return { message: 'Deleted successfully.' }
  }

  // ══ Parties ═════════════════════════════════════════════════════════════════

  partiesIndex(q: Record<string, string | undefined>) {
    const where: Prisma.AccountingPartyWhereInput = {}
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' }
    if (q.type) where.type = q.type
    if (q.active !== undefined) where.isActive = V.bool(q.active) ?? false
    return this.prisma.accountingParty.findMany({ where, orderBy: { name: 'asc' } })
  }

  private readParty(b: Record<string, any>) {
    return {
      name:      V.str(b.name, 'Name', { required: true, max: 255 })!,
      type:      V.oneOf(b.type, 'Type', PARTY_TYPES, { required: true })!,
      email:     V.email(b.email, 'Email') ?? null,
      phone:     V.str(b.phone, 'Phone', { max: 50 }) ?? null,
      address:   V.str(b.address, 'Address') ?? null,
      taxNumber: V.str(b.taxNumber, 'Tax number', { max: 50 }) ?? null,
    }
  }

  partiesStore(b: Record<string, any>) {
    return this.prisma.accountingParty.create({ data: this.readParty(b) })
  }

  async partiesUpdate(id: string, b: Record<string, any>) {
    if (!(await this.prisma.accountingParty.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Party not found.')
    return this.prisma.accountingParty.update({ where: { id }, data: { ...this.readParty(b), isActive: V.bool(b.isActive) ?? true } })
  }

  // ══ Exchange rates ══════════════════════════════════════════════════════════

  ratesIndex() {
    return this.prisma.exchangeRate.findMany({ orderBy: [{ rateDate: 'desc' }, { currency: 'asc' }] })
  }

  async ratesStore(b: Record<string, any>) {
    const currency = V.str(b.currency, 'Currency', { required: true, max: 10 })!.toUpperCase()
    const rate     = V.num(b.rate, 'Rate', { required: true, min: 0.000001 })!
    const rateDate = dateOnly(V.date(b.rateDate, 'Rate date', { required: true })!)
    await this.prisma.exchangeRate.upsert({
      where:  { currency_rateDate: { currency, rateDate } },
      update: { rate },
      create: { currency, rate, rateDate },
    })
    return { message: 'Rate saved.' }
  }

  async rateForDate(currency = 'USD', date?: string) {
    const d = V.date(date, 'Date') ?? todayIn(PKT_TZ)
    const row = await this.prisma.exchangeRate.findFirst({
      where: { currency, rateDate: { lte: dateOnly(d) } },
      orderBy: { rateDate: 'desc' },
    })
    return { rate: row ? Number(row.rate) : 1 }
  }

  // ══ Vouchers ════════════════════════════════════════════════════════════════

  async vouchersIndex(q: Record<string, string | undefined>) {
    const where: Prisma.VoucherWhereInput = {}
    if (q.type)    where.voucherType = q.type
    if (q.status)  where.status = q.status
    if (q.partyId) where.partyId = q.partyId
    const from = V.date(q.from, 'From'), to = V.date(q.to, 'To')
    if (from || to) where.date = { ...(from ? { gte: dateOnly(from) } : {}), ...(to ? { lte: dateOnly(to) } : {}) }
    const perPage = Math.min(10_000, Math.max(1, parseInt(q.perPage ?? '50', 10) || 50))
    const { skip, take, page } = pageArgs(q.page, perPage)
    const [data, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: {
          party: true, paymentAccount: true,
          createdBy: { select: { id: true, displayName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip, take,
      }),
      this.prisma.voucher.count({ where }),
    ])
    return toPage(data, total, page, perPage)
  }

  async vouchersShow(id: string) {
    const v = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        lines: { include: { account: true, party: true }, orderBy: { createdAt: 'asc' } },
        party: true, paymentAccount: true, linkedVoucher: true,
        createdBy: { select: { id: true, displayName: true } },
      },
    })
    if (!v) throw new NotFoundException('Voucher not found.')
    return v
  }

  private async nextNumber(tx: Tx, type: string, year: number) {
    const seq = await tx.voucherSequence.upsert({
      where:  { voucherType_fiscalYear: { voucherType: type, fiscalYear: year } },
      update: { lastNumber: { increment: 1 } },
      create: { voucherType: type, fiscalYear: year, lastNumber: 1 },
    })
    const num = seq.lastNumber
    if (type === 'JV') return `JV${String(num).padStart(5, '0')}`
    return `${type}-${year}-${String(num).padStart(4, '0')}`
  }

  private detectType(account: { level3: string }, isReceipt: boolean) {
    const isCash = account.level3.toLowerCase().includes('cash')
    return isReceipt ? (isCash ? 'CRV' : 'BRV') : (isCash ? 'CPV' : 'BPV')
  }

  async vouchersStore(actorId: string, b: Record<string, any>) {
    const form     = V.oneOf(b.formType, 'Form type', FORM_TYPES, { required: true })!
    const date     = V.date(b.date, 'Date', { required: true })!
    const currency = V.oneOf(b.currency, 'Currency', CURRENCIES, { required: true })!
    const exchangeRate = V.num(b.exchangeRate, 'Exchange rate', { min: 0 }) ?? 1
    const memo     = V.str(b.memo, 'Memo') ?? null
    const partyId  = V.str(b.partyId, 'Party') ?? null
    const paymentAccountId = V.str(b.paymentAccountId, 'Payment account', { required: NEEDS_PAYMENT_ACCOUNT.includes(form) }) ?? null
    const paymentMethod    = V.str(b.paymentMethod, 'Payment method') ?? null
    const referenceNumber  = V.str(b.referenceNumber, 'Reference number', { max: 100 }) ?? null
    const journal = form === 'journal'

    if (!Array.isArray(b.lines) || b.lines.length === 0) fail('At least one line is required.')
    const lines = (b.lines as Record<string, any>[])
      .map((l, i) => ({
        accountId:    V.str(l.accountId, `Line ${i + 1} account`) ?? null,
        amount:       journal ? 0 : V.num(l.amount, `Line ${i + 1} amount`, { required: true, min: 0.01 })!,
        debit:        journal ? V.num(l.debit, `Line ${i + 1} debit`, { min: 0 }) ?? 0 : 0,
        credit:       journal ? V.num(l.credit, `Line ${i + 1} credit`, { min: 0 }) ?? 0 : 0,
        description:  V.str(l.description, `Line ${i + 1} description`) ?? null,
        partyId:      V.str(l.partyId, `Line ${i + 1} party`) ?? null,
        isBillable:   V.bool(l.isBillable) ?? false,
        project:      V.str(l.project, `Line ${i + 1} project`, { max: 100 }) ?? null,
        costCentreId: V.str(l.costCentreId, `Line ${i + 1} cost centre`) ?? null,
        projectId:    V.str(l.projectId, `Line ${i + 1} project`) ?? null,
        locationId:   V.str(l.locationId, `Line ${i + 1} location`) ?? null,
      }))
      .filter(l => l.accountId || l.amount || l.debit || l.credit)
    if (!lines.length) fail('At least one line is required.')
    if (lines.some(l => !l.accountId)) fail('Every line needs an account.')

    const accountIds = [...new Set([...lines.map(l => l.accountId!), ...(paymentAccountId ? [paymentAccountId] : [])])]
    const found = await this.prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true } })
    if (found.length !== accountIds.length) fail('One or more selected accounts are invalid.')
    const partyIds = [...new Set([partyId, ...lines.map(l => l.partyId)].filter((x): x is string => !!x))]
    if (partyIds.length && (await this.prisma.accountingParty.count({ where: { id: { in: partyIds } } })) !== partyIds.length) {
      fail('One or more selected parties are invalid.')
    }

    const year = parseYmd(date).y
    const common = { currency, exchangeRate }
    const lineDims = (l: (typeof lines)[number]) => ({
      description: l.description, partyId: l.partyId, isBillable: l.isBillable,
      project: l.project, costCentreId: l.costCentreId, projectId: l.projectId, locationId: l.locationId,
    })

    if (journal) {
      const totalDebit  = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      if (Math.abs(totalDebit - totalCredit) > 0.01) fail('Total Debits must equal Total Credits.')
      if (totalDebit === 0) fail('At least one debit and one credit line required.')

      return this.prisma.$transaction(async tx => {
        const voucher = await tx.voucher.create({
          data: {
            voucherNumber: await this.nextNumber(tx, 'JV', year), voucherType: 'JV',
            date: dateOnly(date), memo, ...common, referenceNumber,
            isAdjusting: V.bool(b.isAdjusting) ?? false, status: 'posted', createdById: actorId,
            lines: { create: lines.map(l => ({ accountId: l.accountId!, debitPkr: l.debit, creditPkr: l.credit, ...common, ...lineDims(l) })) },
          },
          include: { lines: { include: { account: true } } },
        })
        return voucher
      })
    }

    const paymentAccount = paymentAccountId ? await this.account(paymentAccountId) : null
    const total = lines.reduce((s, l) => s + l.amount, 0)
    const isReceipt = form === 'sales_receipt' || form === 'bank_deposit'

    let arAccountId: string | null = null
    let apAccountId: string | null = null
    if (form === 'invoice') {
      arAccountId = (await this.prisma.account.findFirst({ where: { level3: 'Accounts Receivable', isPosting: true }, select: { id: true } }))?.id ?? null
      if (!arAccountId) fail('Accounts Receivable account not found in CoA.')
    }
    if (form === 'bill') {
      apAccountId = (await this.prisma.account.findFirst({ where: { level3: 'Accounts Payable', isPosting: true }, select: { id: true } }))?.id ?? null
      if (!apAccountId) fail('Accounts Payable account not found in CoA.')
    }

    const cashBackAmount = V.num(b.cashBackAmount, 'Cash back amount', { min: 0 }) ?? 0
    const cashBackAccountId = V.str(b.cashBackAccountId, 'Cash back account') ?? null
    if (cashBackAmount > 0 && cashBackAccountId && !(await this.prisma.account.findUnique({ where: { id: cashBackAccountId }, select: { id: true } }))) {
      fail('The selected cash back account is invalid.')
    }
    if (cashBackAmount >= total && isReceipt && cashBackAmount > 0) fail('Cash back cannot be equal to or greater than the total.')

    return this.prisma.$transaction(async tx => {
      const voucherType =
        form === 'invoice' ? 'INV' :
        form === 'bill'    ? 'BILL' :
        form === 'cheque'  ? 'CHQ' : this.detectType(paymentAccount!, isReceipt)
      const voucherNumber = await this.nextNumber(tx, voucherType, year)

      type LineIn = Omit<Prisma.VoucherLineCreateManyVoucherInput, 'currency' | 'exchangeRate'>
      const out: LineIn[] = []
      if (isReceipt) {
        out.push({ accountId: paymentAccount!.id, debitPkr: total - (cashBackAccountId ? cashBackAmount : 0), creditPkr: 0, description: `Deposit to ${paymentAccount!.accountName}` })
        if (cashBackAmount > 0 && cashBackAccountId) out.push({ accountId: cashBackAccountId, debitPkr: cashBackAmount, creditPkr: 0, description: 'Cash back' })
        for (const l of lines) out.push({ accountId: l.accountId!, debitPkr: 0, creditPkr: l.amount, ...lineDims(l) })
      } else if (form === 'invoice') {
        out.push({ accountId: arAccountId!, debitPkr: total, creditPkr: 0, description: `Invoice ${voucherNumber}`, partyId })
        for (const l of lines) out.push({ accountId: l.accountId!, debitPkr: 0, creditPkr: l.amount, ...lineDims(l), partyId: l.partyId })
      } else if (form === 'bill') {
        for (const l of lines) out.push({ accountId: l.accountId!, debitPkr: l.amount, creditPkr: 0, ...lineDims(l) })
        out.push({ accountId: apAccountId!, debitPkr: 0, creditPkr: total, description: 'Bill payable', partyId })
      } else {
        for (const l of lines) out.push({ accountId: l.accountId!, debitPkr: l.amount, creditPkr: 0, ...lineDims(l) })
        out.push({ accountId: paymentAccount!.id, debitPkr: 0, creditPkr: total, description: `Payment from ${paymentAccount!.accountName}` })
      }

      return tx.voucher.create({
        data: {
          voucherNumber, voucherType, date: dateOnly(date), partyId,
          paymentAccountId: paymentAccount?.id ?? null, paymentMethod, referenceNumber,
          ...common, memo, status: 'posted', createdById: actorId,
          lines: { createMany: { data: out.map(l => ({ ...l, ...common })) } },
        },
        include: { lines: { include: { account: true } } },
      })
    })
  }

  async vouchersReverse(actorId: string, id: string) {
    const v = await this.prisma.voucher.findUnique({ where: { id }, include: { lines: true } })
    if (!v) throw new NotFoundException('Voucher not found.')
    if (v.status !== 'posted') fail('Only posted vouchers can be reversed.')
    const today = todayIn(PKT_TZ)
    return this.prisma.$transaction(async tx => {
      const reversal = await tx.voucher.create({
        data: {
          voucherNumber: await this.nextNumber(tx, 'JV', parseYmd(today).y), voucherType: 'JV',
          date: dateOnly(today), memo: `Reversal of ${v.voucherNumber}`,
          currency: v.currency, exchangeRate: v.exchangeRate, status: 'posted',
          reversalOfId: v.id, isAdjusting: true, createdById: actorId,
          lines: {
            create: v.lines.map(l => ({
              accountId: l.accountId, debitPkr: l.creditPkr, creditPkr: l.debitPkr,
              description: `Reversal: ${l.description ?? ''}`.trim(), partyId: l.partyId,
              currency: l.currency, exchangeRate: l.exchangeRate,
              costCentreId: l.costCentreId, projectId: l.projectId, locationId: l.locationId,
            })),
          },
        },
        include: { lines: true },
      })
      await tx.voucher.update({ where: { id: v.id }, data: { status: 'reversed' } })
      return reversal
    })
  }

  // ══ General ledger ══════════════════════════════════════════════════════════

  async generalLedger(q: Record<string, string | undefined>) {
    const accountId = q.accountId || undefined
    const from = V.date(q.from, 'From') ?? undefined
    const to   = V.date(q.to, 'To') ?? undefined
    const perPage = Math.min(10_000, Math.max(1, parseInt(q.perPage ?? '100', 10) || 100))
    const { skip, take, page } = pageArgs(q.page, perPage)

    let opening = 0
    if (accountId && from) {
      const acc = await this.prisma.account.findUnique({ where: { id: accountId } })
      const t = (await this.lineTotals({ accountId, voucher: { date: { lt: dateOnly(from) } } })).get(accountId) ?? { d: 0, c: 0 }
      opening = acc?.normalBalance === 'debit' ? t.d - t.c : t.c - t.d
    }

    const where: Prisma.VoucherLineWhereInput = {
      ...(accountId ? { accountId } : {}),
      voucher: {
        ...POSTED,
        ...(q.voucherType ? { voucherType: q.voucherType } : {}),
        ...(from || to ? { date: { ...(from ? { gte: dateOnly(from) } : {}), ...(to ? { lte: dateOnly(to) } : {}) } } : {}),
      },
    }
    const orderBy: Prisma.VoucherLineOrderByWithRelationInput[] = [
      { voucher: { date: 'asc' } }, { voucher: { createdAt: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' },
    ]
    const [rows, total, prior] = await Promise.all([
      this.prisma.voucherLine.findMany({
        where, orderBy, skip, take,
        include: {
          voucher: { include: { paymentAccount: { select: { accountName: true } } } },
          account: true, party: { select: { name: true } },
        },
      }),
      this.prisma.voucherLine.count({ where }),
      skip > 0
        ? this.prisma.voucherLine.findMany({ where, orderBy, take: skip, select: { debitPkr: true, creditPkr: true, account: { select: { normalBalance: true } } } })
        : Promise.resolve([]),
    ])

    let running = opening
    const step = (nb: string, d: number, c: number) => (nb === 'debit' ? d - c : c - d)
    for (const p of prior) running += step(p.account.normalBalance, n(p.debitPkr), n(p.creditPkr))

    const data = rows.map(l => {
      running += step(l.account.normalBalance, n(l.debitPkr), n(l.creditPkr))
      return {
        id: l.id, date: fmtDateOnly(l.voucher.date), voucherType: l.voucher.voucherType, voucherNumber: l.voucher.voucherNumber,
        referenceNumber: l.voucher.referenceNumber, voucherMemo: l.voucher.memo,
        accountCode: l.account.accountCode, accountName: l.account.accountName, normalBalance: l.account.normalBalance,
        partyName: l.party?.name ?? null, debitPkr: n(l.debitPkr), creditPkr: n(l.creditPkr),
        description: l.description, isBillable: l.isBillable, project: l.project,
        paymentAccount: l.voucher.paymentAccount?.accountName ?? null, runningBalance: r2(running),
      }
    })
    return { openingBalance: r2(opening), data, meta: { currentPage: page, lastPage: Math.max(1, Math.ceil(total / perPage)), total } }
  }

  // ══ Trial balance ═══════════════════════════════════════════════════════════

  async trialBalance(q: Record<string, string | undefined>) {
    const asOf = V.date(q.asOf, 'As of') ?? todayIn(PKT_TZ)
    const pivot = V.date(q.from, 'From') ?? asOf
    const hideZero = V.bool(q.hideZero) ?? false

    const [ob, act, accounts] = await Promise.all([
      this.lineTotals({ voucher: { date: { lt: dateOnly(pivot), lte: dateOnly(asOf) } } }),
      this.lineTotals({ voucher: { date: { gte: dateOnly(pivot), lte: dateOnly(asOf) } } }),
      this.prisma.account.findMany({ orderBy: { accountCode: 'asc' } }),
    ])

    const rows = []
    for (const a of accounts) {
      const o = ob.get(a.id), t = act.get(a.id)
      if (!o && !t && hideZero) continue
      const obD = o?.d ?? 0, obC = o?.c ?? 0, actD = t?.d ?? 0, actC = t?.c ?? 0
      const clD = obD + actD, clC = obC + actC
      if (hideZero && Math.abs(clD - clC) < 0.01 && clD === 0) continue
      rows.push({
        accountId: a.id, accountCode: a.accountCode, accountName: a.accountName,
        level1: a.level1, level2: a.level2, level3: a.level3, level4: a.level4, normalBalance: a.normalBalance,
        obDebit: r2(obD), obCredit: r2(obC), actDebit: r2(actD), actCredit: r2(actC), clDebit: r2(clD), clCredit: r2(clC),
      })
    }
    const totalClDebit  = rows.reduce((s, r) => s + r.clDebit, 0)
    const totalClCredit = rows.reduce((s, r) => s + r.clCredit, 0)
    return { rows, balanced: Math.abs(totalClDebit - totalClCredit) < 0.01, totalClDebit: r2(totalClDebit), totalClCredit: r2(totalClCredit) }
  }

  // ══ Reports ═════════════════════════════════════════════════════════════════

  private yearStart() { return `${parseYmd(todayIn(PKT_TZ)).y}-01-01` }

  private async pnlData(from: string, to: string) {
    const totals = await this.lineTotals({ voucher: { date: { gte: dateOnly(from), lte: dateOnly(to) } }, account: { accountType: { in: ['revenue', 'expense'] } } })
    const accounts = await this.prisma.account.findMany({ where: { id: { in: [...totals.keys()] } } })
    const rows = accounts
      .map(a => ({
        id: a.id, accountName: a.accountName, level1: a.level1, level2: a.level2, level3: a.level3, normalBalance: a.normalBalance,
        totalDebit: r2(totals.get(a.id)!.d), totalCredit: r2(totals.get(a.id)!.c),
      }))
      .sort((a, b) => a.level2.localeCompare(b.level2) || a.accountName.localeCompare(b.accountName))
    const net = (items: typeof rows) => items.reduce((s, r) => s + (r.normalBalance === 'credit' ? r.totalCredit - r.totalDebit : r.totalDebit - r.totalCredit), 0)
    const revenue  = rows.filter(r => r.level1 === 'Revenue')
    const expenses = rows.filter(r => r.level1 === 'Expenses')
    const totalRevenue = net(revenue), totalExpense = net(expenses)
    return { from, to, revenue, expenses, totalRevenue: r2(totalRevenue), totalExpense: r2(totalExpense), netProfit: r2(totalRevenue - totalExpense) }
  }

  async profitAndLoss(q: Record<string, string | undefined>) {
    const from = V.date(q.from, 'From') ?? this.yearStart()
    const to   = V.date(q.to, 'To') ?? todayIn(PKT_TZ)
    const cmpFrom = V.date(q.cmpFrom, 'Compare from'), cmpTo = V.date(q.cmpTo, 'Compare to')
    return { current: await this.pnlData(from, to), compare: cmpFrom && cmpTo ? await this.pnlData(cmpFrom, cmpTo) : null }
  }

  async balanceSheet(q: Record<string, string | undefined>) {
    const asOf = V.date(q.asOf, 'As of') ?? todayIn(PKT_TZ)
    const totals = await this.lineTotals({ voucher: { date: { lte: dateOnly(asOf) } } })
    const accounts = await this.prisma.account.findMany({ where: { id: { in: [...totals.keys()] } }, orderBy: { accountCode: 'asc' } })
    const rows = accounts.map(a => {
      const t = totals.get(a.id)!
      return {
        id: a.id, accountCode: a.accountCode, accountName: a.accountName, level1: a.level1, level2: a.level2, level3: a.level3, level4: a.level4,
        normalBalance: a.normalBalance, accountType: a.accountType, totalDebit: r2(t.d), totalCredit: r2(t.c),
        balance: r2(a.normalBalance === 'debit' ? t.d - t.c : t.c - t.d),
      }
    })
    const assets      = rows.filter(r => r.level1 === 'Assets')
    const liabilities = rows.filter(r => r.level1 === 'Liabilities')
    const equity      = rows.filter(r => r.level1 === 'Equity')
    // Revenue and expenses are never closed to retained earnings, so their net is carried into equity here.
    const earnings = rows.filter(r => r.accountType === 'revenue' || r.accountType === 'expense')
      .reduce((s, r) => s + (r.accountType === 'revenue' ? r.balance : -r.balance), 0)
    if (Math.abs(earnings) >= 0.01) {
      equity.push({
        id: 'unclosed-earnings', accountCode: '', accountName: 'Current Earnings (not yet closed)',
        level1: 'Equity', level2: 'Share Capital', level3: 'Retained Earnings', level4: null,
        normalBalance: 'credit', accountType: 'equity', totalDebit: 0, totalCredit: 0, balance: r2(earnings),
      })
    }
    const sum = (x: typeof rows) => r2(x.reduce((s, r) => s + r.balance, 0))
    const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity)
    return {
      asOf, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    }
  }

  /** Receipts against Accounts Receivable are applied to each party's invoices oldest first. */
  async arAgeing(q: Record<string, string | undefined>) {
    const asOf = V.date(q.asOf, 'As of') ?? todayIn(PKT_TZ)
    const invoices = await this.prisma.voucher.findMany({
      where: { voucherType: 'INV', ...OPEN_ONLY, date: { lte: dateOnly(asOf) } },
      include: { party: true, lines: { select: { creditPkr: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })
    const partyIds = [...new Set(invoices.map(i => i.partyId).filter((x): x is string => !!x))]
    const payments = partyIds.length
      ? await this.prisma.voucherLine.groupBy({
          by: ['voucherId'],
          where: { creditPkr: { gt: 0 }, account: { level3: 'Accounts Receivable' }, voucher: { ...POSTED, partyId: { in: partyIds }, date: { lte: dateOnly(asOf) } } },
          _sum: { creditPkr: true },
        })
      : []
    const payVouchers = payments.length
      ? await this.prisma.voucher.findMany({ where: { id: { in: payments.map(p => p.voucherId) } }, select: { id: true, partyId: true } })
      : []
    const remaining = new Map<string, number>()
    for (const p of payments) {
      const party = payVouchers.find(v => v.id === p.voucherId)?.partyId
      if (party) remaining.set(party, (remaining.get(party) ?? 0) + n(p._sum.creditPkr))
    }

    const rows = invoices.map(inv => {
      const total = inv.lines.reduce((s, l) => s + n(l.creditPkr), 0)
      let paid = 0
      if (inv.partyId) {
        const avail = remaining.get(inv.partyId) ?? 0
        paid = Math.min(avail, total)
        remaining.set(inv.partyId, avail - paid)
      }
      const outstanding = Math.max(0, total - paid)
      const days = diffDays(fmtDateOnly(inv.date)!, asOf)
      return {
        voucherNumber: inv.voucherNumber, party: inv.party?.name ?? null, date: fmtDateOnly(inv.date),
        total: r2(total), outstanding: r2(outstanding), daysOverdue: days,
        bucket: days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '91+',
      }
    }).filter(r => r.outstanding > 0)
    return { asOf, rows }
  }

  async cashFlow(q: Record<string, string | undefined>) {
    const from = V.date(q.from, 'From') ?? this.yearStart()
    const to   = V.date(q.to, 'To') ?? todayIn(PKT_TZ)
    const period: Prisma.VoucherWhereInput = { ...POSTED, date: { gte: dateOnly(from), lte: dateOnly(to) } }
    const [pnl, dep, ar, ap] = await Promise.all([
      this.pnlData(from, to),
      this.prisma.voucherLine.aggregate({
        where: { voucher: period, account: { OR: [{ level3: { in: ['Depreciation', 'Amortization'] } }, { level2: 'Depreciation and Amortization' }] } },
        _sum: { debitPkr: true },
      }),
      this.prisma.voucherLine.aggregate({ where: { voucher: period, account: { level3: 'Accounts Receivable' } }, _sum: { debitPkr: true, creditPkr: true } }),
      this.prisma.voucherLine.aggregate({ where: { voucher: period, account: { level3: 'Accounts Payable' } }, _sum: { debitPkr: true, creditPkr: true } }),
    ])
    const depreciation = n(dep._sum.debitPkr)
    const arChange = n(ar._sum.debitPkr) - n(ar._sum.creditPkr)
    const apChange = n(ap._sum.creditPkr) - n(ap._sum.debitPkr)
    return {
      from, to,
      operating: {
        netProfit: pnl.netProfit, depreciation: r2(depreciation), arChange: r2(-arChange), apChange: r2(apChange),
        total: r2(pnl.netProfit + depreciation - arChange + apChange),
      },
    }
  }

  async budgetVsActuals(q: Record<string, string | undefined>) {
    const year  = V.int(q.year, 'Year') ?? parseYmd(todayIn(PKT_TZ)).y
    const month = V.int(q.month, 'Month', { min: 1, max: 12 }) ?? null
    const start = month ? ymd(year, month, 1) : `${year}-01-01`
    const end   = month ? ymd(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()) : `${year}-12-31`
    const [actuals, budgets, accounts] = await Promise.all([
      this.lineTotals({ voucher: { date: { gte: dateOnly(start), lte: dateOnly(end) } }, account: { accountType: { in: ['revenue', 'expense'] } } }),
      this.prisma.accountingBudget.groupBy({ by: ['accountId'], where: { fiscalYear: year, ...(month ? { month } : {}) }, _sum: { amount: true } }),
      this.prisma.account.findMany({ where: { accountType: { in: ['revenue', 'expense'] } }, orderBy: { accountCode: 'asc' } }),
    ])
    const budgetMap = new Map(budgets.map(b => [b.accountId, n(b._sum.amount)]))
    const rows = accounts.map(a => {
      const t = actuals.get(a.id)
      const actual = t ? (a.normalBalance === 'debit' ? t.d - t.c : t.c - t.d) : 0
      const budget = budgetMap.get(a.id) ?? 0
      return { accountId: a.id, accountCode: a.accountCode, accountName: a.accountName, level2: a.level2, actual: r2(actual), budget: r2(budget), variance: r2(budget - actual) }
    }).filter(r => r.actual !== 0 || r.budget !== 0)
    return { year, month, rows }
  }

  async budgetStore(b: Record<string, any>) {
    if (!Array.isArray(b.rows)) fail('Rows must be a list.')
    const rows = (b.rows as Record<string, any>[]).map(r => ({
      accountId:  V.str(r.accountId, 'Account', { required: true })!,
      fiscalYear: V.int(r.fiscalYear, 'Fiscal year', { required: true })!,
      month:      V.int(r.month, 'Month', { required: true, min: 1, max: 12 })!,
      amount:     V.num(r.amount, 'Amount', { required: true, min: 0 })!,
    }))
    const ids = [...new Set(rows.map(r => r.accountId))]
    if ((await this.prisma.account.count({ where: { id: { in: ids } } })) !== ids.length) fail('One or more accounts are invalid.')
    await this.prisma.$transaction(rows.map(r => this.prisma.accountingBudget.upsert({
      where:  { accountId_fiscalYear_month: { accountId: r.accountId, fiscalYear: r.fiscalYear, month: r.month } },
      update: { amount: r.amount },
      create: r,
    })))
    return { message: `${rows.length} budget rows saved.` }
  }
}
