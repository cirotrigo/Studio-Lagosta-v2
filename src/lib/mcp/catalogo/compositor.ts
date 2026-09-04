/**
 * Catálogo · compositor (a usina de arte do editor — plano editor-como-usina).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; serviço e
 * helpers por `await import()` relativo dentro do handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

const bloco = z.object({
  papel: z
    .enum(['pre', 'headline', 'apoio', 'cta', 'servico'])
    .describe('O papel do texto: pre (pré-título curto), headline (a manchete), apoio (a frase de apoio), cta (a chamada), servico (horário/endereço — vai para o rodapé).'),
  linhas: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe('As linhas do bloco, JÁ quebradas como devem aparecer (uma string por linha). Headline em 1-2 linhas curtas; apoio em 1-2 linhas.'),
})

const preferencias = z
  .object({
    ancora: z.enum(['topo', 'meio', 'rodape', 'auto']).optional().describe('Onde o bloco de texto pousa. "auto" (default) deixa a foto decidir — a área mais calma ganha.'),
    alinha: z.enum(['esquerda', 'centro', 'direita', 'auto']).optional().describe('Alinhamento do bloco. "auto" (default) segue a área livre da foto.'),
    cantoDaMarca: z
      .enum(['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito', 'auto', 'nenhum'])
      .optional()
      .describe('Canto da logo. "auto" (default) escolhe o canto mais calmo e escuro que não encosta no texto; "nenhum" tira a logo.'),
    enquadramento: z.enum(['auto', 'fixo']).optional().describe('"auto" (default) deixa o compositor deslocar o corte da foto para abrir área livre; "fixo" mantém o centro.'),
    variante: z.string().optional().describe('Nome (ou tag) de uma variante da assinatura, quando o cliente tem mais de uma página no formato (ver-assinatura lista). Sem isso: foto clara/escura escolhe entre as marcadas, e o rodízio varia entre as demais.'),
  })
  .optional()

const spec = {
  projectId: z.number().describe('ID do cliente.'),
  formato: z.enum(['story', 'feed', 'quadrado']).describe('story (1080x1920), feed (1080x1350) ou quadrado (1080x1080).'),
  fotoDriveId: z.string().optional().describe('A foto do acervo (driveFileId de buscar-fotos). Preferido: liga a peça ao rodízio de fotos.'),
  fotoUrl: z.string().optional().describe('URL pública da foto, quando ela não está no acervo (ex.: fotoUrl de ver-foto-enviada).'),
  blocos: z.array(bloco).min(1).max(5).describe('A copy por papel. Um bloco por papel; a ordem dos papéis é a ordem de leitura.'),
  preferencias,
  nome: z.string().optional().describe('Nome da peça na galeria (opcional).'),
  tema: z.string().optional().describe('Tema/assunto, para o registro e o rodízio de layout.'),
  itemDePlanoId: z.string().optional().describe('Quando a peça é de um item de plano: o id do item (ver-plano).'),
  planoId: z.string().optional(),
  quando: z.string().optional().describe('Data/hora prevista (ISO), só para registro.'),
}

function specDe(args: Record<string, unknown>) {
  return {
    projectId: args.projectId,
    formato: args.formato,
    ...(args.fotoDriveId || args.fotoUrl ? { foto: { ...(args.fotoDriveId ? { driveFileId: args.fotoDriveId } : {}), ...(args.fotoUrl ? { url: args.fotoUrl } : {}) } } : {}),
    blocos: args.blocos,
    ...(args.preferencias ? { preferencias: args.preferencias } : {}),
    ...(args.nome ? { nome: args.nome } : {}),
    ...(args.tema ? { tema: args.tema } : {}),
    ...(args.itemDePlanoId ? { itemDePlanoId: args.itemDePlanoId } : {}),
    ...(args.planoId ? { planoId: args.planoId } : {}),
    ...(args.quando ? { quando: args.quando } : {}),
  }
}

export const toolsDoCompositor = [
  definirTool({
    nome: 'reverter-arte',
    descricao:
      'Volta uma peça do compositor para como ela nasceu — desfaz o que foi ajustado no editor depois. Só peça composta (compor-arte/compor-leva) tem esse histórico. Os posts agendados que usam a página voltam à fila de render. Use quando a pessoa disser "voltou pior, desfaz" ou "quero a versão original".',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      generationId: z.string().describe('A arte (id de compor-arte / ver-geracao).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { reverterCamadasDaArte } = await import('../../compositor/reverter')
      return reverterCamadasDaArte(args.generationId as string, { projectId: args.projectId as number })
    },
  }),

  definirTool({
    nome: 'ver-ajustes-da-assinatura',
    descricao:
      'O que a equipe muda SISTEMATICAMENTE nas peças do compositor deste cliente (fonte encolhida, bloco deslocado, logo movida, alinhamento trocado) e o placar gostei/melhorar por posição do texto — destilado em PROPOSTAS de ajuste da assinatura, para a pessoa aprovar. Nunca aplica nada sozinho: quem muda a página de assinatura ou os números é gente. Use quando a pessoa perguntar "o que a equipe mais corrige?" ou antes de mexer na assinatura.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      dias: z.number().int().min(7).max(365).optional().describe('Janela em dias (default 60).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { destilarGeometria } = await import('../../aprendizado/destilar-geometria')
      const r = await destilarGeometria(args.projectId as number, typeof args.dias === 'number' ? args.dias : 60)
      return {
        ...r,
        nota:
          r.sinais === 0
            ? 'Ainda não há edição registrada em peça do compositor deste cliente — o sinal nasce quando a equipe ajusta uma peça composta no editor.'
            : 'Propostas são para aprovação humana: ajustar é abrir a página de assinatura no editor (estilo) ou Project.assinatura (números).',
      }
    },
  }),

  definirTool({
    nome: 'ver-assinatura',
    descricao:
      'Mostra a assinatura de composição do cliente: quais papéis de texto (pre, headline, apoio, cta, servico) a página de assinatura define, com fonte, tamanho e cor, a logo e os números (margens, safe area, faixa do halo). Use ANTES de compor-arte para saber o que o cliente tem — sem assinatura o compositor não compõe. Também diz o link para a equipe ajustar a assinatura no editor.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      formato: z.enum(['story', 'feed', 'quadrado']).optional().describe('Formato a conferir (default story).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { carregarAssinatura } = await import('../../compositor/compor')
      const { getPublicAppUrl } = await import('../../creatives/persist')
      const projectId = args.projectId as number
      const formato = (args.formato as 'story' | 'feed' | 'quadrado' | undefined) ?? 'story'
      const a = await carregarAssinatura(projectId, formato)
      const { paginasDeAssinatura } = await import('../../compositor/compor')
      const { templateId, paginas } = await paginasDeAssinatura(projectId)
      const template = templateId ? { id: templateId } : null
      return {
        temAssinatura: Boolean(a.origem.pageId),
        formatoDaPagina: a.origem.formatoDaPagina,
        variantes: paginas.map((p) => ({ id: p.id, nome: p.name, formato: p.formato, papeis: p.papeis, aceitaServico: p.papeis.includes('servico'), tags: p.tags.filter((t) => t !== 'assinatura') })),
        papeis: Object.fromEntries(
          Object.entries(a.papeis).map(([papel, e]) => [
            papel,
            { fonte: e.fontFamily, tamanho: e.fontSize, cor: e.color, caixa: e.textTransform ?? 'como escrito', ...(e.prefixo ? { prefixo: e.prefixo.trim() } : {}) },
          ]),
        ),
        logo: a.logo ? { largura: a.logo.largura } : null,
        numeros: a.numeros,
        editorUrl: template ? `${getPublicAppUrl()}/templates/${template.id}/editor` : null,
        dica: a.origem.pageId
          ? 'A equipe ajusta fonte, tamanho e cor de cada papel abrindo a página de assinatura no editor; o próximo lote sai com a mudança.'
          : 'Este cliente ainda não tem página de assinatura. Peça para a equipe criar (template "Assinatura", uma página por formato com camadas de texto chamadas pre, headline, apoio, cta, servico).',
      }
    },
  }),

  definirTool({
    nome: 'compor-arte',
    descricao:
      'Compõe UMA arte pelo EDITOR, sem crédito de imagem: a copy (por papel e por linha) pousa na área livre da foto — o compositor mede a foto, escolhe posição e enquadramento, calibra o halo de leitura e põe a logo no canto pela luz — e a peça nasce como página editável, onde a equipe ajusta na mão. Use para peça avulsa ou para testar antes de uma leva (compor-leva). Sem foto, a peça sai sobre o fundo liso da marca.\n\nAntes: ver-assinatura (o cliente precisa de página de assinatura) e consultar-dna/consultar-base para a copy. A COPY É ESCRITA SOBRE OS PAPÉIS QUE A VARIANTE TEM — ver-assinatura lista os papéis de cada variante por formato; papel que a página não tem (um feed sem servico, uma story sem pre) NÃO entra na peça e o texto fica de fora com aviso. Nunca escreva um bloco para um campo que o template não tem. Se a resposta disser "texto não cabe", reescreva com o orçamento devolvido (caracteres que cabem por linha) — nunca insista igual.\n\nprovar: true renderiza e devolve só a prova (URL do PNG + diagnóstico), sem gravar nada na galeria.',
    schema: z.object({
      ...spec,
      provar: z.boolean().optional().describe('true = só a prova (PNG + diagnóstico), nada gravado. Default false: grava a peça na galeria como página editável.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ comporPeca }, { quemDecidiu, canalDoPrincipal }] = await Promise.all([import('../../compositor/compor'), import('../tools')])
      const projectId = args.projectId as number
      const s = specDe(args)
      const decididoPor = await quemDecidiu(projectId, principal)
      const r = await comporPeca(s, { provar: args.provar === true, decididoPor, autor: decididoPor, canal: canalDoPrincipal(principal) })
      const d = r.diagnostico
      const resumo = {
        posicao: `${d.posicao.ancora}/${d.posicao.alinha}`,
        enquadramento: d.posicao.crop,
        logo: d.logo?.canto ?? 'sem logo',
        halo: d.halos.map((h) => ({ bloco: h.grupo, tinta: h.tinta })),
        contraste: d.contraste?.map((c) => ({ bloco: c.grupo, ok: c.ok, p98: c.p98ComHalo, alvo: Math.round(c.alvo) })) ?? null,
        avisos: d.avisos,
      }
      if (r.prova) {
        const { put } = await import('@vercel/blob')
        const blob = await put(`compor/provas/${projectId}-${Date.now()}.png`, r.prova, { access: 'public', contentType: 'image/png' })
        return { prova: true, imageUrl: blob.url, ...resumo }
      }
      const p = r.persistido!
      return {
        generationId: p.generationId,
        pageId: p.pageId,
        imageUrl: p.url,
        editUrl: p.editUrl,
        galleryUrl: p.galleryUrl,
        ...resumo,
        nota: 'A peça é uma página editável: o link editUrl abre no editor, onde a equipe move, redimensiona e reescreve; o halo acompanha o texto.',
      }
    },
  }),

  definirTool({
    nome: 'compor-leva',
    descricao:
      'Compõe VÁRIAS artes pelo editor de uma vez (uma semana, uma sessão de fotos), sem crédito de imagem. Cada item vira uma peça na fila durável — nada espera na conversa: a resposta traz os ids para acompanhar com ver-geracao, e as peças aparecem na galeria em poucos minutos (a fila roda de minuto em minuto, ~12 peças por varredura). Mesmos campos de compor-arte por item. Teto de 60 itens.\n\nUse depois de montar a copy de cada peça (consultar-dna + consultar-base) e de escolher as fotos (buscar-fotos, sem repetir na leva). Antes de uma leva grande, prove UMA peça com compor-arte e mostre à pessoa.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      itens: z
        .array(
          z.object({
            formato: spec.formato,
            fotoDriveId: spec.fotoDriveId,
            fotoUrl: spec.fotoUrl,
            blocos: spec.blocos,
            preferencias,
            nome: spec.nome,
            tema: spec.tema,
            itemDePlanoId: spec.itemDePlanoId,
            planoId: spec.planoId,
            quando: spec.quando,
          }),
        )
        .min(1)
        .max(60)
        .describe('As peças da leva, uma por item.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ enfileirarPeca }, { quemDecidiu, canalDoPrincipal }] = await Promise.all([import('../../compositor/fila'), import('../tools')])
      const projectId = args.projectId as number
      const decididoPor = await quemDecidiu(projectId, principal)
      const itens = args.itens as Array<Record<string, unknown>>
      const enfileiradas: Array<{ indice: number; generationId: string; nome: string | null }> = []
      const falhas: Array<{ indice: number; erro: string }> = []
      // Em SÉRIE, como todo lote da casa: cada item valida e grava sozinho.
      for (const [indice, item] of itens.entries()) {
        try {
          const r = await enfileirarPeca(specDe({ ...item, projectId }), { decididoPor, autor: decididoPor, canal: canalDoPrincipal(principal) })
          enfileiradas.push({ indice, generationId: r.generationId, nome: (item.nome as string | undefined) ?? null })
        } catch (erro) {
          falhas.push({ indice, erro: erro instanceof Error ? erro.message : String(erro) })
        }
      }
      return {
        enfileiradas: enfileiradas.length,
        falhas,
        pecas: enfileiradas,
        nota: 'As peças entram na galeria conforme a fila roda (ver-geracao com cada generationId). Nada foi cobrado.',
      }
    },
  }),
]
