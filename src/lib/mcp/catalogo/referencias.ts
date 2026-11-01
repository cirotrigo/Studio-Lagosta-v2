/**
 * As tools de REFERÊNCIA DE LAYOUT (F1 da direção por referência, 01/11/2026): a página que o Ciro ajustou no editor
 * vira a geometria que o compositor segue para o cliente. Aprovar é curadoria (gate `curador`), separada da edição
 * comum da página; a revisão aprovada é imutável e a página viva pode seguir sendo editada.
 *
 * Carrega SEM env (os handlers alcançam o serviço por `await import()`), como todo arquivo do catálogo.
 */
import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeReferencias = [
  definirTool({
    nome: 'aprovar-referencia',
    descricao:
      'Aprova uma PÁGINA do editor como REFERÊNCIA DE LAYOUT do cliente: a geometria dela (caixa de cada papel de texto, alinhamento, âncora, caixa e canto da logo, linhas de cada papel) vira um arquétipo do cliente, `ref-<pageId>`, que compor-arte, compor-leva e medir-copy aceitam em `arquetipo.id`. A revisão aprovada é IMUTÁVEL: editar a página depois não muda as próximas peças; aprovar de novo cria a versão seguinte. Fonte, corpo e cor continuam da assinatura; a foto é a do pedido; o piso do projeto recorta a zona. Só compila página de foto inteira (bg-foto ou imagem ≥ 90%) com manchete e logo; o resto (fios, gradiente, fotos extras, textos sem papel) volta DITO em `leitura.ignoradas`. Confirme com a pessoa antes: a referência passa a valer para todo mundo que compõe para este cliente — e, a partir da primeira aprovada no formato, o CATÁLOGO de layouts deixa de valer para ele (ARQUETIPO_NAO_APROVADO): só as referências. Passe `versaoEsperada` (a versao do revisar-arte) para aprovar exatamente o que foi conferido. `revogar: true` tira a referência dos pedidos novos (as peças que nasceram dela seguem recompondo).',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      pageId: z.string().describe('A página do editor (de listar-modelos, get-template-pages ou do editor).'),
      revogar: z.boolean().optional().describe('true = revoga as revisões vigentes desta página em vez de aprovar.'),
      versaoEsperada: z.string().optional().describe('A `versao` da página que você conferiu (revisar-arte a devolve): se a página mudou depois, a aprovação é recusada (REFERENCIA_PAGINA_MUDOU) em vez de aprovar o que ninguém viu.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'curador' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ aprovarReferencia, revogarReferencia }, { quemDecidiu }] = await Promise.all([import('../../compositor/referencias'), import('../tools')])
      const projectId = args.projectId as number
      const pageId = args.pageId as string
      if (args.revogar === true) {
        const r = await revogarReferencia({ projectId, pageId })
        return { ...r, mensagem: r.revogadas > 0 ? `${r.revogadas} revisão(ões) de ref-${pageId} revogada(s): pedidos novos não a resolvem mais; as peças que nasceram dela seguem recompondo.` : 'Nenhuma revisão vigente desta página para revogar.' }
      }
      const r = await aprovarReferencia({ projectId, pageId, aprovadaPor: (await quemDecidiu(projectId, principal)) ?? null, ...(typeof args.versaoEsperada === 'string' ? { versaoEsperada: args.versaoEsperada } : {}) })
      return {
        arquetipo: r.arquetipo,
        revisao: { versao: r.revisao.versao, formato: r.revisao.formato, pageVersion: r.revisao.pageVersion, aprovadaEm: r.revisao.aprovadaEm },
        leitura: r.leitura,
        reaproveitada: r.reaproveitada,
        comoUsar: `compor-arte / compor-leva / medir-copy com "arquetipo": { "id": "${r.arquetipo.id}" } (formato ${r.revisao.formato}); a peça grava ${r.arquetipo.id}@${r.arquetipo.versao}.`,
        mensagem: r.reaproveitada
          ? `A página não mudou desde a revisão ${r.arquetipo.versao}: nada foi gravado — ela continua sendo a referência.`
          : `Referência aprovada: ${r.arquetipo.id}@${r.arquetipo.versao} (${r.revisao.formato}).${r.leitura.ignoradas.length ? ` ${r.leitura.ignoradas.length} camada(s) da página ficaram fora da referência (veja leitura.ignoradas).` : ''}`,
      }
    },
  }),

  definirTool({
    nome: 'listar-referencias',
    descricao:
      'Lista as referências de layout do cliente (as páginas aprovadas com aprovar-referencia), com o id de arquétipo `ref-<pageId>`, a versão vigente, o formato e se está revogada. É o que vale em `arquetipo.id` de compor-arte, compor-leva e medir-copy para este cliente; referência de outro cliente não resolve.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { listarReferencias } = await import('../../compositor/referencias')
      const linhas = await listarReferencias(args.projectId as number)
      const vigentes = linhas.filter((l) => !l.revogadaEm)
      return {
        referencias: linhas.map((l) => ({ arquetipoId: l.arquetipoId, versao: l.versao, pageId: l.pageId, pagina: l.pagina, formato: l.formato, aprovadaEm: l.aprovadaEm, revogadaEm: l.revogadaEm, impressao: l.impressao })),
        countVigentes: vigentes.length,
        ...(vigentes.length === 0 ? { aviso: 'Este cliente não tem referência de layout aprovada: os layouts do catálogo (ver-assinatura, campo arquetipos) são os únicos. Aprove uma página ajustada com aprovar-referencia.' } : {}),
      }
    },
  }),
]
