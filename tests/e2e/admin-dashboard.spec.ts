import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test('exibe métricas principais com dados agregados', async ({ page }) => {
    const dashboardPayload = {
      totalUsers: 150,
      activeUsers: 120,
      totalCredits: 4500,
      usedCredits: 2100,
      mrrSeries: [
        { label: 'Set', value: 1200 },
        { label: 'Out', value: 1400 },
      ],
      arrSeries: [
        { label: '2023', value: 12000 },
        { label: '2024', value: 16800 },
      ],
      churnSeries: [
        { label: 'Set', value: 6 },
        { label: 'Out', value: 4 },
      ],
      recentActivity: [],
    }

    await page.route('**/api/admin/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dashboardPayload),
      })
    })

    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Painel do Administrador' })).toBeVisible()

    const totalUsersCard = page.locator('div').filter({ hasText: 'Total de Usuários' })
    await expect(totalUsersCard.getByText('150')).toBeVisible()

    const activeUsersCard = page.locator('div').filter({ hasText: 'Usuários Ativos' })
    await expect(activeUsersCard.getByText('120')).toBeVisible()

    await expect(page.getByText('+16.7 MoM')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'MRR' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ARR' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Churn' })).toBeVisible()
  })
})
