import { Role, ManagerType } from '@crm/shared'

export interface User {
  id:          string
  userCode:    string
  email:       string
  displayName: string
  role:        Role
  managerType?: ManagerType | null
  phone?:      string
  isActive:    boolean
  createdAt:   string
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
