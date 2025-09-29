import { test, expect } from '@playwright/test'

test.describe('Admin Créditos', () => {
  test('exibe estatísticas e permite ajustar saldo', async ({ page }) => {
    const creditBalances = [
      {
        id: 'credit-1',
        user: { id: 'user-1', name: 'Alice Example', email: 'alice@example.com' },
        creditsRemaining: 120,
        lastSyncedAt: new Date('2024-09-17T12:00:00Z').toISOString(),
        _count: { usageHistory: 5 },
      },
      {
        id: 'credit-2',
        user: { id: 'user-2', name: 'Bruno Teste', email: 'bruno@example.com' },
        creditsRemaining: 6,
        lastSyncedAt: new Date('2024-09-16T12:00:00Z').toISOString(),
        _count: { usageHistory: 11 },
      },
    ]

    await page.route('**/api/admin/credits?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ creditBalances }),
      })
    })

    await page.route('**/api/admin/credits/*', async (route) => {
      const match = route.request().url().match(/credits\/(.*)$/)
      const creditId = match?.[1]
      const payload = route.request().postDataJSON() as { adjustment: number }

      const balance = creditBalances.find((c) => c.id === creditId)
      if (balance) {
        balance.creditsRemaining = Math.max(0, balance.creditsRemaining + payload.adjustment)
        balance.lastSyncedAt = new Date().toISOString()
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/admin/credits')

    await expect(page.getByRole('heading', { name: 'Gerenciamento de Créditos' })).toBeVisible()

    const totalCardValue = page
      .locator('p', { hasText: 'Total de Créditos' })
      .first()
      .locator('xpath=following-sibling::p[1]')
    await expect(totalCardValue).toHaveText('126')

    const averageCardValue = page
      .locator('p', { hasText: 'Saldo Médio' })
      .first()
      .locator('xpath=following-sibling::p[1]')
    await expect(averageCardValue).toHaveText('63')

    const lowCardValue = page
      .locator('p', { hasText: 'Saldo Baixo' })
      .first()
      .locator('xpath=following-sibling::p[1]')
    await expect(lowCardValue).toHaveText('1')

    const searchInput = page.getByPlaceholder('Pesquisar por usuário...')
    await searchInput.fill('Bruno')
    await expect(page.getByText('Bruno Teste')).toBeVisible()
    await expect(page.getByText('Alice Example')).not.toBeVisible()

    await searchInput.clear()
    await expect(page.getByText('Alice Example')).toBeVisible()

    const brunoRow = page.locator('tr').filter({ hasText: 'Bruno Teste' })
    await brunoRow.getByRole('button', { name: 'Ajustar' }).click()

    const dialog = page.getByRole('dialog', { name: 'Ajustar Créditos' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('spinbutton').fill('4')
    await dialog.getByRole('button', { name: 'Subtrair' }).click()

    const adjustRequest = page.waitForRequest((request) =>
      request.url().includes('/api/admin/credits/credit-2') && request.method() === 'PUT'
    )
    await dialog.getByRole('button', { name: 'Aplicar Ajuste' }).click()
    await adjustRequest

    await expect(
      page.getByRole('status').filter({ hasText: 'Créditos ajustados' })
    ).toBeVisible()
    await expect(brunoRow.locator('td').nth(1)).toContainText('2')
  })
})
