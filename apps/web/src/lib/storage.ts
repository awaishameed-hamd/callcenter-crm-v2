import api from './api'

// Files are stored on the API server's disk. What the database keeps is the
// object key ("chat/<uuid>.ext"); fileHref turns a key into a link the browser can open.

export type StorageFolder = 'chat' | 'misc' | 'cv'

export interface UploadedFileInfo {
  url:      string
  type:     'IMAGE' | 'AUDIO' | 'FILE'
  fileName: string
  mimeType: string
  size:     number
}

export function fileHref(ref: string, opts?: { name?: string; download?: boolean }): string {
  if (!ref) return ''
  const params = new URLSearchParams({ key: ref })
  if (opts?.name)     params.set('name', opts.name)
  if (opts?.download) params.set('download', 'true')
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('access_token')
    if (token) params.set('t', token)
  }
  return `${api.defaults.baseURL}/files/open?${params.toString()}`
}

function classify(mimeType: string): 'IMAGE' | 'AUDIO' | 'FILE' {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('audio/')) return 'AUDIO'
  return 'FILE'
}

export async function uploadFile(file: File | Blob, folder: StorageFolder, fileName?: string): Promise<UploadedFileInfo> {
  const name = fileName ?? (file instanceof File ? file.name : 'file')
  const mime = file.type || 'application/octet-stream'
  const form = new FormData()
  form.append('folder', folder)
  form.append('file', file, name)
  const { data } = await api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  const { key } = data?.data ?? data
  return { url: key, type: classify(mime), fileName: name, mimeType: mime, size: file.size }
}
