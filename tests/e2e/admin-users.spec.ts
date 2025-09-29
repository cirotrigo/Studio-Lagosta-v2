import { test, expect } from '@playwright/test'

test.describe('Admin Usuários', () => {
  test('permite buscar, ajustar créditos e convidar usuários', async ({ page }) => {
    const users = [
      {
        id: 'user-1',
        clerkId: 'clerk_1',
        name: 'Alice Example',
        email: 'alice@example.com',
        createdAt: new Date('2024-09-01T12:00:00Z').toISOString(),
        isActive: true,
        creditBalance: { creditsRemaining: 120 },
        _count: { usageHistory: 8 },
      },
      {
        id: 'user-2',
        clerkId: 'clerk_2',
        name: 'Bruno Teste',
        email: 'bruno@example.com',
        createdAt: new Date('2024-07-15T12:00:00Z').toISOString(),
        isActive: false,
        creditBalance: { creditsRemaining: 5 },
        _count: { usageHistory: 12 },
      },
    ]

    const invitations = [
      {
        id: 'inv-1',
        emailAddress: 'pessoa@exemplo.com',
        status: 'pending',
        createdAt: new Date('2024-09-10T12:00:00Z').toISOString(),
        expiresAt: new Date('2024-10-10T12:00:00Z').toISOString(),
      },
    ]

    await page.route('**/api/admin/users?**', async (route) => {
      const url = new URL(route.request().url())
      const search = url.searchParams.get('search')?.toLowerCase() ?? ''
      const filtered = search
        ? users.filter((user) =>
            user.name.toLowerCase().includes(search) ||
            user.email.toLowerCase().includes(search),
          )
        : users

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: filtered,
          pagination: {
            page: 1,
            pageSize: filtered.length,
            total: filtered.length,
            pages: 1,
          },
        }),
      })
    })

    await page.route('**/api/admin/users/invitations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invitations }),
      })
    })

    await page.route('**/api/admin/users/*/credits', async (route) => {
      const requestUrl = route.request().url()
      const [, userId] = requestUrl.match(/users\/(.*)\/credits/) || []
      const payload = route.request().postDataJSON() as { credits: number }

      const target = users.find((user) => user.id === userId)
      if (target && typeof payload?.credits === 'number') {
        target.creditBalance = { creditsRemaining: payload.credits }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await page.route('**/api/admin/users/invite', async (route) => {
      const body = route.request().postDataJSON() as { email: string; name?: string }
      invitations.push({
        id: `inv-${invitations.length + 1}`,
        emailAddress: body.email,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'invited' }),
      })
    })

    await page.goto('/admin/users')

    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible()
    await expect(page.getByText('Alice Example')).toBeVisible()
    await expect(page.getByText('Bruno Teste')).toBeVisible()

    const searchInput = page.getByPlaceholder('Pesquisar usuários...')
    await searchInput.fill('Bruno')
    await expect(page.getByText('Bruno Teste')).toBeVisible()
    await expect(page.getByText('Alice Example')).not.toBeVisible()

    await searchInput.fill('')
    await expect(page.getByText('Alice Example')).toBeVisible()

    const aliceRow = page.locator('tr').filter({ hasText: 'Alice Example' })
    await aliceRow.getByRole('button').last().click()

    const dialogPromise = new Promise<void>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('prompt')
        await dialog.accept('200')
        resolve()
      })
    })

    await page.getByRole('menuitem', { name: 'Ajustar Créditos' }).click()
    await dialogPromise

    await expect(
      page.getByRole('status').filter({ hasText: 'Créditos atualizados' })
    ).toBeVisible()
    await expect(aliceRow.getByText('200')).toBeVisible()

    await page.getByRole('button', { name: 'Adicionar Usuário' }).click()
    await page.getByLabel('E-mail').fill('nova.pessoa@example.com')
    await page.getByLabel('Nome (opcional)').fill('Nova Pessoa')

    const inviteRequest = page.waitForRequest('**/api/admin/users/invite')
    await page.getByRole('button', { name: 'Enviar Convite' }).click()
    await inviteRequest

    await expect(
      page.getByRole('status').filter({ hasText: 'Convite enviado' })
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Convites Pendentes' }).click()
    const invitesPanel = page.getByRole('tabpanel', { name: 'Convites Pendentes' })
    await expect(
      invitesPanel.getByRole('cell', { name: 'nova.pessoa@example.com' })
    ).toBeVisible()
  })
})
