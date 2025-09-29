import { test, expect } from '@playwright/test'

test.describe('Admin Uso', () => {
  test('filtra histórico e visualiza detalhes de operações', async ({ page }) => {
    const usageRecords = [
      {
        id: 'usage-1',
        user: { name: 'Alice Example', email: 'alice@example.com' },
        operationType: 'AI_TEXT_CHAT',
        creditsUsed: 3,
        details: { prompt: 'Write a tweet' },
        timestamp: new Date('2024-09-18T12:00:00Z').toISOString(),
      },
      {
        id: 'usage-2',
        user: { name: 'Bruno Teste', email: 'bruno@example.com' },
        operationType: 'AI_IMAGE_GENERATION',
        creditsUsed: 5,
        details: { prompt: 'Create hero image', size: '1024x1024' },
        timestamp: new Date('2024-09-18T13:00:00Z').toISOString(),
      },
    ]

    await page.route('**/api/admin/usage?**', async (route) => {
      const url = new URL(route.request().url())
      const type = url.searchParams.get('type') || undefined
      const query = url.searchParams.get('q')?.toLowerCase() ?? ''
      const pageParam = Number(url.searchParams.get('page') ?? '1')
      const pageSizeParam = Number(url.searchParams.get('pageSize') ?? '25')

      let filtered = usageRecords
      if (type) {
        filtered = filtered.filter((record) => record.operationType === type)
      }
      if (query) {
        filtered = filtered.filter(
          (record) =>
            record.user.name.toLowerCase().includes(query) ||
            record.user.email.toLowerCase().includes(query),
        )
      }

      const start = (pageParam - 1) * pageSizeParam
      const data = filtered.slice(start, start + pageSizeParam)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          total: filtered.length,
          page: pageParam,
          pageSize: pageSizeParam,
        }),
      })
    })

    await page.goto('/admin/usage')

    await expect(page.getByRole('heading', { name: 'Histórico de Uso' })).toBeVisible()

    const totalsCardValue = page
      .locator('p', { hasText: 'Total de Operações' })
      .first()
      .locator('xpath=following-sibling::p[1]')
    await expect(totalsCardValue).toHaveText('2')

    const creditsCardValue = page
      .locator('p', { hasText: 'Créditos Consumidos' })
      .first()
      .locator('xpath=following-sibling::p[1]')
    await expect(creditsCardValue).toHaveText('8')

    await expect(page.getByText('alice@example.com')).toBeVisible()
    await expect(page.getByText('bruno@example.com')).toBeVisible()

    const typeSelect = page.getByRole('combobox').first()
    await typeSelect.click()
    await page.getByRole('option', { name: 'Chat de Texto' }).click()

    await expect(page.getByText('alice@example.com')).toBeVisible()
    await expect(page.getByText('bruno@example.com')).not.toBeVisible()

    await typeSelect.click()
    await page.getByRole('option', { name: 'Todas as Operações' }).click()

    const searchInput = page.getByPlaceholder('Pesquisar por usuário...')
    await searchInput.fill('bruno')
    await expect(page.getByText('bruno@example.com')).toBeVisible()
    await expect(page.getByText('alice@example.com')).not.toBeVisible()

    await searchInput.fill('')
    await expect(page.getByText('alice@example.com')).toBeVisible()

    const detailsButton = page.getByRole('button', { name: 'Ver' }).first()
    await detailsButton.click()

    const dialog = page.getByRole('dialog', { name: 'Detalhes da Operação' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('"prompt": "Write a tweet"')).toBeVisible()

    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).not.toBeVisible()
  })
})
