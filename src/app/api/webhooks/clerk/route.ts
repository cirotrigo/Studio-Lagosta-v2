import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from "@/lib/db";
import { refreshUserCredits, addUserCredits } from "@/lib/credits/validate-credits";
import { SUBSCRIPTION_PLANS } from "@/lib/clerk/subscription-utils";
import { getPlanCredits } from "@/lib/credits/settings";
import { getCreditsForPrice } from "@/lib/clerk/credit-packs";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400,
    });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with and ID of ${id} and type of ${eventType}`);
  console.log('Webhook body:', body);

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    
    try {
      const primaryEmail = email_addresses.find(email => email.id === evt.data.primary_email_address_id);
      
      // Create user in database
      const user = await db.user.create({
        data: {
          clerkId: id,
          email: primaryEmail?.email_address || null,
          name: `${first_name || ''} ${last_name || ''}`.trim() || null,
        },
      });

      // Initialize credit balance in database (free tier credits)
      await db.creditBalance.create({
        data: {
          userId: user.id,
          clerkUserId: id,
          creditsRemaining: 0,
        },
      });

      console.log('User and credits created successfully');
    } catch (error) {
      console.error('Error creating user:', error);
      return new Response('Error creating user', { status: 500 });
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    
    try {
      const primaryEmail = email_addresses.find(email => email.id === evt.data.primary_email_address_id);
      
      await db.user.update({
        where: { clerkId: id },
        data: {
          email: primaryEmail?.email_address || null,
          name: `${first_name || ''} ${last_name || ''}`.trim() || null,
        },
      });

      // Check if subscription metadata changed
      const publicMetadata = evt.data.public_metadata as Record<string, unknown>;
      
      if (publicMetadata?.subscriptionPlan || publicMetadata?.creditsRemaining !== undefined) {
        console.log(`User ${id} subscription/credits updated:`, {
          plan: publicMetadata.subscriptionPlan,
          credits: publicMetadata.creditsRemaining
        });
        
        // Update credit balance in our database
        const dbUser = await db.user.findUnique({
          where: { clerkId: id }
        });
        
        if (dbUser) {
          // If credits are explicitly set, use those; otherwise calculate from plan
          let newCredits = publicMetadata.creditsRemaining;
          if (newCredits === undefined && publicMetadata.subscriptionPlan) {
            const planId = publicMetadata.subscriptionPlan as string
            const plan = SUBSCRIPTION_PLANS[planId];
            newCredits = plan ? await getPlanCredits(planId) : 0;
          }
          
          if (newCredits !== undefined) {
            await refreshUserCredits(id, newCredits as number);
            console.log(`Updated ${id} credits to ${newCredits}`);
          }
        }
      }

      console.log('User updated successfully');
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }

  if (eventType === 'user.deleted') {
    try {
      await db.user.delete({
        where: { clerkId: evt.data.id! },
      });

      console.log('User deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }

  // Handle Clerk subscription events
  if (eventType === 'subscription.created') {
    console.log('Subscription created event:', evt.data);
    const subscription = evt.data as unknown as Record<string, unknown>;
    const userId = subscription.user_id as string as string;

    if (userId && subscription.status as string === 'active') {
      try {
        // Record subscription created event
        try {
          const planKey = subscription.plan_id as string || null
          await db.subscriptionEvent.create({
            data: {
              clerkUserId: userId,
              status: subscription.status as string,
              eventType: 'subscription.created',
              planKey: planKey ?? undefined,
              occurredAt: new Date((subscription.created_at as string | number) || Date.now()),
              metadata: subscription as unknown as null,
              userId: (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id || null,
            }
          })
        } catch (err) {
          console.error('Failed to persist subscription.created event', err)
        }
        // Map Clerk plan IDs (cplan_*) and use Clerk plan for credits when present
        const planIdentifier = subscription.plan_id as string
        if (planIdentifier) {
          const credits = await getPlanCredits(planIdentifier)
          await refreshUserCredits(userId, credits)
          console.log(`Subscription created: User ${userId} set to ${planIdentifier} with ${credits} credits`)
        } else {
          console.log(`Subscription created: missing plan_id for user ${userId}; skipping credit refresh`)
        }
      } catch (error) {
        console.error('Error handling subscription creation:', error);
      }
    }
  }

  if (eventType === 'subscription.updated') {
    console.log('Subscription updated event:', evt.data);
    const subscription = evt.data as unknown as Record<string, unknown>;
    const userId = subscription.user_id as string;
    
    if (userId) {
      try {
        // Persist event for analytics
        try {
          const planKey = subscription.plan_id as string || null
          await db.subscriptionEvent.create({
            data: {
              clerkUserId: userId,
              status: subscription.status as string,
              eventType: 'subscription.updated',
              planKey: planKey ?? undefined,
              occurredAt: new Date((subscription.updated_at as string | number) || Date.now()),
              metadata: subscription as unknown as null,
              userId: (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id || null,
            }
          })
        } catch (err) {
          console.error('Failed to persist subscription.updated event', err)
        }
        if (subscription.status as string === 'active') {
          // Handle plan changes or renewals
          const planIdentifier = subscription.plan_id as string
          if (planIdentifier) {
            const credits = await getPlanCredits(planIdentifier)
            await refreshUserCredits(userId, credits)
            console.log(`Subscription updated: User ${userId} refreshed with ${credits} credits for plan ${planIdentifier}`)
          } else {
            console.log(`Subscription updated: missing plan_id for user ${userId}; skipping credit refresh`)
          }
        } else if (subscription.status as string === 'canceled' || subscription.status as string === 'past_due') {
          // Handle cancellation or payment failure — set to 0 if no free tier configured
          await refreshUserCredits(userId, 0);
          console.log(`Subscription ${subscription.status as string}: User ${userId} set to 0 credits (no active plan)`);
        }
      } catch (error) {
        console.error('Error handling subscription update:', error);
      }
    }
  }

  // Handle subscription events (type assertion for custom webhook events)
  if ((eventType as string) === 'subscription.deleted' && 'data' in evt) {
    console.log('Subscription deleted event:', evt.data);
    const subscription = (evt as unknown as Record<string, unknown>).data as Record<string, unknown>;
    const userId = subscription.user_id as string;
    
    if (userId) {
      try {
        // Persist event for analytics
        try {
          const planKey = subscription.plan_id as string || null
          await db.subscriptionEvent.create({
            data: {
              clerkUserId: userId,
              status: 'deleted',
              eventType: 'subscription.deleted',
              planKey: planKey ?? undefined,
              occurredAt: new Date((subscription.deleted_at as string | number) || Date.now()),
              metadata: subscription as unknown as null,
              userId: (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id || null,
            }
          })
        } catch (err) {
          console.error('Failed to persist subscription.deleted event', err)
        }
        // No active plan → set to 0 unless admin configured otherwise externally
        await refreshUserCredits(userId, 0);
        console.log(`Subscription deleted: User ${userId} set to 0 credits (no active plan)`);
      } catch (error) {
        console.error('Error handling subscription deletion:', error);
      }
    }
  }

  // Clerk Billing Beta emits subscriptionItem.* events for item lifecycle
  if (eventType === 'subscriptionItem.active' || eventType === 'subscriptionItem.updated') {
    console.log('Subscription item event:', eventType, evt.data)
    const item = evt.data as unknown as Record<string, unknown>
    const userId = (item.user_id || (item.subscription as Record<string, unknown>)?.user_id || item.payer_id) as string
    const planId = (item.plan_id || (item.plan as Record<string, unknown>)?.id) as string
    const planIdentifier = planId
    if (userId) {
      try {
        // Persist item event as an update for analytics
        try {
          await db.subscriptionEvent.create({
            data: {
              clerkUserId: userId,
              status: 'active',
              eventType,
              planKey: planIdentifier ?? undefined,
              occurredAt: new Date((item.updated_at as string | number) || (item.created_at as string | number) || Date.now()),
              metadata: item as unknown as null,
              userId: (await db.user.findUnique({ where: { clerkId: userId as string }, select: { id: true } }))?.id || null,
            }
          })
        } catch (err) {
          console.error('Failed to persist subscriptionItem event', err)
        }
        if (planIdentifier) {
          const credits = await getPlanCredits(planIdentifier)
          await refreshUserCredits(userId, credits)
          console.log(`Subscription item ${eventType}: User ${userId} set to ${planIdentifier} with ${credits} credits`)
        } else {
          console.log(`Subscription item ${eventType}: missing plan id for user ${userId}; skipping credit refresh`)
        }
      } catch (error) {
        console.error('Error handling subscriptionItem event:', error)
      }
    }
  }

  // Handle billing events (type assertion for custom webhook events)
  if ((eventType as string) === 'invoice.payment_succeeded' && 'data' in evt) {
    console.log('Payment succeeded event:', evt.data)
    const invoice = (evt as unknown as Record<string, unknown>).data as Record<string, unknown>
    const userId = invoice?.customer_id || invoice?.user_id

    // Attempt to detect credit-pack purchases by price IDs
    const priceIds: string[] = []
    // Direct price on invoice (unlikely, but seen on some payloads)
    if (invoice?.price_id) priceIds.push(invoice.price_id as string)
    // Line items variants
    if (Array.isArray(invoice?.lines)) {
      for (const line of invoice.lines) {
        if (line?.price_id) priceIds.push(line.price_id)
        if (line?.price?.id) priceIds.push(line.price.id)
      }
    }
    if (Array.isArray(invoice?.line_items)) {
      for (const line of invoice.line_items) {
        if (line?.price_id) priceIds.push(line.price_id)
        if (line?.price?.id) priceIds.push(line.price.id)
      }
    }
    if (invoice?.lines && typeof invoice.lines === 'object' && (invoice.lines as { data?: unknown[] }).data && Array.isArray((invoice.lines as { data?: unknown[] }).data)) {
      for (const line of (invoice.lines as { data: Array<Record<string, unknown>> }).data) {
        if (line?.price && typeof line.price === 'object' && 'id' in line.price) priceIds.push((line.price as { id?: string }).id as string)
        if ('price_id' in line) priceIds.push((line as { price_id?: string }).price_id as string)
      }
    }

    // Compute total credits to add based on known price IDs
    const creditsToAdd = priceIds.reduce((sum, pid) => {
      const credits = getCreditsForPrice(pid)
      return sum + (credits ?? 0)
    }, 0)

    if (userId && creditsToAdd > 0) {
      try {
        await addUserCredits(userId as string, creditsToAdd)
        console.log(`Added ${creditsToAdd} credits to user ${userId} from invoice`)
      } catch (error) {
        console.error('Error adding credits from invoice:', error)
      }
    } else if (userId) {
      // No matching credit-pack prices detected; likely a subscription renewal.
      console.log(`Payment successful for user ${userId} - no credit-pack lines detected (handled by subscription.updated)`) 
    }
  }

  if ((eventType as string) === 'invoice.payment_failed' && 'data' in evt) {
    console.log('Payment failed event:', evt.data);
    const invoice = (evt as unknown as Record<string, unknown>).data as Record<string, unknown>;
    const userId = invoice.customer_id;
    
    // Handle payment failure - could implement grace period logic here
    if (userId) {
      try {
        console.log(`Payment failed for user ${userId} - subscription will be handled by subscription.updated event`);
      } catch (error) {
        console.error('Error handling payment failure:', error);
      }
    }
  }

  return new Response('', { status: 200 });
}
