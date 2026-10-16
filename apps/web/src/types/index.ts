import { Role, CustomerStatus } from '@crm/shared'

export interface User {
  id:            string
  userCode:      string
  role:          Role
  displayName:   string
  firstName:     string
  midName?:      string | null
  lastName:      string
  email?:        string | null
  phone?:        string | null
  dateOfBirth?:  string | null
  dateOfJoining?: string | null
  department?:   string | null
  agentType?:    string | null
  managerType?:  string | null
  experience?:   string | null
  cnic?:         string | null
  permanentAddress?: string | null
  currentAddress?:   string | null
  address?:      string | null
  bank?:         string | null
  accountTitle?: string | null
  bankAccountNo?: string | null
  ibanNo?:       string | null
  basicSalary?:          string | null
  punctualityAllowance?: string | null
  travellingAllowance?:  string | null
  otherAllowance?:       string | null
  isActive:      boolean
  inactiveSince?: string | null
  profileLocked: boolean
  attendanceApplicable?: boolean
  avatar?:       string | null
  createdAt:     string
  extraFields?:  Record<string, unknown> | null
}

export interface Page<T> {
  data:        T[]
  total:       number
  currentPage: number
  lastPage:    number
  perPage:     number
}

export interface ClientRef {
  id:                string
  didCode:           string | null
  rateType:          string
  saleType:          string | null
  companyName?:      string
  rateOfSaleAmount?: string | null
}

export interface Customer {
  id:              string
  customerCode:    string | null
  firstName:       string
  midName:         string | null
  lastName:        string
  dateOfBirth:     string | null
  age:             number | null
  phone:           string | null
  address:         string | null
  city:            string | null
  state:           string | null
  postalCode:      string | null
  verticalType:    string | null
  verticalOther:   string | null
  didComments:     string | null
  transferredFrom: string | null
  qaComments:      string | null
  verifiersPart:   string | null
  leadIdTimestamp: string | null
  submittedAtPak:  string | null
  submittedAtEst:  string | null
  reason:          string | null
  notes:           string | null
  managerNote:     string | null
  finalNote:       string | null
  status:          CustomerStatus
  agentId:         string
  clientId:        string | null
  approvedAt:         string | null
  disapprovedAt:      string | null
  finalApprovedAt:    string | null
  finalDisapprovedAt: string | null
  saleDidCode:      string | null
  saleCompanyName?: string | null
  saleRateAmount?:  string | null
  saleRateType?:    string | null
  extraFields:     Record<string, unknown> | null
  createdAt:       string
  client?:         ClientRef | null
  agent?:          { id: string; userCode: string; displayName: string } | null
}

export interface Client {
  id:                    string
  didCode:               string | null
  saleType:              string | null
  campaign:              string | null
  companyName:           string
  displayName:           string | null
  rateOfSaleAmount:      string | null
  openingBalance:        string | null
  rateType:              string
  cycleOfDay:            number | null
  billingStartAfterDays: number | null
  billingStartAfter:     string
  notes:                 string | null
  isActive:              boolean
  extraFields:           Record<string, unknown> | null
  createdAt:             string
}

export interface FormField {
  id?:          string
  formType?:    string
  fieldKey:     string
  label:        string
  placeholder:  string | null
  isVisible?:   boolean
  isRequired:   boolean
  fieldType:    string
  options:      string[] | null
  sortOrder:    number
  isCore:       boolean
  section:      string | null
  colSpan:      string
  textareaRows: number
}

export interface Message {
  id:             string
  conversationId: string
  sender:         { id: string; displayName: string; role: Role }
  content:        string
  type:           'TEXT' | 'FILE' | 'IMAGE' | 'AUDIO'
  attachmentUrl?: string
  createdAt:      string
}

export interface Conversation {
  id:             string
  messages:       Message[]
  lastMessageAt?: string
}

export interface Notification {
  id:        string
  title:     string
  body:      string
  type:      string
  data?:     Record<string, unknown>
  isRead:    boolean
  createdAt: string
}
