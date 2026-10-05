import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { avisoDaIndexacaoPendente, indexacaoPendenteDe } from '../marca-de-indexado'

/**
 * PR13-50 (revisão final do Codex, 18/09/2026): as rotas de edição da base
 * respondem 202 com `indexacao: 'pendente'` e `aviso`, e os três chamadores
 * (chat, chat do template, edição no admin) engoliam o aviso. A tela lê a
 * resposta de SUCESSO por `avisoDaIndexacaoPendente` e mostra sem bloquear.
 */
describe('o aviso da indexação pendente chega à tela (PR13-50)', () => {
  for (const code of ['INDEXACAO_PERDIDA', 'INDEXACAO_SUPERADA', 'INDEXACAO_EM_ANDAMENTO'] as const) {
    it(`202 com ${code}: "edição salva" e o aviso da rota`, () => {
      const pendente = indexacaoPendenteDe(Object.assign(new Error('x'), { code }))
      // A forma que as duas rotas devolvem (confirm e admin/knowledge/[id]).
      const corpo = { success: true, entryId: 'e1', indexacao: 'pendente', code: pendente?.code, aviso: pendente?.aviso }
      const aviso = avisoDaIndexacaoPendente(corpo)
      expect(aviso).toBe(pendente?.aviso)
      expect(aviso).toMatch(/edição foi salva/i)
    })
  }

  it('pendente sem aviso ainda avisa; 200 normal não avisa nada', () => {
    expect(avisoDaIndexacaoPendente({ indexacao: 'pendente' })).toMatch(/salva/)
    expect(avisoDaIndexacaoPendente({ success: true, entryId: 'e1' })).toBeNull()
    expect(avisoDaIndexacaoPendente(null)).toBeNull()
  })

  it('os três fluxos leem a resposta de sucesso pelo helper', () => {
    for (const f of ['src/app/(protected)/ai-chat/page.tsx', 'src/components/templates/template-ai-chat.tsx', 'src/app/admin/knowledge/[id]/edit/page.tsx']) {
      expect(readFileSync(resolve(__dirname, '../../../..', f), 'utf8'), f).toMatch(/avisoDaIndexacaoPendente\(/)
    }
  })
})
