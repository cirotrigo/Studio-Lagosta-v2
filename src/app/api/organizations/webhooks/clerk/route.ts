import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import type { WebhookEvent } from '@clerk/nextjs/server'
import {
  markOrganizationDeleted,
  removeOrganization,
  syncOrganizationFromClerk,
} from '@/lib/organizations'
import type { ClerkOrganizationPayload } from '@/lib/organizations'

export const runtime = 'nodejs'

function isMembershipEvent(eventType: string) {
  return eventType.startsWith('organizationMembership')
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('Missing CLERK_WEBHOOK_SECRET environment variable')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing Svix headers' },
      { status: 400 }
    )
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying Clerk webhook', err)
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    )
  }

  const eventType = evt.type

  try {
    if (eventType === 'organization.created' || eventType === 'organization.updated') {
      const organizationPayload = evt.data as ClerkOrganizationPayload
      if (!organizationPayload?.id) {
        throw new Error(`Webhook ${eventType} sem identificador de organização`)
      }
      await syncOrganizationFromClerk(organizationPayload)
    } else if (eventType === 'organization.deleted') {
      const orgId = (evt.data as { id?: string }).id
      if (!orgId) {
        console.warn('Received organization.deleted without id payload')
        return NextResponse.json({ success: true })
      }
      const deleteStrategy = process.env.CLERK_ORG_DELETE_STRATEGY || 'deactivate'
      if (deleteStrategy === 'delete') {
        await removeOrganization(orgId)
      } else {
        await markOrganizationDeleted(orgId)
      }
    } else if (isMembershipEvent(eventType)) {
      const membershipData = evt.data as unknown as Record<string, unknown>
      const organization = membershipData.organization as ClerkOrganizationPayload | undefined
      if (organization && organization.id) {
        await syncOrganizationFromClerk(organization)
      }
    } else {
      // For now we simply acknowledge other Clerk webhook events.
      console.info(`Unhandled Clerk organization webhook: ${eventType}`)
    }
  } catch (error) {
    console.error(`Failed to process Clerk webhook (${eventType})`, error)
    return NextResponse.json(
      { error: 'Failed to process webhook event' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
