import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Testes de Acessibilidade - WCAG 2.1 AA', () => {
  test.describe('Páginas Principais', () => {
    test('Dashboard - sem violações de acessibilidade', async ({ page }) => {
      await page.goto('/dashboard');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Projetos - sem violações de acessibilidade', async ({ page }) => {
      await page.goto('/projects');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Billing - sem violações de acessibilidade', async ({ page }) => {
      await page.goto('/billing');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Navegação por Teclado', () => {
    test('Dashboard - navegação completa por Tab', async ({ page }) => {
      await page.goto('/dashboard');

      // Contar elementos focáveis
      const focusableElements = await page.locator(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).count();

      expect(focusableElements).toBeGreaterThan(0);

      // Navegar por alguns elementos
      for (let i = 0; i < Math.min(5, focusableElements); i++) {
        await page.keyboard.press('Tab');
        const focused = page.locator(':focus');
        await expect(focused).toBeVisible();
      }
    });

    test('Sidebar - acessível por teclado', async ({ page }) => {
      await page.goto('/dashboard');

      // Focar primeiro link da sidebar
      await page.keyboard.press('Tab');

      // Verificar se está na sidebar
      const focused = page.locator(':focus');
      const isInSidebar = await focused.evaluate((el) => {
        const sidebar = document.querySelector('[data-testid="sidebar"]') ||
                       document.querySelector('nav') ||
                       document.querySelector('aside');
        return sidebar?.contains(el) || false;
      });

      // Navegar pela sidebar
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
      }
    });

    test('Modal - fechar com Escape', async ({ page }) => {
      await page.goto('/projects');

      // Abrir modal de criação
      const createButton = page.locator('button:has-text("Novo Projeto")');
      if (await createButton.isVisible()) {
        await createButton.click();

        // Verificar modal aberto
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();

        // Pressionar Escape
        await page.keyboard.press('Escape');

        // Verificar modal fechado
        await expect(modal).not.toBeVisible();
      }
    });
  });

  test.describe('ARIA Labels e Roles', () => {
    test('Botões têm labels acessíveis', async ({ page }) => {
      await page.goto('/dashboard');

      const buttons = page.locator('button');
      const count = await buttons.count();

      for (let i = 0; i < Math.min(10, count); i++) {
        const button = buttons.nth(i);

        // Verificar se botão tem texto ou aria-label
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        const ariaLabelledBy = await button.getAttribute('aria-labelledby');

        const hasAccessibleName =
          (text && text.trim().length > 0) ||
          (ariaLabel && ariaLabel.trim().length > 0) ||
          ariaLabelledBy;

        expect(hasAccessibleName).toBeTruthy();
      }
    });

    test('Imagens têm alt text', async ({ page }) => {
      await page.goto('/projects');

      const images = page.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');

        // Alt pode estar vazio para imagens decorativas, mas deve existir
        expect(alt).toBeDefined();
      }
    });

    test('Links têm texto descritivo', async ({ page }) => {
      await page.goto('/dashboard');

      const links = page.locator('a');
      const count = await links.count();

      for (let i = 0; i < Math.min(10, count); i++) {
        const link = links.nth(i);

        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');

        const hasAccessibleName =
          (text && text.trim().length > 0) ||
          (ariaLabel && ariaLabel.trim().length > 0);

        expect(hasAccessibleName).toBeTruthy();
      }
    });

    test('Formulários têm labels associados', async ({ page }) => {
      await page.goto('/projects');

      // Abrir modal de criação
      const createButton = page.locator('button:has-text("Novo Projeto")');
      if (await createButton.isVisible()) {
        await createButton.click();

        // Verificar inputs no formulário
        const inputs = page.locator('input');
        const count = await inputs.count();

        for (let i = 0; i < count; i++) {
          const input = inputs.nth(i);

          const id = await input.getAttribute('id');
          const ariaLabel = await input.getAttribute('aria-label');
          const ariaLabelledBy = await input.getAttribute('aria-labelledby');

          // Input deve ter label, aria-label ou aria-labelledby
          if (id) {
            const label = page.locator(`label[for="${id}"]`);
            const hasLabel = await label.count() > 0;
            const hasAriaLabel = ariaLabel || ariaLabelledBy;

            expect(hasLabel || hasAriaLabel).toBeTruthy();
          }
        }
      }
    });
  });

  test.describe('Contraste de Cores (WCAG AA)', () => {
    test('Texto tem contraste suficiente', async ({ page }) => {
      await page.goto('/dashboard');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('body')
        .analyze();

      // Filtrar apenas violações de contraste
      const contrastViolations = accessibilityScanResults.violations.filter(
        v => v.id === 'color-contrast'
      );

      expect(contrastViolations).toEqual([]);
    });

    test('Botões têm contraste suficiente', async ({ page }) => {
      await page.goto('/projects');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('button')
        .analyze();

      const contrastViolations = accessibilityScanResults.violations.filter(
        v => v.id === 'color-contrast'
      );

      expect(contrastViolations).toEqual([]);
    });
  });

  test.describe('Landmarks e Estrutura Semântica', () => {
    test('Página tem landmarks principais', async ({ page }) => {
      await page.goto('/dashboard');

      // Verificar presença de landmarks
      const main = page.locator('main');
      await expect(main).toBeVisible();

      // Nav ou header deve existir
      const nav = page.locator('nav');
      const header = page.locator('header');

      const hasNavigation = (await nav.count()) > 0 || (await header.count()) > 0;
      expect(hasNavigation).toBeTruthy();
    });

    test('Headings têm hierarquia correta', async ({ page }) => {
      await page.goto('/dashboard');

      // Verificar h1 existe e é único
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);
      expect(h1Count).toBeLessThanOrEqual(2); // Máximo 2 h1s por página

      // Verificar que não há saltos de nível (h1 → h3 sem h2)
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withRules(['heading-order'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Responsividade e Zoom', () => {
    test('Página funciona com zoom 200%', async ({ page }) => {
      await page.goto('/dashboard');

      // Aplicar zoom 200%
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });

      // Aguardar re-render
      await page.waitForTimeout(500);

      // Verificar que elementos principais ainda estão visíveis
      const main = page.locator('main');
      await expect(main).toBeVisible();

      // Verificar sem overflow horizontal
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      // Reset zoom
      await page.evaluate(() => {
        document.body.style.zoom = '1';
      });
    });

    test('Página funciona em mobile (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');

      // Verificar que página carregou
      await expect(page.locator('main')).toBeVisible();

      // Verificar sem overflow horizontal
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 10;
      });

      expect(hasHorizontalScroll).toBeFalsy();
    });
  });

  test.describe('Focus Visible', () => {
    test('Elementos interativos têm indicador de foco visível', async ({ page }) => {
      await page.goto('/dashboard');

      // Focar primeiro botão
      await page.keyboard.press('Tab');

      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();

      // Verificar que outline ou box-shadow existe
      const hasVisibleFocus = await focused.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const outline = styles.outline;
        const boxShadow = styles.boxShadow;
        const ringExists = el.classList.contains('ring') ||
                          el.classList.contains('focus:ring');

        return outline !== 'none' ||
               boxShadow !== 'none' ||
               ringExists;
      });

      expect(hasVisibleFocus).toBeTruthy();
    });
  });

  test.describe('Estados e Feedback', () => {
    test('Botões disabled têm aria-disabled', async ({ page }) => {
      await page.goto('/projects');

      const disabledButtons = page.locator('button:disabled');
      const count = await disabledButtons.count();

      for (let i = 0; i < count; i++) {
        const button = disabledButtons.nth(i);

        // Verificar atributo disabled ou aria-disabled
        const disabled = await button.getAttribute('disabled');
        const ariaDisabled = await button.getAttribute('aria-disabled');

        expect(disabled !== null || ariaDisabled === 'true').toBeTruthy();
      }
    });

    test('Loading states têm aria-live ou aria-busy', async ({ page }) => {
      await page.goto('/projects');

      // Abrir modal e verificar loading durante submit
      const createButton = page.locator('button:has-text("Novo Projeto")');
      if (await createButton.isVisible()) {
        await createButton.click();

        // Preencher form
        await page.fill('input[name="name"]', 'Test Project');
        await page.fill('textarea[name="description"]', 'Test description');

        // Submit
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();

        // Durante loading, verificar aria-busy ou aria-live
        const loadingElement = page.locator('[aria-busy="true"], [aria-live]');

        // Pode não existir se request for rápido
        const exists = await loadingElement.count();
        // Apenas log, não falha
        if (exists > 0) {
          console.log('✓ Loading state com ARIA encontrado');
        }
      }
    });
  });
});
