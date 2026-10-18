import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PresenceService } from './presence.service'

const CONTACT_SELECT = { id: true, displayName: true, role: true, managerType: true, agentType: true, avatar: true, lastSeenAt: true }

@Injectable()
export class ChatService {
  constructor(
    private prisma:   PrismaService,
    private presence: PresenceService,
  ) {}

  private withPresence<T extends { id: string }>(u: T): T & { isOnline: boolean } {
    return { ...u, isOnline: this.presence.isOnline(u.id) }
  }

  async getContacts(userId: string) {
    // All roles see all active users except themselves
    const contacts = await this.prisma.user.findMany({
      where:   { id: { not: userId }, isActive: true },
      select:  CONTACT_SELECT,
      orderBy: { displayName: 'asc' },
    })
    return contacts.map(c => this.withPresence(c))
  }

  async getOrCreateDirectConversation(userIdA: string, userIdB: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: userIdA } } },
          { participants: { some: { userId: userIdB } } },
        ],
      },
      include: { participants: true },
    })

    if (existing && existing.participants.length === 2) return existing

    return this.prisma.conversation.create({
      data: {
        participants: { create: [{ userId: userIdA }, { userId: userIdB }] },
      },
      include: { participants: true },
    })
  }

  private async assertGroupAdmin(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!p) throw new ForbiddenException('You are not part of this group')
    if (!p.isAdmin) throw new ForbiddenException('Only a group admin can do this')
  }

  async createGroup(creatorId: string, name: string, memberIds: string[]) {
    const members = Array.from(new Set((memberIds ?? []).filter(id => id && id !== creatorId)))
    return this.prisma.conversation.create({
      data: {
        isGroup:       true,
        name:          (name ?? '').trim() || 'New Group',
        createdById:   creatorId,
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId: creatorId, isAdmin: true },
            ...members.map(id => ({ userId: id })),
          ],
        },
      },
      include: { participants: true },
    })
  }

  async renameGroup(conversationId: string, userId: string, name: string) {
    await this.assertGroupAdmin(conversationId, userId)
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:  { name: (name ?? '').trim() || 'Group' },
    })
    return this.getGroupInfo(conversationId, userId)
  }

  async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    await this.assertGroupAdmin(conversationId, userId)
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId }, select: { userId: true },
    })
    const have  = new Set(existing.map(e => e.userId))
    const toAdd = Array.from(new Set(memberIds ?? [])).filter(id => id && !have.has(id))
    if (toAdd.length) {
      await this.prisma.conversationParticipant.createMany({
        data: toAdd.map(id => ({ conversationId, userId: id })),
        skipDuplicates: true,
      })
    }
    return this.getGroupInfo(conversationId, userId)
  }

  async removeGroupMember(conversationId: string, userId: string, memberId: string) {
    await this.assertGroupAdmin(conversationId, userId)
    if (memberId === userId) throw new ForbiddenException('Use leave group to remove yourself')
    await this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId: memberId } })
    return this.getGroupInfo(conversationId, userId)
  }

  async leaveGroup(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, include: { participants: true },
    })
    if (!conv) throw new NotFoundException('Group not found')
    if (!conv.isGroup) throw new ForbiddenException('Not a group')

    await this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } })
    const remaining = conv.participants.filter(p => p.userId !== userId)

    if (remaining.length === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } })
      return { left: true, deleted: true }
    }
    if (!remaining.some(p => p.isAdmin)) {
      await this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: remaining[0].userId } },
        data:  { isAdmin: true },
      })
    }
    return { left: true }
  }

  async getGroupInfo(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, include: { participants: true },
    })
    if (!conv) throw new NotFoundException('Group not found')
    if (!conv.participants.some(p => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this group')
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: conv.participants.map(p => p.userId) } }, select: CONTACT_SELECT,
    })
    const userMap = new Map(users.map(u => [u.id, u]))
    const members = conv.participants.map(p => {
      const u = userMap.get(p.userId)
      return { ...(u ? this.withPresence(u) : { id: p.userId, displayName: 'Unknown', role: '', avatar: null }), isAdmin: p.isAdmin }
    })
    const me = conv.participants.find(p => p.userId === userId)
    return {
      id:          conv.id,
      name:        conv.name,
      isGroup:     conv.isGroup,
      createdById: conv.createdById,
      isAdmin:     !!me?.isAdmin,
      members,
    }
  }

  async getMessages(conversationId: string, userId: string, before?: string, limit = 50) {
    const conversation = await this.prisma.conversation.findUnique({
      where:  { id: conversationId },
      select: { participants: { select: { userId: true } } },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    const isParticipant = conversation.participants.some(p => p.userId === userId)
    if (!isParticipant) throw new ForbiddenException('You are not part of this conversation')

    return this.prisma.message.findMany({
      where: {
        conversationId,
        NOT: { deletedForUserIds: { has: userId } },
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      include: {
        sender:  { select: { id: true, displayName: true, role: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })
  }

  async saveMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type = 'TEXT',
    attachmentUrl?: string,
    replyToId?: string,
  ) {
    const msg = await this.prisma.message.create({
      data: { conversationId, senderId, content, type: type as any, attachmentUrl, replyToId },
      include: {
        sender:  { select: { id: true, displayName: true, role: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, displayName: true } } } },
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:  { lastMessageAt: new Date(), updatedAt: new Date() },
    })

    return msg
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where:   { id: messageId },
      include: { conversation: { select: { participants: { select: { userId: true } } } } },
    })
    if (!message) throw new NotFoundException('Message not found')

    const participantIds = message.conversation.participants.map(p => p.userId)
    if (!participantIds.includes(userId)) throw new ForbiddenException('You are not part of this conversation')

    const deletedFor = Array.from(new Set([...message.deletedForUserIds, userId]))

    if (participantIds.every(id => deletedFor.includes(id))) {
      await this.prisma.message.delete({ where: { id: messageId } })
    } else {
      await this.prisma.message.update({ where: { id: messageId }, data: { deletedForUserIds: deletedFor } })
    }
    return { conversationId: message.conversationId }
  }

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where:   { id: conversationId },
      include: { participants: true },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    const isParticipant = conversation.participants.some(p => p.userId === userId)
    if (!isParticipant) throw new ForbiddenException('You are not part of this conversation')

    await this.prisma.conversation.delete({ where: { id: conversationId } })
    return { message: 'Conversation deleted' }
  }

  async markRead(conversationId: string, userId: string): Promise<Date> {
    const lastReadAt = new Date()
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data:  { lastReadAt },
    })
    return lastReadAt
  }

  async getConversationParticipants(conversationId: string): Promise<{ userId: string }[]> {
    const conv = await this.prisma.conversation.findUnique({
      where:  { id: conversationId },
      select: { participants: { select: { userId: true } } },
    })
    return conv?.participants ?? []
  }

  async updateLastSeen(userId: string): Promise<Date> {
    const lastSeenAt = new Date()
    await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt } })
    return lastSeenAt
  }

  async getUnreadCount(userId: string) {
    const participations = await this.prisma.conversationParticipant.findMany({
      where:  { userId },
      select: { conversationId: true, lastReadAt: true },
    })
    const counts = await Promise.all(
      participations.map(p =>
        this.prisma.message.count({
          where: {
            conversationId: p.conversationId,
            senderId:       { not: userId },
            NOT:            { deletedForUserIds: { has: userId } },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    )
    return counts.reduce((sum, c) => sum + c, 0)
  }

  async getConversationsByUser(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        messages: {
          where:   { NOT: { deletedForUserIds: { has: userId } } },
          take:    1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, displayName: true } } },
        },
        participants: { select: { userId: true, lastReadAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    const allOtherIds = conversations
      .flatMap(c => c.participants.map(p => p.userId))
      .filter(id => id !== userId)

    const users = await this.prisma.user.findMany({
      where:  { id: { in: allOtherIds } },
      select: CONTACT_SELECT,
    })
    const userMap = new Map(users.map(u => [u.id, u]))

    const unreadCounts = await Promise.all(
      conversations.map(async c => {
        const me = c.participants.find(p => p.userId === userId)
        const count = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId:       { not: userId },
            NOT:            { deletedForUserIds: { has: userId } },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        })
        return [c.id, count] as const
      }),
    )
    const unreadMap = new Map(unreadCounts)

    return conversations.map(c => {
      const unreadCount = unreadMap.get(c.id) ?? 0
      if (c.isGroup) {
        return { ...c, otherUser: null, memberCount: c.participants.length, unreadCount }
      }
      const otherId  = c.participants.find(p => p.userId !== userId)?.userId
      const otherRaw = otherId ? userMap.get(otherId) ?? null : null
      return {
        ...c,
        otherUser:   otherRaw ? this.withPresence(otherRaw) : null,
        unreadCount,
      }
    })
  }
}
