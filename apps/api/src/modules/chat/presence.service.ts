import { Injectable } from '@nestjs/common'

@Injectable()
export class PresenceService {
  private online = new Map<string, Set<string>>()

  addSocket(userId: string, socketId: string) {
    if (!this.online.has(userId)) this.online.set(userId, new Set())
    this.online.get(userId)!.add(socketId)
  }

  removeSocket(userId: string, socketId: string): boolean {
    const set = this.online.get(userId)
    if (!set) return false
    set.delete(socketId)
    if (set.size === 0) {
      this.online.delete(userId)
      return true
    }
    return false
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId)
  }
}
