export enum Role {
  ADMIN    = 'ADMIN',
  DIRECTOR = 'DIRECTOR',
  MANAGER  = 'MANAGER',
  AGENT    = 'AGENT',
}

export enum ManagerType {
  FLOOR      = 'Floor Manager/Team Lead',
  QA         = 'QA Manager',
  HR         = 'HR Manager',
  ACCOUNTANT = 'Accountant',
}

export const MANAGER_TYPES: string[] = [ManagerType.FLOOR, ManagerType.QA, ManagerType.HR, ManagerType.ACCOUNTANT]
export const AGENT_TYPES = ['Closer', 'Verifier', 'Self Closer', 'Fronter']
export const DEPARTMENTS = ['Medicare', 'Final Expense', 'Auto', 'Management']

export enum MessageType {
  TEXT  = 'TEXT',
  FILE  = 'FILE',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
}

export enum NotificationType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  NEW_MESSAGE   = 'NEW_MESSAGE',
  DOCUMENT      = 'DOCUMENT',
  SYSTEM        = 'SYSTEM',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT  = 'ABSENT',
  LATE    = 'LATE',
  LEAVE   = 'LEAVE',
  HOLIDAY = 'HOLIDAY',
}

export enum DayType {
  WORKING_DAY = 'WORKING_DAY',
  WEEKEND     = 'WEEKEND',
  HOLIDAY     = 'HOLIDAY',
}

export enum CustomerStatus {
  PENDING           = 'PENDING',
  APPROVED          = 'APPROVED',
  DISAPPROVED       = 'DISAPPROVED',
  FINAL_APPROVED    = 'FINAL_APPROVED',
  FINAL_DISAPPROVED = 'FINAL_DISAPPROVED',
  AGENT_REJECTED    = 'AGENT_REJECTED',
}

// Verticals (and client/DID campaigns) are not fixed here: they live in the verticals table,
// managed under Verticals by Admin and Director (see apps/api/src/modules/verticals).
export const SALE_TYPES  = ['CPA', 'CPL']
export const RATE_TYPES  = ['fixed', 'variable']
export const CANCEL_REASONS = ['XFER', 'No LA', 'Ringing', 'Over Age', 'Out of State', 'Hangup', 'No medicare card']

export const FORM_TYPES = ['sale', 'client', 'user'] as const
export type FormType = typeof FORM_TYPES[number]
export const FIELD_TYPES = ['text', 'number', 'select', 'date', 'textarea', 'amount_usd', 'amount_pkr']
export const COL_SPANS   = ['full', 'two_thirds', 'half', 'third']

// Field keys that map onto real columns; any other key a form submits is stored in extraFields.
export const STANDARD_FIELD_KEYS: Record<FormType, string[]> = {
  sale: [
    'first_name', 'mid_name', 'last_name', 'age', 'date_of_birth', 'phone',
    'address', 'city', 'state', 'postal_code', 'vertical_type', 'vertical_other',
    'did_comments', 'transferred_from', 'reason', 'client_id',
  ],
  client: [
    'company_name', 'campaign', 'did_code', 'sale_type', 'rate_type', 'rate_of_sale_amount',
    'opening_balance', 'cycle_of_day', 'billing_start_after_days', 'notes',
  ],
  user: [
    'first_name', 'mid_name', 'last_name', 'email', 'phone', 'date_of_birth', 'date_of_joining',
    'department', 'experience', 'cnic', 'permanent_address', 'current_address',
    'basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance',
    'bank', 'account_title', 'bank_account_no', 'iban_no',
  ],
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}
