/**
 * O controle positivo dos pilotos (CP5c/CP5d): fundo liso escuro, três textos claros, sem foto e sem logo — uma peça que a
 * medição REAL aprova. Compartilhada por `piloto-portao.test.ts` (agendar-leva) e `piloto-ciclo.test.ts` (ajustar-arte).
 */
import type { Layer } from '@/types/template'

/** O controle positivo: fundo liso escuro, três textos claros, sem foto e sem logo — uma peça que a medição REAL aprova. */
export const textoLimpo = (id: string, papel: string, y: number, fontSize: number, content: string): Layer =>
  ({
    id, name: id, type: 'text', visible: true, locked: false, order: 3, content,
    position: { x: 100, y }, size: { width: 880, height: Math.round(fontSize * 1.5) },
    style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#FFFFFF' },
    metadata: { compositor: { papel } },
  }) as Layer
export const PECA_LIMPA = {
  layers: [textoLimpo('headline', 'headline', 400, 84, 'Texto headline'), textoLimpo('apoio', 'apoio', 560, 40, 'Texto apoio'), textoLimpo('servico', 'servico', 1500, 32, 'Texto servico')],
  background: '#000000',
  copy: {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', superficie: 'chat' },
    revisoes: [],
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Texto headline'] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Texto apoio'] },
      { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Texto servico'] },
    ],
  },
}

