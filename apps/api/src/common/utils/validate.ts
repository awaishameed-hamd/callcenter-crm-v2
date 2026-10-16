import { UnprocessableEntityException } from '@nestjs/common'
import { isYmd } from './time'

type Opts = { required?: boolean; max?: number; min?: number }

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export function fail(message: string): never {
  throw new UnprocessableEntityException(message)
}

// Each reader returns undefined when the key is absent (Laravel "sometimes"),
// null when present but blank, otherwise the coerced value.
export const V = {
  str(v: unknown, label: string, o: Opts = {}): string | null | undefined {
    if (v === undefined) { if (o.required) fail(`${label} is required.`); return undefined }
    if (isBlank(v)) { if (o.required) fail(`${label} is required.`); return null }
    if (typeof v !== 'string' && typeof v !== 'number') fail(`${label} must be text.`)
    const s = String(v).trim()
    if (o.max && s.length > o.max) fail(`${label} may not be greater than ${o.max} characters.`)
    if (o.min && s.length < o.min) fail(`${label} must be at least ${o.min} characters.`)
    return s
  },

  num(v: unknown, label: string, o: Opts = {}): number | null | undefined {
    if (v === undefined) { if (o.required) fail(`${label} is required.`); return undefined }
    if (isBlank(v)) { if (o.required) fail(`${label} is required.`); return null }
    const n = Number(v)
    if (!Number.isFinite(n)) fail(`${label} must be a number.`)
    if (o.min !== undefined && n < o.min) fail(`${label} must be at least ${o.min}.`)
    if (o.max !== undefined && n > o.max) fail(`${label} may not be greater than ${o.max}.`)
    return n
  },

  int(v: unknown, label: string, o: Opts = {}): number | null | undefined {
    const n = V.num(v, label, o)
    if (n !== undefined && n !== null && !Number.isInteger(n)) fail(`${label} must be an integer.`)
    return n
  },

  date(v: unknown, label: string, o: Opts = {}): string | null | undefined {
    if (v === undefined) { if (o.required) fail(`${label} is required.`); return undefined }
    if (isBlank(v)) { if (o.required) fail(`${label} is required.`); return null }
    const s = String(v).slice(0, 10)
    if (!isYmd(s)) fail(`${label} is not a valid date.`)
    return s
  },

  oneOf<T extends string>(v: unknown, label: string, list: readonly T[], o: Opts = {}): T | null | undefined {
    const s = V.str(v, label, o)
    if (s === undefined || s === null) return s
    if (!list.includes(s as T)) fail(`The selected ${label.toLowerCase()} is invalid.`)
    return s as T
  },

  email(v: unknown, label: string, o: Opts = {}): string | null | undefined {
    const s = V.str(v, label, o)
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(`${label} must be a valid email address.`)
    return s ? s.toLowerCase() : s
  },

  bool(v: unknown): boolean | undefined {
    if (v === undefined || v === null || v === '') return undefined
    return v === true || v === 1 || v === '1' || v === 'true'
  },

  obj(v: unknown, label: string): Record<string, unknown> | null | undefined {
    if (v === undefined) return undefined
    if (v === null) return null
    if (typeof v !== 'object' || Array.isArray(v)) fail(`${label} must be an object.`)
    return v as Record<string, unknown>
  },
}

/** Collects per-field errors so the client can highlight every invalid input at once. */
export class FieldErrors {
  readonly errors: Record<string, string[]> = {}

  run<T>(key: string, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (e) {
      if (e instanceof UnprocessableEntityException) {
        this.add(key, (e.getResponse() as { message?: string }).message ?? 'Invalid value.')
        return undefined
      }
      throw e
    }
  }

  add(key: string, message: string) { (this.errors[key] ??= []).push(message) }

  throwIfAny(message = 'Please fix the highlighted errors.') {
    if (Object.keys(this.errors).length) throw new UnprocessableEntityException({ message, errors: this.errors })
  }
}

/** Copies only the keys the reader returned a value for (undefined = leave untouched). */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k]
  return out
}

export interface Page<T> { data: T[]; total: number; currentPage: number; lastPage: number; perPage: number }

export function pageArgs(page: unknown, perPage: number) {
  const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1)
  return { skip: (p - 1) * perPage, take: perPage, page: p }
}

export function toPage<T>(data: T[], total: number, page: number, perPage: number): Page<T> {
  return { data, total, currentPage: page, lastPage: Math.max(1, Math.ceil(total / perPage)), perPage }
}

export function csvRow(values: unknown[]): string {
  return values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
}
