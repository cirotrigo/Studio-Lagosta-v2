import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { db } from '@/lib/db'

interface PlanFeature {
  name: string;
  description: string | null;
  included: boolean;
}

interface PlanData {
  clerkId: string | null;
  name: string;
  credits: number;
  active: boolean;
  sortOrder: number;
  clerkName: string | null;
  currency: string | null;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  description: string | null;
  features: PlanFeature[] | null;
  badge: string | null;
  highlight: boolean;
  ctaType: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  billingSource: string;
}

function normalizeFeatures(features: unknown) {
  if (!Array.isArray(features)) return null
  const cleaned = features
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null
      const typedItem = item as Record<string, unknown>;
      const name = 'name' in typedItem ? String(typedItem.name).trim() : ''
      if (!name) return null
      return {
        name,
        description: (typeof typedItem.description === 'string' ? typedItem.description : '').trim() || null,
        included: Boolean(typedItem.included ?? true),
      }
    })
    .filter(Boolean)
  return cleaned.length > 0 ? cleaned : null
}

function normalizeCtaType(value: unknown) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  return normalized === 'contact' ? 'contact' : 'checkout'
}

function normalizeBillingSource(value: unknown) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  return normalized === 'manual' ? 'manual' : 'clerk'
}

function toCents(value: unknown) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed.replace(',', '.'))
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.round(parsed * 100))
  }
  return null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const plans = await db.plan.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({
    plans: plans.map(p => ({
      id: p.id,
      clerkId: p.clerkId,
      name: p.name,
      credits: p.credits,
      active: p.active,
      sortOrder: p.sortOrder ?? 0,
      clerkName: p.clerkName || null,
      currency: p.currency || null,
      priceMonthlyCents: p.priceMonthlyCents ?? null,
      priceYearlyCents: p.priceYearlyCents ?? null,
      description: p.description ?? null,
      features: p.features ?? null,
      badge: p.badge ?? null,
      highlight: p.highlight ?? null,
      ctaType: p.ctaType ?? null,
      ctaLabel: p.ctaLabel ?? null,
      ctaUrl: p.ctaUrl ?? null,
      billingSource: p.billingSource ?? 'clerk',
    })),
  })
}

// Clerk may return cplan_* ids, slugs, or other identifiers; only reject blank/whitespace values.
function isValidClerkPlanId(clerkId: string) {
  return /^c?plan_/.test(clerkId)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({})) as {
      clerkId?: string | null
      name?: string
      credits?: number
      active?: boolean
      clerkName?: string | null
      currency?: string | null
      priceMonthlyCents?: number | null | string
      priceYearlyCents?: number | null | string
      description?: string | null
      features?: unknown
      badge?: string | null
      highlight?: boolean | null
      ctaType?: string | null
      ctaLabel?: string | null
      ctaUrl?: string | null
      billingSource?: string | null
    }
    const billingSource = normalizeBillingSource(body.billingSource)
    const rawClerkId = typeof body.clerkId === 'string' ? body.clerkId.trim() : ''
    const name = (body.name || '').trim()
    const credits = Math.max(0, Math.floor(Number(body.credits ?? 0)))
    const active = body.active !== undefined ? Boolean(body.active) : true
    const clerkName = body.clerkName != null ? String(body.clerkName).trim() : (name || null)
    const clerkId = billingSource === 'clerk' ? rawClerkId : (rawClerkId || null)
    if (billingSource === 'clerk' && (!clerkId || !isValidClerkPlanId(clerkId))) {
      return NextResponse.json({ error: 'clerkId inválido' }, { status: 400 })
    }
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    try {
      const features = normalizeFeatures(body.features)
      const ctaType = normalizeCtaType(body.ctaType)
      const data = {
        clerkId,
        name,
        credits,
        active,
        clerkName,
        currency: body.currency ? String(body.currency).trim().toLowerCase() : null,
        priceMonthlyCents: toCents(body.priceMonthlyCents),
        priceYearlyCents: toCents(body.priceYearlyCents),
        description: body.description != null ? String(body.description).trim() || null : null,
        features,
        badge: body.badge != null ? String(body.badge).trim() || null : null,
        highlight: body.highlight != null ? Boolean(body.highlight) : undefined,
        ctaType: billingSource === 'manual' ? 'contact' : ctaType,
        ctaLabel: body.ctaLabel != null ? String(body.ctaLabel).trim() || null : null,
        ctaUrl: body.ctaUrl != null ? String(body.ctaUrl).trim() || null : null,
        billingSource,
      }
      const created = await db.plan.create({ data: data as PlanData })
      return NextResponse.json({ plan: {
        id: created.id,
        clerkId: created.clerkId,
        name: created.name,
        credits: created.credits,
        active: created.active,
        sortOrder: created.sortOrder ?? 0,
        clerkName: created.clerkName || null,
        currency: created.currency || null,
        priceMonthlyCents: created.priceMonthlyCents ?? null,
        priceYearlyCents: created.priceYearlyCents ?? null,
        description: created.description ?? null,
        features: created.features ?? null,
        badge: created.badge ?? null,
        highlight: created.highlight ?? null,
        ctaType: created.ctaType ?? null,
        ctaLabel: created.ctaLabel ?? null,
        ctaUrl: created.ctaUrl ?? null,
        billingSource: created.billingSource ?? 'clerk',
      } }, { status: 201 })
    } catch (e: unknown) {
      if (String((e as { code?: string })?.code) === 'P2002') {
        return NextResponse.json({ error: 'clerkId já existe' }, { status: 409 })
      }
      console.error('[admin/plans] create failed', e)
      throw e
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar plano'
    console.error('[admin/plans] create error', error)
    return NextResponse.json({ error: message || 'Falha ao criar plano' }, { status: 400 })
  }
}

