import { test, expect } from '@playwright/test'

test.describe('Admin Armazenamento', () => {
  test('filtra arquivos e remove objeto', async ({ page }) => {
    const items = [
      {
        id: 'file-1',
        name: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 150_000,
        url: 'https://files.example.com/invoice.pdf',
        pathname: '/uploads/invoice.pdf',
        createdAt: new Date('2024-09-18T10:00:00Z').toISOString(),
        user: { id: 'user-1', clerkId: 'clerk_1', name: 'Alice Example', email: 'alice@example.com' },
      },
      {
        id: 'file-2',
        name: 'summary.txt',
        contentType: 'text/plain',
        size: 4_096,
        url: 'https://files.example.com/summary.txt',
        pathname: '/uploads/summary.txt',
        createdAt: new Date('2024-09-17T15:00:00Z').toISOString(),
        user: { id: 'user-2', clerkId: 'clerk_2', name: 'Bruno Teste', email: 'bruno@example.com' },
      },
    ]

    await page.route('**/api/admin/storage?**', async (route) => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('q')?.toLowerCase() ?? ''
      const type = url.searchParams.get('type') || undefined
      const userId = url.searchParams.get('userId') || undefined

      let filtered = items
      if (q) {
        filtered = filtered.filter((item) => {
          const haystack = [
            item.name,
            item.contentType ?? '',
            item.url,
            item.pathname,
            item.user.name ?? '',
            item.user.email ?? '',
          ]
            .join(' ')
            .toLowerCase()

          return haystack.includes(q)
        })
      }

      if (type && type !== 'all') {
        filtered = filtered.filter((item) => item.contentType === type)
      }

      if (userId && userId !== 'all') {
        filtered = filtered.filter((item) => item.user.id === userId)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: filtered, nextCursor: null }),
      })
    })

    await page.route('**/api/admin/storage/*', async (route) => {
      const match = route.request().url().match(/storage\/(.*)$/)
      const targetId = match?.[1]
      const index = items.findIndex((item) => item.id === targetId)

      if (index >= 0) {
        items.splice(index, 1)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/admin/storage')

    await expect(page.getByRole('heading', { name: 'Armazenamento' })).toBeVisible()
    const invoiceRow = page.locator('tr').filter({ hasText: 'invoice.pdf' })
    const summaryRow = page.locator('tr').filter({ hasText: 'summary.txt' })
    await expect(invoiceRow).toBeVisible()
    await expect(summaryRow).toBeVisible()

    const searchInput = page.getByPlaceholder('Pesquisar por nome, tipo, URL, nome/email do usuário...')
    await searchInput.fill('summary')
    await expect(summaryRow).toBeVisible()
    await expect(invoiceRow).not.toBeVisible()

    await searchInput.fill('')
    await expect(invoiceRow).toBeVisible()
    const deleteRequest = page.waitForRequest((request) =>
      request.url().includes('/api/admin/storage/file-2') && request.method() === 'DELETE'
    )

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm')
      await dialog.accept()
    })

    await summaryRow.locator('button').last().click()

    await deleteRequest

    await expect(
      page.getByRole('status').filter({ hasText: 'Objeto excluído' })
    ).toBeVisible()
    await expect(summaryRow).not.toBeVisible()
  })
})
