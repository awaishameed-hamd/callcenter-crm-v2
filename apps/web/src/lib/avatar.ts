'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiPut, apiDelete } from './api'

// Profile photo, stored on the server (users.avatar holds the file name), so it follows the user
// to any computer and shows in the sidebar, the Profile page and chat. The browser shrinks the
// picture before uploading it.

const API_URL  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const MAX_SIDE = 320
const LEGACY_KEY = (userId: string) => `metavoice_avatar_${userId}`   // where photos lived before

/** The image URL for a stored photo name (full URLs and data URLs pass through). */
export const avatarUrl = (v?: string | null) =>
  !v ? null : /^(data:|https?:|\/)/.test(v) ? v : `${API_URL}/files/avatar/${v}`

async function shrink(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('That file is not an image.'))
    i.src = src
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

let moving = false   // the sidebar and the Profile page both mount this hook; move an old photo once

/** The signed-in user's photo URL, plus save and remove. */
export function useAvatar() {
  const { user, updateUser } = useAuth()

  // A photo saved in this browser before photos lived on the server moves up once
  useEffect(() => {
    if (!user || user.avatar || moving) return
    let local: string | null = null
    try { local = localStorage.getItem(LEGACY_KEY(user.id)) } catch { /* storage blocked */ }
    if (!local?.startsWith('data:image')) return
    moving = true
    shrink(local)
      .then(image => apiPut<{ avatar: string }>('/profile/avatar', { image }))
      .then(r => { updateUser({ avatar: r.avatar }); try { localStorage.removeItem(LEGACY_KEY(user.id)) } catch { /* ignore */ } })
      .catch(() => {})
      .finally(() => { moving = false })
  }, [user?.id, user?.avatar]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (file: File) => {
    const image = await shrink(await readFile(file))
    const r = await apiPut<{ avatar: string }>('/profile/avatar', { image })
    updateUser({ avatar: r.avatar })
  }
  const remove = async () => {
    await apiDelete('/profile/avatar')
    updateUser({ avatar: null })
    try { if (user) localStorage.removeItem(LEGACY_KEY(user.id)) } catch { /* ignore */ }
  }
  return { avatar: avatarUrl(user?.avatar), save, remove }
}
