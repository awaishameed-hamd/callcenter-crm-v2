import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PresenceService } from './presence.service'

const CONTACT_SELECT = { id: true, displayName: true, role: true, managerType: true, agentType: true, avatar: true, lastSeenAt: true }

// What every message carries to the browser: sender, the message it replies to, and its reactions
const MESSAGE_INCLUDE = {
  sender:    { select: { id: true, displayName: true, role: true, avatar: true } },
  replyTo:   { include: { sender: { select: { id: true, displayName: true } } } },
  reactions: { select: { emoji: true, userId: true, user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'asc' as const } },
}

/** The reactions offered in the chat (WhatsApp's quick set plus thumbs down). */
export const REACTIONS = ['👍', '👎', '❤️', '😂', '😊', '😮', '😢', '🙏']
/** Like WhatsApp, a text message can be edited for 15 minutes after it was sent. */
export const EDIT_WINDOW_MS = 15 * 60_000

// Who may start a chat with whom: Admin, Director and Manager with anyone; Agents only with
// Managers and other Agents. Someone an Agent cannot reach may still start a chat with the Agent,
// and the Agent can reply there.
const AGENT_REACH: Role[] = [Role.MANAGER, Role.AGENT]
const canReach = (from: Role, to: Role) => from !== Role.AGENT || AGENT_REACH.includes(to)

@Injectable()
export class ChatService {
  constructor(
    private prisma:   PrismaService,
    private presence: PresenceService,
  ) {}

  private withPresence<T extends { id: string }>(u: T): T & { isOnline: boolean } {
    return { ...u, isOnline: this.presence.isOnline(u.id) }
  }

  private async roleOf(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!u) throw new NotFoundException('User not found')
    return u.role
  }

  /** Agents may only add Managers and Agents to a group. */
  private async assertCanAdd(actorId: string, memberIds: string[]) {
    if (!memberIds.length || (await this.roleOf(actorId)) !== Role.AGENT) return
    const blocked = await this.prisma.user.count({ where: { id: { in: memberIds }, role: { notIn: AGENT_REACH } } })
    if (blocked) throw new ForbiddenException('Agents can only add managers and agents to a group')
  }

  async getContacts(userId: string) {
    // Everyone the user may start a chat with
    const role = await this.roleOf(userId)
    const contacts = await this.prisma.user.findMany({
      where:   { id: { not: userId }, isActive: true, ...(role === Role.AGENT ? { role: { in: AGENT_REACH } } : {}) },
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

    const [from, to] = await Promise.all([this.roleOf(userIdA), this.roleOf(userIdB)])
    if (!canReach(from, to)) throw new ForbiddenException('Agents can only message managers and other agents')

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
    await this.assertCanAdd(creatorId, members)
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
    await this.assertCanAdd(userId, toAdd)
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
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })
  }

  /** Keeps only real members of a group chat (never the sender); direct chats have no tags. */
  private async validMentions(conversationId: string, senderId: string, mentions: unknown): Promise<string[]> {
    if (!Array.isArray(mentions) || !mentions.length) return []
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, select: { isGroup: true, participants: { select: { userId: true } } },
    })
    if (!conv?.isGroup) return []
    const members = new Set(conv.participants.map(p => p.userId))
    return Array.from(new Set(mentions.filter((id): id is string => typeof id === 'string' && id !== senderId && members.has(id))))
  }

  async saveMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type = 'TEXT',
    attachmentUrl?: string,
    replyToId?: string,
    mentions?: unknown,
  ) {
    const member = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } }, select: { userId: true },
    })
    if (!member) throw new ForbiddenException('You are not part of this conversation')

    const tagged = type === 'TEXT' ? await this.validMentions(conversationId, senderId, mentions) : []
    const msg = await this.prisma.message.create({
      data: { conversationId, senderId, content, type: type as any, attachmentUrl, replyToId, mentions: tagged },
      include: MESSAGE_INCLUDE,
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:  { lastMessageAt: new Date(), updatedAt: new Date() },
    })

    return msg
  }

  /** The sender changes the text of their own message within 15 minutes, as on WhatsApp. */
  async editMessage(messageId: string, userId: string, content: unknown, mentions?: unknown) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } })
    if (!message || message.deletedForUserIds.includes(userId)) throw new NotFoundException('Message not found')
    if (message.senderId !== userId) throw new ForbiddenException('You can only edit your own messages')
    if (message.type !== 'TEXT') throw new BadRequestException('Only text messages can be edited')
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) throw new BadRequestException('A message can only be edited within 15 minutes of sending it')
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) throw new BadRequestException('The message cannot be empty')
    if (text.length > 5000) throw new BadRequestException('The message is too long')
    const updated = await this.prisma.message.update({
      where:   { id: messageId },
      data:    { content: text, editedAt: new Date(), mentions: await this.validMentions(message.conversationId, userId, mentions) },
      include: MESSAGE_INCLUDE,
    })
    return updated
  }

  /** Sets, changes or (same emoji again, or none) removes this user's reaction to a message. */
  async reactToMessage(messageId: string, userId: string, emoji: unknown) {
    const message = await this.prisma.message.findUnique({
      where:   { id: messageId },
      select:  { id: true, conversationId: true, deletedForUserIds: true, conversation: { select: { participants: { select: { userId: true } } } } },
    })
    if (!message || message.deletedForUserIds.includes(userId)) throw new NotFoundException('Message not found')
    if (!message.conversation.participants.some(p => p.userId === userId)) throw new ForbiddenException('You are not part of this conversation')
    if (emoji !== null && emoji !== undefined && emoji !== '' && !REACTIONS.includes(String(emoji))) throw new BadRequestException('Choose one of the offered reactions')

    const key = { messageId_userId: { messageId, userId } }
    const current = await this.prisma.messageReaction.findUnique({ where: key })
    if (!emoji || current?.emoji === emoji) {
      if (current) await this.prisma.messageReaction.delete({ where: key })
    } else {
      await this.prisma.messageReaction.upsert({ where: key, create: { messageId, userId, emoji: String(emoji) }, update: { emoji: String(emoji) } })
    }
    const reactions = await this.prisma.messageReaction.findMany({ where: { messageId }, select: MESSAGE_INCLUDE.reactions.select, orderBy: { createdAt: 'asc' } })
    return { messageId, conversationId: message.conversationId, reactions }
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
    // updateMany: a user deleted while still connected is simply skipped instead of throwing
    await this.prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt } })
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
