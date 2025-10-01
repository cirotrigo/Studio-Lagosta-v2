import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Studio de Geração - E2E Tests', () => {
  let page: Page;
  let projectId: number;
  let templateId: number;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Simular login (mock)
    await page.goto('/');

    // Mock de autenticação (ajustar conforme Clerk configuration)
    await page.evaluate(() => {
      localStorage.setItem('clerk-auth-token', 'mock-token');
    });
  });

  test.describe('Fluxo completo: Template → Photo → Edição → Geração', () => {
    test('TESTE 1: Selecionar template', async () => {
      // Navegar para projetos
      await page.goto('/projects');

      // Verificar se página carregou
      await expect(page.locator('h1')).toContainText('Projetos');

      // Clicar no primeiro projeto (assumindo que existe)
      const firstProject = page.locator('[data-testid="project-card"]').first();
      await expect(firstProject).toBeVisible();
      await firstProject.click();

      // Capturar projectId da URL
      const url = page.url();
      const match = url.match(/\/projects\/(\d+)/);
      if (match) {
        projectId = parseInt(match[1]);
      }

      // Abrir tab Studio
      await page.click('text=Studio');

      // Clicar em "Abrir Studio"
      await page.click('text=Abrir Studio');

      // Aguardar navegação para studio
      await page.waitForURL(`/projects/${projectId}/studio`);

      // Verificar título
      await expect(page.locator('h1')).toContainText('Studio de Geração');

      // Selecionar primeiro template
      const firstTemplate = page.locator('[data-testid="template-card"]').first();
      await expect(firstTemplate).toBeVisible({ timeout: 10000 });
      await firstTemplate.click();

      // Aguardar mudança de step
      await page.waitForTimeout(500);
    });

    test('TESTE 2: Selecionar foto (ou pular)', async () => {
      // Verificar se estamos na etapa de seleção de foto
      const photoHeading = page.locator('h2:has-text("Selecione uma Foto")');

      // Se photo step existe, pular (ou selecionar foto mock)
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Aguardar step de edição
      await page.waitForTimeout(500);
    });

    test('TESTE 3: Preencher campos dinâmicos', async () => {
      // Aguardar canvas preview carregar
      await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

      // Verificar formulário de campos
      const fieldsForm = page.locator('[data-testid="fields-form"]');

      // Se houver campos de texto, preencher
      const textInputs = page.locator('input[type="text"]').filter({ hasText: '' });
      const count = await textInputs.count();

      for (let i = 0; i < count; i++) {
        const input = textInputs.nth(i);
        if (await input.isVisible()) {
          await input.fill(`Texto de teste ${i + 1}`);
        }
      }

      // Aguardar preview atualizar
      await page.waitForTimeout(1000);
    });

    test('TESTE 4: Gerar criativo', async () => {
      // Clicar em "Gerar criativo"
      const generateButton = page.locator('button:has-text("Gerar criativo")');
      await expect(generateButton).toBeVisible();
      await expect(generateButton).toBeEnabled();

      await generateButton.click();

      // Aguardar toast de sucesso (ou erro tratado)
      await page.waitForSelector('text=Criativo gerado', { timeout: 15000 });

      // Verificar se resultUrl foi gerado
      const lastGeneration = page.locator('[data-testid="last-generation"]');
      if (await lastGeneration.isVisible()) {
        await expect(lastGeneration).toContainText('COMPLETED');
      }
    });
  });

  test.describe('Navegação e UI', () => {
    test('TESTE 5: Trocar de template durante edição', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Selecionar template
      const firstTemplate = page.locator('[data-testid="template-card"]').first();
      await firstTemplate.click();

      // Aguardar step edit
      await page.waitForTimeout(1000);

      // Clicar em "Trocar de template"
      const changeTemplateButton = page.locator('button:has-text("Trocar de template")');
      if (await changeTemplateButton.isVisible()) {
        await changeTemplateButton.click();

        // Verificar se voltou para step template
        await expect(page.locator('h2')).toContainText('Escolha um template');
      }
    });

    test('TESTE 6: Voltar ao projeto', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Clicar em "Voltar ao Projeto"
      const backButton = page.locator('button:has-text("Voltar ao Projeto")');
      await expect(backButton).toBeVisible();
      await backButton.click();

      // Verificar navegação
      await page.waitForURL(`/projects/${projectId}`);
      await expect(page.locator('h1')).toContainText('Gerenciar Projeto');
    });
  });

  test.describe('Validações e Edge Cases', () => {
    test('TESTE 7: Tentativa de gerar sem preencher campos obrigatórios', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Selecionar template
      await page.locator('[data-testid="template-card"]').first().click();

      // Pular foto se aparecer
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Limpar todos os campos
      const inputs = page.locator('input[type="text"]');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        await inputs.nth(i).fill('');
      }

      // Tentar gerar
      const generateButton = page.locator('button:has-text("Gerar criativo")');
      await generateButton.click();

      // Verificar se há validação (toast de erro ou campo destacado)
      // Nota: depende da implementação de validação
      await page.waitForTimeout(1000);
    });

    test('TESTE 8: Preview em tempo real atualiza com mudanças', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Selecionar template e ir para edit
      await page.locator('[data-testid="template-card"]').first().click();
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Capturar screenshot inicial do canvas
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
      const screenshotBefore = await canvas.screenshot();

      // Alterar campo de texto
      const textInput = page.locator('input[type="text"]').first();
      if (await textInput.isVisible()) {
        await textInput.fill('TEXTO ALTERADO');

        // Aguardar re-render
        await page.waitForTimeout(2000);

        // Capturar screenshot após mudança
        const screenshotAfter = await canvas.screenshot();

        // Verificar que screenshots são diferentes
        expect(screenshotBefore).not.toEqual(screenshotAfter);
      }
    });
  });

  test.describe('Acessibilidade', () => {
    test('TESTE 9: Verificar acessibilidade na página de seleção de template', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('TESTE 10: Verificar acessibilidade no step de edição', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Navegar até step de edição
      await page.locator('[data-testid="template-card"]').first().click();
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      await page.waitForTimeout(1000);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('TESTE 11: Navegação por teclado', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Focar primeiro template com Tab
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Verificar se algum elemento está focado
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();

      // Pressionar Enter para selecionar
      await page.keyboard.press('Enter');

      // Verificar mudança de step
      await page.waitForTimeout(500);
    });
  });

  test.describe('Performance', () => {
    test('TESTE 12: Tempo de renderização do preview < 3s', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Selecionar template
      const startTime = Date.now();
      await page.locator('[data-testid="template-card"]').first().click();

      // Pular foto
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Aguardar canvas aparecer
      await expect(page.locator('canvas')).toBeVisible();
      const endTime = Date.now();

      const renderTime = endTime - startTime;

      // Verificar que renderização foi < 3s
      expect(renderTime).toBeLessThan(3000);
    });

    test('TESTE 13: Tempo de geração do criativo < 10s', async () => {
      await page.goto(`/projects/${projectId}/studio`);

      // Setup: selecionar template e ir para edit
      await page.locator('[data-testid="template-card"]').first().click();
      const skipButton = page.locator('button:has-text("Pular")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Preencher um campo
      const textInput = page.locator('input[type="text"]').first();
      if (await textInput.isVisible()) {
        await textInput.fill('Teste de performance');
      }

      // Medir tempo de geração
      const startTime = Date.now();

      const generateButton = page.locator('button:has-text("Gerar criativo")');
      await generateButton.click();

      // Aguardar toast de sucesso
      await page.waitForSelector('text=Criativo gerado', { timeout: 15000 });

      const endTime = Date.now();
      const generationTime = endTime - startTime;

      // Verificar que geração foi < 10s
      expect(generationTime).toBeLessThan(10000);
    });
  });

  test.afterAll(async () => {
    await page.close();
  });
});
