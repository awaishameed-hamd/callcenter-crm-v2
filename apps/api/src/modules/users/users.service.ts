import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { Role }          from '@crm/shared'
import * as bcrypt       from 'bcryptjs'

const ROLE_PREFIX: Record<Role, string> = {
  [Role.ADMIN]:    'ADMIN',
  [Role.DIRECTOR]: 'D',
  [Role.MANAGER]:  'M',
  [Role.AGENT]:    'A',
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } })
    if (existing) throw new ConflictException('Email already in use')

    const hashed   = await bcrypt.hash(dto.password, 12)
    const userCode = await this.generateUserCode(dto.role)

    return this.prisma.user.create({
      data: {
        displayName:   dto.displayName,
        email:         dto.email.toLowerCase(),
        password:      hashed,
        role:          dto.role,
        managerType:   dto.managerType,
        phone:         dto.phone,
        userCode,
        agentType:     dto.agentType,
        department:    dto.department,
        dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : undefined,
        cnic:          dto.cnic,
        address:       dto.address,
      },
      select: this.safeSelect(),
    })
  }

  findAll(role?: Role) {
    return this.prisma.user.findMany({
      where:   role ? { role } : undefined,
      select:  this.safeSelect(),
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: this.safeSelect() })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async update(id: string, dto: UpdateUserDto) {
    const data: any = { ...dto }
    // Remove plain-text password and email before spreading into update payload
    delete data.password
    delete data.email
    delete data.dateOfJoining

    if (dto.password)      data.password      = await bcrypt.hash(dto.password, 12)
    if (dto.email)         data.email         = dto.email.toLowerCase()
    if (dto.dateOfJoining) data.dateOfJoining = new Date(dto.dateOfJoining)

    return this.prisma.user.update({ where: { id }, data, select: this.safeSelect() })
  }

  async activate(id: string, isActive: boolean) {
    await this.prisma.user.update({ where: { id }, data: { isActive } })
    return { message: isActive ? 'User activated' : 'User deactivated' }
  }

  async remove(id: string) {
    await this.prisma.user.update({ where: { id }, data: { isActive: false } })
    return { message: 'User deactivated' }
  }

  async toggleLock(id: string, requestingRole: Role) {
    if (requestingRole !== Role.ADMIN) throw new ForbiddenException('Only admins can lock/unlock profiles')
    const user = await this.prisma.user.findUnique({ where: { id }, select: { profileLocked: true } })
    if (!user) throw new NotFoundException('User not found')
    const updated = await this.prisma.user.update({
      where:  { id },
      data:   { profileLocked: !user.profileLocked },
      select: this.safeSelect(),
    })
    return updated
  }

  async nextCode(role: Role): Promise<string> {
    const prefix = ROLE_PREFIX[role]
    if (role === Role.ADMIN) return 'ADMIN'

    const key    = `userCode:${role}`
    const counter = await this.prisma.sequenceCounter.findUnique({ where: { key } })
    const next   = (counter?.value ?? 0) + 1
    return `${prefix}${String(next).padStart(3, '0')}`
  }

  // Dropdown list of agents for reports/filters
  agentsDropdown() {
    return this.prisma.user.findMany({
      where:   { role: Role.AGENT, isActive: true },
      select:  { id: true, displayName: true, userCode: true },
      orderBy: { displayName: 'asc' },
    })
  }

  private safeSelect() {
    return {
      id: true, userCode: true, email: true, displayName: true,
      role: true, managerType: true, agentType: true, phone: true,
      isActive: true, profileLocked: true, avatar: true,
      dateOfJoining: true, department: true, cnic: true, address: true,
      basicSalary: true, punctualityAllowance: true, travellingAllowance: true,
      otherAllowance: true, bank: true, bankAccountNo: true,
      createdAt: true,
    }
  }

  private async generateUserCode(role: Role): Promise<string> {
    const key    = `userCode:${role}`
    const prefix = ROLE_PREFIX[role]

    const counter = await this.prisma.sequenceCounter.upsert({
      where:  { key },
      update: { value: { increment: 1 } },
      create: { key, value: 1 },
    })

    if (role === Role.ADMIN) return 'ADMIN'
    return `${prefix}${String(counter.value).padStart(3, '0')}`
  }
}
