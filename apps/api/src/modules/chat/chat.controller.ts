import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common'
import { ChatService } from './chat.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('contacts')
  getContacts(@CurrentUser() user: { id: string }) {
    return this.chatService.getContacts(user.id)
  }

  @Get('conversations')
  getConversations(@CurrentUser() user: { id: string }) {
    return this.chatService.getConversationsByUser(user.id)
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: { id: string }) {
    return this.chatService.getUnreadCount(user.id)
  }

  @Post('conversations/direct')
  getOrCreateDirect(
    @Body('userId') userId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.getOrCreateDirectConversation(user.id, userId)
  }

  @Post('groups')
  createGroup(
    @Body('name') name: string,
    @Body('memberIds') memberIds: string[],
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.createGroup(user.id, name, memberIds ?? [])
  }

  @Get('conversations/:id/group')
  getGroupInfo(@Param('id') conversationId: string, @CurrentUser() user: { id: string }) {
    return this.chatService.getGroupInfo(conversationId, user.id)
  }

  @Patch('groups/:id')
  renameGroup(
    @Param('id') conversationId: string,
    @Body('name') name: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.renameGroup(conversationId, user.id, name)
  }

  @Post('groups/:id/members')
  addGroupMembers(
    @Param('id') conversationId: string,
    @Body('memberIds') memberIds: string[],
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.addGroupMembers(conversationId, user.id, memberIds ?? [])
  }

  @Delete('groups/:id/members/:memberId')
  removeGroupMember(
    @Param('id') conversationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.removeGroupMember(conversationId, user.id, memberId)
  }

  @Post('groups/:id/leave')
  leaveGroup(@Param('id') conversationId: string, @CurrentUser() user: { id: string }) {
    return this.chatService.leaveGroup(conversationId, user.id)
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: { id: string },
    @Query('before') before?: string,
    @Query('limit')  limit?:  string,
  ) {
    return this.chatService.getMessages(conversationId, user.id, before, limit ? parseInt(limit) : 50)
  }

  @Delete('conversations/:id')
  deleteConversation(
    @Param('id') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.deleteConversation(conversationId, user.id)
  }
}
