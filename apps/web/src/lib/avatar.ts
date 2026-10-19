'use client'

import { useEffect, useState } from 'react'

// Profile photo, kept in this browser like argroup's sidebar avatar. The sidebar and the Profile
// page share it: saving in either place updates the other at once (and other open tabs).

const KEY = (userId: string) => `metavoice_avatar_${userId}`
const EVENT = 'avatar:changed'
const MAX_SIDE = 320   // stored photos are shrunk to this, so they stay well inside browser storage

export function readAvatar(userId?: string | null): string | null {
  if (!userId) return null
  try { return localStorage.getItem(KEY(userId)) } catch { return null }
}

/** Shrinks the picked image, stores it and tells every listener; resolves to the stored image. */
export async function saveAvatar(userId: string, file: File): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
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
  const data = canvas.toDataURL('image/jpeg', 0.88)
  localStorage.setItem(KEY(userId), data)
  window.dispatchEvent(new Event(EVENT))
  return data
}

export function removeAvatar(userId: string) {
  try { localStorage.removeItem(KEY(userId)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT))
}

/** The current user's photo, kept up to date when it changes here or in another tab. */
export function useAvatar(userId?: string | null) {
  const [avatar, setAvatar] = useState<string | null>(null)
  useEffect(() => {
    const sync = () => setAvatar(readAvatar(userId))
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [userId])
  return avatar
}
