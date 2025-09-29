import { test, expect } from '@playwright/test'

test.describe('Admin Configurações', () => {
  test('permite ajustar custos por funcionalidade', async ({ page }) => {
    const settings = {
      featureCosts: {
        ai_text_chat: 1,
        ai_image_generation: 5,
      },
      planCredits: {
        starter: 100,
      },
    }

    await page.route('**/api/admin/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(settings),
        })
        return
      }

      const body = route.request().postDataJSON() as typeof settings
      settings.featureCosts = body.featureCosts

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/admin/settings/features')

    await expect(page.getByRole('heading', { name: 'Custos por Funcionalidade' })).toBeVisible()
    const textChatInput = page
      .locator('label')
      .filter({ hasText: /ai text chat/i })
      .first()
      .locator('..')
      .locator('input')

    await textChatInput.fill('3')
    await expect(page.getByText('Alterações não salvas')).toBeVisible()

    const saveRequest = page.waitForRequest('**/api/admin/settings')
    await page.getByRole('button', { name: 'Salvar Configurações' }).click()
    await saveRequest

    await expect(
      page.getByRole('status').filter({ hasText: 'Configurações salvas' })
    ).toBeVisible()
    await expect(page.getByText('Alterações não salvas')).not.toBeVisible()
    await expect(textChatInput).toHaveValue('3')
  })
})
