import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request, Response } from 'express'
import { diskStorage } from 'multer'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'

const FOLDERS = ['chat', 'misc'] as const
const MAX_BYTES = 25 * 1024 * 1024
const KEY_RE = /^(chat|misc)\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/

export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? 'uploads')

// Voice notes from MediaRecorder arrive without a usable filename, so the type decides the extension.
function extensionFor(originalName: string, mime: string) {
  const fromName = path.extname(originalName || '').toLowerCase()
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName
  if (mime.includes('webm')) return '.webm'
  if (mime.includes('ogg'))  return '.ogg'
  if (mime.includes('mp4'))  return '.m4a'
  if (mime.includes('wav'))  return '.wav'
  if (mime.includes('png'))  return '.png'
  if (mime.includes('jpeg')) return '.jpg'
  if (mime.includes('pdf'))  return '.pdf'
  return ''
}

@Controller('files')
export class FilesController {
  constructor(private jwt: JwtService, private config: ConfigService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_BYTES },
    storage: diskStorage({
      destination: (req: Request, _file, cb) => {
        const folder = FOLDERS.includes((req.body?.folder ?? '') as any) ? req.body.folder : 'misc'
        const dir = path.join(uploadRoot(), folder)
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
      },
      filename: (_req, file, cb) => cb(null, `${uuidv4()}${extensionFor(file.originalname, file.mimetype)}`),
    }),
  }))
  upload(@UploadedFile() file: Express.Multer.File, @Body('folder') folder?: string) {
    if (!file) throw new BadRequestException('No file uploaded.')
    const dir = FOLDERS.includes((folder ?? '') as any) ? folder : 'misc'
    return { key: `${dir}/${file.filename}`, fileName: file.originalname, mimeType: file.mimetype, size: file.size }
  }

  // <img>, <audio> and <a> cannot send an Authorization header, so the token may ride in ?t=.
  @Get('open')
  async open(
    @Req() req: Request,
    @Query('key') key: string,
    @Query('name') name: string | undefined,
    @Query('download') download: string | undefined,
    @Query('t') t: string | undefined,
    @Res() res: Response,
  ) {
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const token = header || t
    if (!token) throw new UnauthorizedException()
    try {
      await this.jwt.verifyAsync(token, { secret: this.config.get<string>('jwt.accessSecret') })
    } catch {
      throw new UnauthorizedException()
    }
    if (!key || !KEY_RE.test(key)) throw new BadRequestException('Invalid file key.')
    const file = path.join(uploadRoot(), key)
    if (!fs.existsSync(file)) throw new NotFoundException('File not found.')

    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const safeName = (name ?? path.basename(file)).replace(/["\r\n]/g, '')
    res.setHeader('Content-Disposition', `${download === 'true' ? 'attachment' : 'inline'}; filename="${safeName}"`)
    return res.sendFile(file)
  }
}