async function findPlanByIdentifier(identifier: string) {
  if (!identifier) return null
  const byId = await db.plan.findUnique({ where: { id: identifier } })
  if (byId) return byId
  return db.plan.findUnique({ where: { clerkId: identifier } })
}

export async function PUT(_req: Request, ctx: { params: Promise<{ clerkId: string }> }) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const params = await ctx.params
  const identifier = decodeURIComponent(params.clerkId || '')
  try {
    const body = await _req.json().catch(() => ({})) as {
      planId?: string
      newClerkId?: string
      clerkId?: string | null
      name?: string
      credits?: number
      active?: boolean
      clerkName?: string | null
      currency?: string | null
      priceMonthlyCents?: number | null | string
      priceYearlyCents?: number | null | string
      description?: string | null
      features?: unknown
      badge?: string | null
      highlight?: boolean | null
      ctaType?: string | null
      ctaLabel?: string | null
      ctaUrl?: string | null
      billingSource?: string | null
    }
    const current = await findPlanByIdentifier(body.planId ?? identifier)
    if (!current) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    const data: Partial<PlanData> = {}
    if (body.billingSource !== undefined) data.billingSource = normalizeBillingSource(body.billingSource)
    if (body.newClerkId != null) {
      const newId = String(body.newClerkId).trim()
      if (!newId || !isValidClerkPlanId(newId)) return NextResponse.json({ error: 'newClerkId inválido' }, { status: 400 })
      data.clerkId = newId
    }
    if (body.clerkId !== undefined) {
      data.clerkId = body.clerkId === null ? null : (String(body.clerkId).trim() || null)
    }
    if (body.name != null) data.name = String(body.name).trim()
    if (body.credits != null) data.credits = Math.max(0, Math.floor(Number(body.credits)))
    if (body.active != null) data.active = Boolean(body.active)
    if (body.clerkName !== undefined) data.clerkName = body.clerkName === null ? null : String(body.clerkName).trim()
    if (body.currency !== undefined) data.currency = body.currency === null ? null : String(body.currency).trim().toLowerCase()
    if (body.priceMonthlyCents !== undefined) data.priceMonthlyCents = body.priceMonthlyCents === null ? null : toCents(body.priceMonthlyCents)
    if (body.priceYearlyCents !== undefined) data.priceYearlyCents = body.priceYearlyCents === null ? null : toCents(body.priceYearlyCents)
    if (body.description !== undefined) data.description = body.description === null ? null : (String(body.description).trim() || null)
    if (body.features !== undefined) data.features = normalizeFeatures(body.features)
    if (body.badge !== undefined) data.badge = body.badge === null ? null : (String(body.badge).trim() || null)
    if (body.highlight !== undefined) data.highlight = Boolean(body.highlight)
    if (body.ctaType !== undefined) data.ctaType = normalizeCtaType(body.ctaType)
    if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel === null ? null : (String(body.ctaLabel).trim() || null)
    if (body.ctaUrl !== undefined) data.ctaUrl = body.ctaUrl === null ? null : (String(body.ctaUrl).trim() || null)
    const updated = await db.plan.update({ where: { id: current.id }, data: data as PlanData })
    return NextResponse.json({ plan: {
      id: updated.id,
      clerkId: updated.clerkId,
      name: updated.name,
      credits: updated.credits,
      active: updated.active,
      sortOrder: updated.sortOrder ?? 0,
      clerkName: updated.clerkName || null,
    } })
  } catch (e: unknown) {
    const errorCode = (e as { code?: string })?.code;
    if (String(errorCode) === 'P2025') return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    if (String(errorCode) === 'P2002') return NextResponse.json({ error: 'newClerkId já existe' }, { status: 409 })
    console.error('[admin/plans] update error', e)
    const message = e instanceof Error ? e.message : 'Falha ao atualizar plano'
    return NextResponse.json({ error: message || 'Falha ao atualizar plano' }, { status: 400 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ clerkId: string }> }) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const params = await ctx.params
  const identifier = decodeURIComponent(params.clerkId || '')
  try {
    const plan = await findPlanByIdentifier(identifier)
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    await db.plan.delete({ where: { id: plan.id } })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    if (String((e as { code?: string })?.code) === 'P2025') return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    return NextResponse.json({ error: 'Falha ao remover plano' }, { status: 400 })
  }
}
