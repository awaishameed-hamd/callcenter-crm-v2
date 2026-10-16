import { PrismaClient, Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type Field = {
  fieldKey: string; label: string; section: string; fieldType: string; placeholder?: string | null
  colSpan?: string; textareaRows?: number; isRequired?: boolean; isCore?: boolean; options?: string[] | null; sortOrder: number
}

const CANCEL_REASONS = ['XFER', 'No LA', 'Ringing', 'Over Age', 'Out of State', 'Hangup', 'No medicare card']

const SALE_FIELDS: Field[] = [
  { fieldKey: 'vertical_type',    label: 'Vertical Type',          section: 'Vertical & DID',         fieldType: 'select',   colSpan: 'half',  isRequired: true,  isCore: true, options: ['Medicare', 'Final Expense', 'ACA', 'Other'], sortOrder: 1 },
  { fieldKey: 'client_id',        label: 'Select DID',             section: 'Vertical & DID',         fieldType: 'select',   colSpan: 'half',  isRequired: true,  isCore: true, sortOrder: 2 },
  { fieldKey: 'first_name',       label: 'First Name',             section: 'Personal Information',   fieldType: 'text',     placeholder: 'First name',  isRequired: true, isCore: true, sortOrder: 3 },
  { fieldKey: 'mid_name',         label: 'Middle Name',            section: 'Personal Information',   fieldType: 'text',     placeholder: 'Middle name', sortOrder: 4 },
  { fieldKey: 'last_name',        label: 'Last Name',              section: 'Personal Information',   fieldType: 'text',     placeholder: 'Last name',   isRequired: true, sortOrder: 5 },
  { fieldKey: 'age',              label: 'Age',                    section: 'Personal Information',   fieldType: 'number',   placeholder: 'Age',         isRequired: true, sortOrder: 6 },
  { fieldKey: 'date_of_birth',    label: 'Date of Birth',          section: 'Personal Information',   fieldType: 'date',     sortOrder: 7 },
  { fieldKey: 'phone',            label: 'Phone',                  section: 'Personal Information',   fieldType: 'text',     placeholder: 'Phone number', isRequired: true, sortOrder: 8 },
  { fieldKey: 'address',          label: 'Address',                section: 'Address Information',    fieldType: 'text',     placeholder: 'Full street address', colSpan: 'full', isCore: true, sortOrder: 9 },
  { fieldKey: 'city',             label: 'City',                   section: 'Address Information',    fieldType: 'text',     placeholder: 'City',  sortOrder: 10 },
  { fieldKey: 'state',            label: 'State',                  section: 'Address Information',    fieldType: 'text',     placeholder: 'State', isRequired: true, sortOrder: 11 },
  { fieldKey: 'postal_code',      label: 'Postal Code',            section: 'Address Information',    fieldType: 'text',     placeholder: 'ZIP',   isRequired: true, sortOrder: 12 },
  { fieldKey: 'transferred_from', label: 'Transferred From',       section: 'Additional Information', fieldType: 'select',   colSpan: 'half', isRequired: true, isCore: true, options: ['Bots', 'Fronter'], sortOrder: 13 },
  { fieldKey: 'did_comments',     label: 'Comments',               section: 'Additional Information', fieldType: 'textarea', placeholder: 'Enter comments here...', colSpan: 'full', textareaRows: 4, sortOrder: 14 },
  { fieldKey: 'reason',           label: 'Reason of Cancellation', section: 'Additional Information', fieldType: 'select',   colSpan: 'half', isCore: true, options: CANCEL_REASONS, sortOrder: 15 },
]

const CLIENT_FIELDS: Field[] = [
  { fieldKey: 'company_name',             label: 'Company Name',                section: 'Company Details', fieldType: 'text',       placeholder: 'e.g. Acme Insurance Co.', colSpan: 'half', isRequired: true, isCore: true, sortOrder: 1 },
  { fieldKey: 'campaign',                 label: 'Campaign',                    section: 'Company Details', fieldType: 'select',     colSpan: 'half', isRequired: true, isCore: true, options: ['Medicare', 'Final Expense', 'ACA'], sortOrder: 2 },
  { fieldKey: 'did_code',                 label: 'Assign DID',                  section: 'DID & Sale Type', fieldType: 'select',     colSpan: 'half', isCore: true, sortOrder: 10 },
  { fieldKey: 'sale_type',                label: 'Sale Type',                   section: 'DID & Sale Type', fieldType: 'select',     colSpan: 'half', isRequired: true, isCore: true, options: ['CPA', 'CPL'], sortOrder: 11 },
  { fieldKey: 'rate_type',                label: 'Rate Type',                   section: 'Rate',            fieldType: 'select',     colSpan: 'half', isRequired: true, isCore: true, options: ['fixed', 'variable'], sortOrder: 20 },
  { fieldKey: 'rate_of_sale_amount',      label: 'Rate Per Sale (USD)',         section: 'Rate',            fieldType: 'amount_usd', placeholder: '0.00', colSpan: 'half', isCore: true, sortOrder: 21 },
  { fieldKey: 'opening_balance',          label: 'Opening Balance (USD)',       section: 'Rate',            fieldType: 'amount_usd', placeholder: '0.00', colSpan: 'half', isCore: true, sortOrder: 22 },
  { fieldKey: 'cycle_of_day',             label: 'Cycle (Days)',                section: 'Billing',         fieldType: 'number',     placeholder: 'e.g. 30', colSpan: 'half', isRequired: true, isCore: true, sortOrder: 30 },
  { fieldKey: 'billing_start_after_days', label: 'Billing Starts After (Days)', section: 'Billing',         fieldType: 'number',     placeholder: 'e.g. 0', colSpan: 'half', isRequired: true, isCore: true, sortOrder: 31 },
  { fieldKey: 'notes',                    label: 'Notes',                       section: 'Notes',           fieldType: 'textarea',   placeholder: 'Optional notes', colSpan: 'full', sortOrder: 40 },
]

const USER_FIELDS: Field[] = [
  { fieldKey: 'first_name',            label: 'First Name',            section: 'Personal Information', fieldType: 'text',       placeholder: 'First',  colSpan: 'third', isRequired: true, isCore: true, sortOrder: 1 },
  { fieldKey: 'mid_name',              label: 'Middle Name',           section: 'Personal Information', fieldType: 'text',       placeholder: 'Middle', colSpan: 'third', sortOrder: 2 },
  { fieldKey: 'last_name',             label: 'Last Name',             section: 'Personal Information', fieldType: 'text',       placeholder: 'Last',   colSpan: 'third', isRequired: true, sortOrder: 3 },
  { fieldKey: 'email',                 label: 'Email',                 section: 'Personal Information', fieldType: 'text',       placeholder: 'email@example.com', colSpan: 'half', sortOrder: 4 },
  { fieldKey: 'phone',                 label: 'Phone',                 section: 'Personal Information', fieldType: 'text',       placeholder: '+92 300 0000000', colSpan: 'half', sortOrder: 5 },
  { fieldKey: 'date_of_birth',         label: 'Date of Birth',         section: 'Personal Information', fieldType: 'date',       colSpan: 'third', sortOrder: 6 },
  { fieldKey: 'date_of_joining',       label: 'Date of Joining',       section: 'Personal Information', fieldType: 'date',       colSpan: 'third', isRequired: true, isCore: true, sortOrder: 7 },
  { fieldKey: 'department',            label: 'Department',            section: 'Personal Information', fieldType: 'select',     colSpan: 'third', options: ['Medicare', 'Final Expense', 'ACA', 'Management'], sortOrder: 8 },
  { fieldKey: 'experience',            label: 'Experience',            section: 'Personal Information', fieldType: 'text',       placeholder: 'e.g. 3 years in sales', colSpan: 'full', sortOrder: 9 },
  { fieldKey: 'cnic',                  label: 'CNIC Number',           section: 'CNIC & Address',       fieldType: 'text',       placeholder: '00000-0000000-0', colSpan: 'half', sortOrder: 10 },
  { fieldKey: 'permanent_address',     label: 'Permanent Address',     section: 'CNIC & Address',       fieldType: 'textarea',   placeholder: 'Address on CNIC', colSpan: 'full', textareaRows: 2, sortOrder: 11 },
  { fieldKey: 'current_address',       label: 'Current Address',       section: 'CNIC & Address',       fieldType: 'textarea',   placeholder: 'Current residential address', colSpan: 'full', textareaRows: 2, sortOrder: 12 },
  { fieldKey: 'basic_salary',          label: 'Basic Salary',          section: 'Salary (PKR)',         fieldType: 'amount_pkr', placeholder: '0.00', colSpan: 'half', isCore: true, sortOrder: 20 },
  { fieldKey: 'punctuality_allowance', label: 'Punctuality Allowance', section: 'Salary (PKR)',         fieldType: 'amount_pkr', placeholder: '0.00', colSpan: 'half', sortOrder: 21 },
  { fieldKey: 'travelling_allowance',  label: 'Travelling Allowance',  section: 'Salary (PKR)',         fieldType: 'amount_pkr', placeholder: '0.00', colSpan: 'half', sortOrder: 22 },
  { fieldKey: 'other_allowance',       label: 'Other Allowance',       section: 'Salary (PKR)',         fieldType: 'amount_pkr', placeholder: '0.00', colSpan: 'half', sortOrder: 23 },
  { fieldKey: 'bank',                  label: 'Bank',                  section: 'Banking Details',      fieldType: 'text',       placeholder: 'Bank name', colSpan: 'half', sortOrder: 30 },
  { fieldKey: 'account_title',         label: 'Account Title',         section: 'Banking Details',      fieldType: 'text',       placeholder: 'Account holder name', colSpan: 'half', sortOrder: 31 },
  { fieldKey: 'bank_account_no',       label: 'Account No.',           section: 'Banking Details',      fieldType: 'text',       placeholder: 'Account number', colSpan: 'half', sortOrder: 32 },
  { fieldKey: 'iban_no',               label: 'IBAN No.',              section: 'Banking Details',      fieldType: 'text',       placeholder: 'IBAN number', colSpan: 'half', sortOrder: 33 },
]

async function seedFormFields() {
  const rows = ([['sale', SALE_FIELDS], ['client', CLIENT_FIELDS], ['user', USER_FIELDS]] as const).flatMap(([formType, fields]) =>
    fields.map(f => ({
      formType, fieldKey: f.fieldKey, label: f.label, section: f.section, fieldType: f.fieldType,
      placeholder: f.placeholder ?? null, colSpan: f.colSpan ?? 'third', textareaRows: f.textareaRows ?? 3,
      isVisible: true, isRequired: f.isRequired ?? false, isCore: f.isCore ?? false,
      options: f.options ?? Prisma.DbNull, sortOrder: f.sortOrder,
    })),
  )
  const { count } = await prisma.formFieldSetting.createMany({ data: rows, skipDuplicates: true })
  console.log(`form fields: ${count} created`)
}

async function seedCoaClasses() {
  if (await prisma.coaClass.count()) return console.log('coa classes: already present')
  const add = async (level: number, name: string, parentId: string | null, codeDigit: number, accountType: string | null = null) =>
    (await prisma.coaClass.create({ data: { level, name, parentId, codeDigit, accountType, isActive: true } })).id

  const l2: [string, string, number][] = [
    ['Non-Current Assets', 'asset', 1], ['Current Assets', 'asset', 2],
    ['Share Capital', 'equity', 3], ['Reserves', 'equity', 3],
    ['Non-Current Liabilities', 'liability', 4], ['Current Liabilities', 'liability', 5],
    ['Operating Revenue', 'revenue', 6], ['Other Income', 'revenue', 6],
    ['Cost of Revenue', 'expense', 7], ['Administrative Expenses', 'expense', 9],
    ['Operating Expenses', 'expense', 7], ['Finance Costs', 'expense', 8], ['Taxation', 'expense', 7],
  ]
  const l2Ids: Record<string, string> = {}
  for (const [name, type, digit] of l2) l2Ids[name] = await add(2, name, null, digit, type)

  const l3: [string, string, number][] = [
    ['Property, Plant & Equipment', 'Non-Current Assets', 1], ['Intangible Assets', 'Non-Current Assets', 2],
    ['Investment Properties', 'Non-Current Assets', 3], ['Capital Work in Progress', 'Non-Current Assets', 4],
    ['Right of Use Assets', 'Non-Current Assets', 5], ['Long-term Investments', 'Non-Current Assets', 6],
    ['Other Non-Current Assets', 'Non-Current Assets', 7],
    ['Cash and Cash Equivalents', 'Current Assets', 1], ['Bank Accounts', 'Current Assets', 2],
    ['Accounts Receivable', 'Current Assets', 3], ['Prepaid Expenses', 'Current Assets', 4],
    ['Inventory', 'Current Assets', 5], ['Other Current Assets', 'Current Assets', 6],
    ['Paid-up Capital', 'Share Capital', 1], ['Retained Earnings', 'Share Capital', 2],
    ['General Reserve', 'Reserves', 1], ['Revaluation Reserve', 'Reserves', 2],
    ['Long-term Loans', 'Non-Current Liabilities', 1], ['Lease Liability', 'Non-Current Liabilities', 2],
    ['Concession Assets', 'Non-Current Liabilities', 3], ['Other Non-Current Liabilities', 'Non-Current Liabilities', 4],
    ['Accounts Payable', 'Current Liabilities', 1], ['Accrued Liabilities', 'Current Liabilities', 2],
    ['Short-term Loans', 'Current Liabilities', 3], ['Tax Liabilities', 'Current Liabilities', 4],
    ['Other Current Liabilities', 'Current Liabilities', 5],
    ['Services Income', 'Operating Revenue', 1], ['Commission Income', 'Operating Revenue', 2], ['Other Revenue', 'Operating Revenue', 3],
    ['Interest Income', 'Other Income', 1], ['Exchange Gain/Loss', 'Other Income', 2], ['Other Income', 'Other Income', 3],
    ['Direct Costs', 'Cost of Revenue', 1],
    ['Salaries and Wages', 'Administrative Expenses', 1], ['Rent', 'Administrative Expenses', 2],
    ['Utilities', 'Administrative Expenses', 3], ['Communications', 'Administrative Expenses', 4],
    ['Other Administrative Expenses', 'Administrative Expenses', 5],
    ['Salaries and Wages', 'Operating Expenses', 1], ['Rent', 'Operating Expenses', 2],
    ['Utilities', 'Operating Expenses', 3], ['Communications', 'Operating Expenses', 4],
    ['Depreciation', 'Operating Expenses', 1], ['Amortization', 'Operating Expenses', 2],
    ['Other Operating Expenses', 'Operating Expenses', 5],
    ['Interest Expense', 'Finance Costs', 1], ['Bank Charges', 'Finance Costs', 2], ['Exchange Gain/Loss', 'Finance Costs', 3],
    ['Taxation', 'Taxation', 1],
  ]
  const l3Ids: Record<string, string> = {}
  for (const [name, parent, digit] of l3) l3Ids[`${name}|${parent}`] = await add(3, name, l2Ids[parent], digit)

  const l4: [string, string, number][] = [
    ['Cost', 'Property, Plant & Equipment', 1], ['Accumulated Depreciation', 'Property, Plant & Equipment', 2],
    ['Revaluation Surplus', 'Property, Plant & Equipment', 3], ['Impairment', 'Property, Plant & Equipment', 4],
    ['Cost', 'Intangible Assets', 1], ['Accumulated Amortization', 'Intangible Assets', 2],
    ['Cost', 'Investment Properties', 1], ['Accumulated Depreciation', 'Investment Properties', 2],
    ['Cost', 'Right of Use Assets', 1], ['Accumulated Depreciation', 'Right of Use Assets', 2],
  ]
  const l4Ids: Record<string, string> = {}
  for (const [name, parent, digit] of l4) l4Ids[`${name}|${parent}`] = await add(4, name, l3Ids[`${parent}|Non-Current Assets`], digit)

  const ppe: [string, number][] = [
    ['Land', 1], ['Building', 2], ['Computer & IT Equipment', 3], ['Motor Vehicles', 4], ['Furniture & Fixtures', 5],
    ['Office Equipment', 6], ['Plant & Machinery', 7], ['Leasehold Improvements', 8], ['Right of Use Asset', 9],
  ]
  for (const [name, digit] of ppe) {
    await add(5, name, l4Ids['Cost|Property, Plant & Equipment'], digit)
    await add(5, name, l4Ids['Accumulated Depreciation|Property, Plant & Equipment'], digit)
  }
  const intangibles: [string, number][] = [['Software Licenses', 1], ['Patents & Trademarks', 2], ['Goodwill', 3], ['Other Intangibles', 4]]
  for (const [name, digit] of intangibles) {
    await add(5, name, l4Ids['Cost|Intangible Assets'], digit)
    await add(5, name, l4Ids['Accumulated Amortization|Intangible Assets'], digit)
  }
  console.log(`coa classes: ${await prisma.coaClass.count()} created`)
}

async function seedAttendanceSettings() {
  // Night shift defaults carried over from the Laravel app: attendance opens at 5 PM PKT,
  // the shift starts at 7:10 PM with a 15 minute grace, and the absent sweep runs at 11:59 PM.
  const settings: [string, string, string][] = [
    ['timezone',             'Asia/Karachi', 'Timezone'],
    ['reporting_time',       '17:00',        'Attendance opens at (HH:MM 24hr)'],
    ['login_time',           '19:10',        'Shift login time (HH:MM 24hr)'],
    ['grace_period_minutes', '15',           'Late margin (minutes after login time)'],
    ['cutoff_time',          '23:59',        'Attendance cutoff (HH:MM 24hr)'],
    ['auto_mark_on_login',   'true',         'Auto-mark attendance on login'],
  ]
  for (const [key, value, label] of settings) {
    await prisma.attendanceSetting.upsert({ where: { key }, update: {}, create: { key, value, label } })
  }
  console.log('attendance settings: ensured')
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123'
  await prisma.user.upsert({
    where:  { userCode: 'ADMIN' },
    update: {},
    create: {
      userCode: 'ADMIN', password: await bcrypt.hash(adminPassword, 12), role: 'ADMIN',
      displayName: 'System Admin', firstName: 'System', lastName: 'Admin', isActive: true,
    },
  })
  console.log('admin user: ensured (ADMIN)')

  const dids = (['Medicare', 'Final Expense', 'ACA'] as const).flatMap((campaign, i) =>
    Array.from({ length: 20 }, (_, n) => ({ didCode: `${['MD', 'FD', 'AD'][i]}${n + 1}`, campaign, isActive: true })))
  const { count } = await prisma.did.createMany({ data: dids, skipDuplicates: true })
  console.log(`dids: ${count} created`)

  await seedFormFields()
  await seedCoaClasses()
  await seedAttendanceSettings()
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
