import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FORM_TYPES, FIELD_TYPES, COL_SPANS, FormType } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { VerticalsService } from '../verticals/verticals.service'
import { V, fail } from '../../common/utils/validate'

const PUBLIC_SELECT = {
  fieldKey: true, label: true, placeholder: true, isRequired: true, fieldType: true,
  options: true, isCore: true, section: true, colSpan: true, textareaRows: true, sortOrder: true,
} satisfies Prisma.FormFieldSettingSelect

/** Form fields whose dropdown options are the vertical list (managed under Verticals, not here). */
const VERTICAL_FIELDS: Record<string, 'vertical_type' | 'campaign'> = { 'sale:vertical_type': 'vertical_type', 'client:campaign': 'campaign' }

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService, private verticals: VerticalsService) {}

  /** Replaces the stored options of the vertical fields with the live vertical list. */
  private async withVerticalOptions<T extends { fieldKey: string; options: unknown }>(type: FormType, rows: T[]) {
    const out: (T & { optionsFromVerticals?: boolean })[] = []
    for (const r of rows) {
      const which = VERTICAL_FIELDS[`${type}:${r.fieldKey}`]
      out.push(which ? { ...r, options: await this.verticals.optionsFor(which), optionsFromVerticals: true } : r)
    }
    return out
  }

  formType(v?: string): FormType {
    if (v === 'profile') return 'user'
    return (FORM_TYPES as readonly string[]).includes(v ?? '') ? (v as FormType) : 'sale'
  }

  async publicFields(formType?: string) {
    const type = this.formType(formType)
    const rows = await this.prisma.formFieldSetting.findMany({ where: { formType: type, isVisible: true }, orderBy: { sortOrder: 'asc' }, select: PUBLIC_SELECT })
    return this.withVerticalOptions(type, rows)
  }

  async fields(formType?: string) {
    const type = this.formType(formType)
    const rows = await this.prisma.formFieldSetting.findMany({ where: { formType: type }, orderBy: { sortOrder: 'asc' } })
    return this.withVerticalOptions(type, rows)
  }

  private options(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null
    const opts = v.map(o => String(o).trim()).filter(Boolean)
    if (opts.some(o => o.length > 100)) fail('Options may not be greater than 100 characters.')
    return opts.length ? opts : null
  }

  async updateFields(formType: string | undefined, fields: unknown) {
    const type = this.formType(formType)
    if (!Array.isArray(fields)) fail('Fields must be a list.')
    await this.prisma.$transaction(
      (fields as Record<string, any>[]).map(f => {
        const data: Prisma.FormFieldSettingUpdateManyMutationInput = {
          label:        V.str(f.label, 'Label', { required: true, max: 100 })!,
          isVisible:    !!f.isVisible,
          isRequired:   !!f.isRequired,
          sortOrder:    Number.isFinite(Number(f.sortOrder)) ? Number(f.sortOrder) : 0,
          placeholder:  V.str(f.placeholder, 'Placeholder', { max: 255 }) ?? null,
          section:      V.str(f.section, 'Section', { max: 100 }) ?? null,
          colSpan:      COL_SPANS.includes(f.colSpan) ? f.colSpan : 'third',
          textareaRows: Math.max(1, Math.min(20, parseInt(f.textareaRows, 10) || 3)),
        }
        if (FIELD_TYPES.includes(f.fieldType)) data.fieldType = f.fieldType
        // Vertical fields take their options from the vertical list, so stored options are left alone
        if ('options' in f && !VERTICAL_FIELDS[`${type}:${f.fieldKey}`]) data.options = this.options(f.options) ?? Prisma.DbNull
        return this.prisma.formFieldSetting.updateMany({ where: { formType: type, fieldKey: String(f.fieldKey) }, data })
      }),
    )
    return { message: 'Form fields updated.' }
  }

  async createField(formType: string | undefined, b: Record<string, any>) {
    const type = this.formType(formType)
    const fieldKey = V.str(b.fieldKey, 'Field key', { required: true, max: 60 })!
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey)) fail('Field key must start with a letter and contain only lowercase letters, digits and underscores.')
    if (await this.prisma.formFieldSetting.findUnique({ where: { formType_fieldKey: { formType: type, fieldKey } } })) {
      fail('The field key has already been taken.')
    }
    const fieldType = V.oneOf(b.fieldType, 'Field type', FIELD_TYPES, { required: true })!
    const colSpan   = V.oneOf(b.colSpan, 'Width', COL_SPANS)
    const rows      = V.int(b.textareaRows, 'Textarea rows', { min: 1, max: 20 })
    const options   = fieldType === 'select' ? this.options(b.options) : null
    return this.prisma.formFieldSetting.create({
      data: {
        formType:     type,
        fieldKey,
        label:        V.str(b.label, 'Label', { required: true, max: 100 })!,
        fieldType,
        section:      V.str(b.section, 'Section', { max: 100 }) ?? null,
        placeholder:  V.str(b.placeholder, 'Placeholder', { max: 255 }) ?? null,
        colSpan:      colSpan ?? (fieldType === 'textarea' ? 'full' : 'third'),
        textareaRows: rows ?? 3,
        isVisible:    V.bool(b.isVisible) ?? true,
        isRequired:   V.bool(b.isRequired) ?? false,
        options:      options ?? Prisma.DbNull,
        sortOrder:    V.int(b.sortOrder, 'Sort order') ?? 999,
        isCore:       false,
      },
    })
  }

  async deleteField(formType: string, fieldKey: string) {
    const type = this.formType(formType)
    const field = await this.prisma.formFieldSetting.findUnique({ where: { formType_fieldKey: { formType: type, fieldKey } } })
    if (!field) throw new NotFoundException('Field not found.')
    if (field.isCore) throw new ForbiddenException('Core fields cannot be deleted.')
    await this.prisma.formFieldSetting.delete({ where: { id: field.id } })
    return { message: 'Field deleted.' }
  }
}
