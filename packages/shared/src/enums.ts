export enum Role {
  ADMIN    = 'ADMIN',
  DIRECTOR = 'DIRECTOR',
  MANAGER  = 'MANAGER',
  AGENT    = 'AGENT',
}

export enum ManagerType {
  REGULAR   = 'REGULAR',
  HR        = 'HR',
  ACCOUNTANT = 'ACCOUNTANT',
}

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

// Sales-specific enums
export enum CustomerStatus {
  PENDING            = 'PENDING',
  APPROVED           = 'APPROVED',
  DISAPPROVED        = 'DISAPPROVED',
  FINAL_APPROVED     = 'FINAL_APPROVED',
  FINAL_DISAPPROVED  = 'FINAL_DISAPPROVED',
}

export enum Vertical {
  MEDICARE        = 'MEDICARE',
  FINAL_EXPENSE   = 'FINAL_EXPENSE',
  ACA             = 'ACA',
  OTHER           = 'OTHER',
}
