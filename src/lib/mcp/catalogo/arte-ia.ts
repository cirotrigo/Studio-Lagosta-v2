/**
 * Catálogo · arte por IA (PR 4 da migração para o registro).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db, sharp e
 * serviços entram por `await import()` relativo dentro do handler.
 *
 * As referências com papel têm DOIS shapes de propósito: o de gerar-imagem
 * carrega descrições e o campo `generationId` (modelo a seguir); o do lote é
 * enxuto e vale idêntico para `referenciasBase` e para cada variação — um
 * único zod derivando o mesmo JSON nos dois lugares, no lugar das 60 linhas
 * coladas duas vezes do literal antigo.
 *
 * `textosLivres` de criar-arte usa `.passthrough()` porque o literal antigo
 * NÃO fechava esses objetos (sem additionalProperties) — estritar aqui
 * recusaria chamada que sempre funcionou.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'
import { ErroDeTool } from '../registro/tipos'
import type { ArtGenerationReference } from '../../ai/creative-generation-runner'

const FORMATOS = ['story', 'feed', 'quadrado'] as const
const PAPEIS_DE_REFERENCIA = ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] as const

/**
 * Teto do lote. 12 é o tamanho de uma grade semanal com folga — e o que cabe
 * numa invocação só criando as Generations (a geração roda na fila durável).
 */
const MAX_LOTE = 12

/** Referências do gerar-imagem — com descrições e o `generationId` do modo "modelo a seguir". */
const referenciaComPapel = z
  .object({
    role: z.enum(PAPEIS_DE_REFERENCIA).describe('Papel da foto na geração.'),
    driveFileId: z.string().optional().describe('Foto do acervo (de buscar-fotos / listar-fotos-da-pasta).'),
    url: z.string().optional().describe('Alternativa: URL de imagem já no Studio (Blob).'),
    label: z.string().optional().describe('Rótulo curto (ex: "salão principal", "picanha na tábua").'),
    generationId: z
      .string()
      .optional()
      .describe(
        'Só em role "style": o id da arte deste projeto que serve de MODELO. Com ele a peça nova copia a DIAGRAMAÇÃO daquela arte — posição do texto, alinhamento, caixa das letras, cor por nível e ornamentos —, mudando só a foto e a copy. Sem ele, a referência combina apenas clima e luz, e o layout continua livre. Use quando alguém disser "faz parecida com aquela".',
      ),
    excluir: z
      .array(z.string())
      .optional()
      .describe(
        'O que NÃO reproduzir desta foto (ex: ["garrafa de molho", "lata de refrigerante"]). Use para marca de terceiro que aparece na foto e não pode ir para a peça — dizer isso dentro do `pedido` não segura: na produção do By Rock a garrafa de Tabasco vazou em 2 de 6 peças mesmo com a instrução explícita.',
      ),
  })
  .strict()

/** Referências do lote — enxutas; o MESMO shape serve base e variação. */
const referenciaDoLote = z
  .object({
    role: z.enum(PAPEIS_DE_REFERENCIA),
    driveFileId: z.string().optional(),
    url: z.string().optional(),
    label: z.string().optional(),
    excluir: z.array(z.string()).optional(),
  })
  .strict()

/** Normaliza referências vindas do parse para o formato do runner. */
function lerReferencias(v: unknown): ArtGenerationReference[] {
  return Array.isArray(v)
    ? v
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
          role: r.role as ArtGenerationReference['role'],
          driveFileId: typeof r.driveFileId === 'string' && r.driveFileId ? r.driveFileId : undefined,
          url: typeof r.url === 'string' && r.url ? r.url : undefined,
          label: typeof r.label === 'string' && r.label ? r.label.slice(0, 80) : undefined,
          // Procedência conferida no serviço: id que não é deste projeto é
          // descartado e a referência segue valendo como clima.
          generationId: typeof r.generationId === 'string' && r.generationId ? r.generationId : undefined,
          excluir: Array.isArray(r.excluir)
            ? (r.excluir as unknown[])
                .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
                .slice(0, 6)
                .map((e) => e.slice(0, 60))
            : undefined,
        }))
    : []
}

export const toolsDeArteIA = [
  definirTool({
    nome: 'criar-arte',
    apelidos: ['create-arte-livre'],
    descricao:
      'Cria a arte do zero, sem depender de modelo cadastrado — é o caminho padrão. Escolha a foto, o formato e componha o texto: o mais seguro é usar uma das composições prontas (listar-combinacoes-de-texto) e só trocar as palavras. O logo entra sozinho e a foto recebe um sombreado para o texto não sumir. Mantenha os textos curtos: story se lê em dois segundos, e frase comprida estoura a caixa. Devolve a imagem e um link para ajustar no editor.',
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
      formato: z
        .enum(FORMATOS)
        .optional()
        .describe('story 1080x1920 (default), feed 1080x1350, quadrado 1080x1080.'),
      imageUrl: z.string().optional().describe('URL pública da foto de fundo.'),
      driveImageId: z.string().optional().describe('ID do arquivo no Google Drive, alternativa ao imageUrl.'),
      backgroundColor: z.string().optional().describe('Cor de fundo quando não houver foto (ex: "#111111").'),
      overlay: z
        .enum(['nenhum', 'inferior', 'superior', 'completo'])
        .optional()
        .describe('Escurecimento sobre a foto. Default "inferior".'),
      combinationId: z.string().optional().describe('ID da combinação tipográfica (ver list-font-combinations).'),
      textos: z
        .record(z.string())
        .optional()
        .describe(
          'Textos da combinação, por id ou label do elemento. Ex: {"titulo":"HAPPY HOUR","detalhes":"Todo dia até as 20h"}.',
        ),
      textosLivres: z
        .array(
          z
            .object({
              texto: z.string().describe('Conteúdo. \n quebra linha.'),
              x: z.number().describe('Canto esquerdo, fração da largura (0..1).'),
              y: z.number().describe('Topo, fração da altura (0..1).'),
              width: z.number().describe('Largura da caixa, fração da largura (0..1).'),
              fontSize: z.number().describe('Corpo em px na base de 1080 de largura.'),
              role: z
                .enum(['title', 'subtitle', 'body'])
                .optional()
                .describe('De qual fonte da marca herda. subtitle cai na fonte de corpo quando a marca não define uma própria.'),
              fontFamily: z.string().optional(),
              fontWeight: z.string().optional(),
              textTransform: z.enum(['none', 'uppercase']).optional(),
              textAlign: z.enum(['left', 'center', 'right']).optional(),
              lineHeight: z.number().optional(),
              letterSpacing: z.number().optional(),
              color: z.string().optional(),
            })
            .passthrough(),
        )
        .optional()
        .describe('Blocos posicionados por você. Alternativa à combinação.'),
      logo: z.boolean().optional().describe('Inclui o logo da marca (default true).'),
      name: z.string().optional().describe('Nome da página gerada.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { createArteLivre } = await import('../../creatives/arte-livre')
      return createArteLivre({
        projectId: args.projectId as number,
        formato: args.formato,
        imageUrl: args.imageUrl,
        driveImageId: args.driveImageId,
        backgroundColor: args.backgroundColor,
        overlay: args.overlay,
        combinationId: args.combinationId,
        textos: args.textos,
        // O runtime garante os obrigatórios; o `z.infer` deste tsconfig
        // (strict: false) marca tudo opcional — mesma ressalva da casa.
        textosLivres: args.textosLivres as never,
        logo: args.logo,
        name: args.name,
      })
    },
  }),

  definirTool({
    nome: 'ajustar-arte',
    descricao:
      'Ajusta uma arte já criada aqui: troca textos e/ou a foto na MESMA página e re-renderiza. Use depois de conferir-arte, quando algo saiu errado — texto estourando a caixa, foto ruim, erro de digitação. As chaves de slotValues são as mesmas da criação (id ou nome da camada; conferir-arte e o retorno da criação mostram os nomes).\n\nNão serve para páginas-modelo do cliente (essas se editam no editor). Se a arte já estiver em algum post da agenda, a arte do post é atualizada junto (re-render automático em alguns minutos).\n\nATENÇÃO: post agendado é enviado para publicação 5 minutos antes do horário, e a partir daí a arte dele NÃO muda mais. Se a resposta trouxer `aviso`, repita-o para a pessoa — o ajuste valeu para a página, mas aquele post vai ao ar com a arte anterior. Para trocar mesmo: voltar-para-rascunho, ajustar, e agendar de novo.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      pageId: z.string().describe('A arte a ajustar (pageId devolvido por criar-arte ou criar-arte-de-modelo).'),
      slotValues: z
        .record(z.any())
        .optional()
        .describe('Só o que muda: chave = id ou nome da camada, valor = novo texto (string) ou {content, fileUrl}.'),
      imageUrl: z.string().optional().describe('Nova foto de fundo (URL pública).'),
      driveImageId: z.string().optional().describe('Nova foto de fundo pelo id do Drive (de buscar-fotos).'),
      name: z.string().optional().describe('Novo nome da página (opcional).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ ajustarArte }, { quemDecidiu, canalDoPrincipal }] = await Promise.all([
        import('../../creatives/arte-rapida'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const r = await ajustarArte({
        projectId,
        pageId: args.pageId as string,
        slotValues: (args.slotValues ?? {}) as Record<string, unknown>,
        imageUrl: typeof args.imageUrl === 'string' ? args.imageUrl : undefined,
        driveImageId: typeof args.driveImageId === 'string' ? args.driveImageId : undefined,
        name: typeof args.name === 'string' ? args.name : undefined,
        decididoPor: await quemDecidiu(projectId, principal),
        canal: canalDoPrincipal(principal),
      })

      /**
       * O ajuste vale para a página, mas post já entregue ao publicador vai ao
       * ar com a arte anterior. Sem esta frase o chat responde "pronto,
       * ajustei" e a pessoa só descobre a divergência quando o post sai — que
       * é exatamente o defeito que a janela de congelamento veio corrigir.
       */
      if (r.postsCongelados && r.postsCongelados > 0) {
        const n = r.postsCongelados
        return {
          ...r,
          aviso:
            `Atenção: ${n === 1 ? '1 post desta arte já foi enviado' : `${n} posts desta arte já foram enviados`} ` +
            `para publicação e ${n === 1 ? 'vai sair' : 'vão sair'} com a arte ANTERIOR — o ajuste não ${n === 1 ? 'o' : 'os'} alcança. ` +
            `Para trocar de verdade: voltar-para-rascunho, ajustar e agendar de novo.`,
        }
      }

      return r
    },
  }),

  definirTool({
    nome: 'conferir-arte',
    descricao:
      'Mostra a arte para VOCÊ ver (miniatura na resposta) e confere por visão se os textos saíram exatamente como deveriam. Use depois de criar ou ajustar uma arte, antes de mostrá-la à pessoa — é o que pega texto cortado, sobreposto ou com erro. Informe generationId (arte da galeria) ou postId (arte atual de um post da agenda).',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      generationId: z
        .string()
        .optional()
        .describe('A arte (vem de criar-arte, criar-arte-de-modelo ou ajustar-arte).'),
      postId: z.string().optional().describe('Alternativa: confere a arte ATUAL de um post da agenda.'),
      verificarTextos: z
        .boolean()
        .optional()
        .describe('Roda a conferência de texto por visão (default true; só quando há textos de referência).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [
        { db },
        { CreativeError },
        { fetchImageSource },
        { loadExpectedTextsForGeneration, verifyImageTexts },
        { registerProjectFonts },
        { createServerTextBoxMeasurer },
        { checkTextGeometry },
        { parseLayers },
        sharpModulo,
      ] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
        import('../../ai/fetch-image-source'),
        import('../../ai/creative-text-verification'),
        import('../../posts/register-project-fonts'),
        import('../../creatives/server-text-measurer'),
        import('../../creatives/text-geometry'),
        import('../../creatives/arte-rapida'),
        import('sharp'),
      ])
      const sharp = sharpModulo.default
      const projectId = args.projectId as number

      let url: string | null = null
      let textRefGenerationId: string | null = null
      let pageIdRef: string | null = null

      if (typeof args.generationId === 'string' && args.generationId) {
        const gen = await db.generation.findFirst({
          where: { id: args.generationId, projectId },
          select: { id: true, resultUrl: true, fieldValues: true },
        })
        if (!gen) {
          throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
        }
        url = gen.resultUrl
        textRefGenerationId = gen.id
        const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
        pageIdRef =
          typeof fv.pageId === 'string'
            ? fv.pageId
            : fv.source === 'ajuste-arte' && typeof fv.sourcePageId === 'string'
              ? fv.sourcePageId
              : null
      } else if (typeof args.postId === 'string' && args.postId) {
        const post = await db.socialPost.findFirst({
          where: { id: args.postId, projectId },
          select: { mediaUrls: true, generationId: true, pageId: true },
        })
        if (!post) {
          throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste cliente.', 404)
        }
        url = post.mediaUrls?.[0] ?? null
        textRefGenerationId = post.generationId
        pageIdRef = post.pageId
      } else {
        throw new Error('Informe generationId ou postId.')
      }

      if (!url) {
        throw new CreativeError('SEM_IMAGEM', 'Esta arte ainda não tem imagem para conferir.', 400)
      }

      const { buffer } = await fetchImageSource(url)
      const meta = await sharp(buffer).metadata()
      const thumb = await sharp(buffer)
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()

      const expected = textRefGenerationId
        ? await loadExpectedTextsForGeneration(textRefGenerationId)
        : []

      let verificacaoTexto: Record<string, unknown> | string = 'sem-referencia'
      if (args.verificarTextos !== false && expected.length > 0) {
        try {
          const check = await verifyImageTexts(buffer, expected)
          verificacaoTexto = check.passed
            ? { resultado: 'ok', textosConferidos: expected.length }
            : { resultado: 'divergente', faltando: check.missing, transcricao: check.extracted.slice(0, 20) }
        } catch (erro) {
          verificacaoTexto = `indisponivel: ${erro instanceof Error ? erro.message : String(erro)}`
        }
      }

      // Leitura que falhou + camadas sobrepostas na página = o diagnóstico
      // certo é SOBREPOSIÇÃO, não "texto faltando" — a visão não lê o que
      // está impresso um sobre o outro, e culpar o slot leva o modelo a
      // "corrigir" o lugar errado.
      if (
        typeof verificacaoTexto === 'object' &&
        verificacaoTexto.resultado === 'divergente' &&
        pageIdRef
      ) {
        try {
          const page = await db.page.findFirst({
            where: { id: pageIdRef, Template: { projectId } },
            select: { layers: true, width: true, height: true },
          })
          if (page) {
            await registerProjectFonts(projectId)
            const measureBox = await createServerTextBoxMeasurer()
            const { issues } = checkTextGeometry(
              parseLayers(page.layers),
              { width: page.width, height: page.height },
              measureBox,
            )
            const colisoes = issues.filter((i) => i.tipo === 'colisao')
            if (colisoes.length > 0) {
              verificacaoTexto = {
                resultado: 'sobreposicao',
                camadasEnvolvidas: Array.from(new Set(colisoes.flatMap((i) => i.camadas))),
                detalhe: colisoes.map((i) => i.detalhe).join('; '),
                faltando: verificacaoTexto.faltando,
              }
            }
          }
        } catch (erro) {
          console.warn('[mcp] diagnóstico geométrico do conferir-arte falhou:', erro)
        }
      }

      const resultado =
        typeof verificacaoTexto === 'object' ? (verificacaoTexto.resultado as string) : null
      const resumo = {
        url,
        largura: meta.width ?? null,
        altura: meta.height ?? null,
        verificacaoTexto,
        dica:
          resultado === 'sobreposicao'
            ? 'As camadas apontadas estão impressas uma sobre a outra — a leitura falhou por isso, não porque o texto não existe. Encurte o texto com ajustar-arte ou use outro modelo.'
            : resultado === 'divergente'
              ? 'Texto divergente: corrija com ajustar-arte antes de mostrar à pessoa.'
              : 'Olhe a miniatura: texto legível? Nada cortado ou sobreposto? Foto combina com o tema? Se algo estiver errado, use ajustar-arte.',
      }

      return {
        _mcpContent: [
          { type: 'text', text: JSON.stringify(resumo, null, 2) },
          { type: 'image', data: thumb.toString('base64'), mimeType: 'image/jpeg' },
        ],
      }
    },
  }),

  definirTool({
    nome: 'melhorar-arte',
    descricao:
      'Melhora uma arte com IA: o modelo de imagem refina a composição inteira (luz, sombra, textura, integração do texto com a foto) seguindo a direção de arte e a identidade da marca. Os textos são mantidos EXATAMENTE como estão e conferidos por visão ao final — se divergirem, a melhoria é descartada e a arte original continua valendo.\n\nNo fluxo normal a melhoria é o ACABAMENTO da criação: a arte criada é o esboço fiel (layout + textos certos) e esta etapa a leva ao nível de publicação. Antes de chamar, olhe a arte com conferir-arte e escreva o pedido a partir da SUA análise: aponte o que corrigir em concreto (hierarquia, contraste, luz da foto, integração do texto com o fundo, poluição) e o que preservar — sem falar dos textos, que são preservados automaticamente. Pedido vago ("deixe mais bonita") desperdiça a geração.\n\nDemora cerca de 2 minutos e custa créditos: a resposta volta na hora com o id da geração, acompanhe com ver-geracao. Com postId, aplica ao post da agenda ao final — vale para rascunho e agendado. Não chame de novo enquanto houver melhoria em andamento da mesma arte.\n\nPost agendado é enviado para publicação 5 minutos antes do horário e a partir daí a arte não muda mais: melhorar um post nesse estado é recusado (a melhoria leva ~2 min e não chegaria a tempo). Em ver-agenda o campo `arte` diz até quando dá — se estiver "enviada para publicação", não tente: traga o post para rascunho antes (voltar-para-rascunho) ou proponha melhorar a arte para um próximo post.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      generationId: z
        .string()
        .describe('A arte a melhorar (de criar-arte, criar-arte-de-modelo, ajustar-arte ou do post).'),
      pedido: z
        .string()
        .optional()
        .describe(
          'Instruções de melhoria vindas da sua análise da arte (máx 1200 caracteres). Vazio = só as diretrizes do Diretor de Arte da marca.',
        ),
      postId: z
        .string()
        .optional()
        .describe(
          'Post da agenda (rascunho ou agendado) que recebe a arte melhorada ao final (opcional — sem ele a melhoria fica na galeria).',
        ),
      itemId: z
        .string()
        .optional()
        .describe(
          'A outra porta: item da leva (de ver-plano) que recebe a arte melhorada ao final — o card da bancada passa a mostrar a arte nova. Use itemId OU postId, nunca os dois.',
        ),
      planoId: z.string().optional().describe('A leva do itemId. Sem isto, a que está em aberto.'),
      slide: z
        .number()
        .optional()
        .describe('Carrossel na bancada: a ordem do slide que recebe a arte (1 = primeiro). Só com itemId.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ db }, { CreativeError }, { startImprovement, VERCEL_BLOB_HOST_REGEX }, { enfileirarMelhoria }, { resolverDono, resolverPlano, canalDoPrincipal }] =
        await Promise.all([
          import('../../db'),
          import('../../creatives/errors'),
          import('../../ai/creative-improvement-service'),
          import('../../ai/generation-queue'),
          import('../tools'),
        ])
      const projectId = args.projectId as number
      const generationId = args.generationId as string

      const gen = await db.generation.findFirst({
        where: { id: generationId, projectId },
        select: { id: true, resultUrl: true },
      })
      if (!gen) {
        throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
      }

      // O que se melhora é a arte que está NO POST — o cron pode ter
      // re-renderizado a página depois da Generation. Só URLs do nosso Blob
      // entram no pipeline; mídia de fora (CDN do Zernio, Drive) cai no
      // resultUrl da Generation.
      const postId = typeof args.postId === 'string' && args.postId ? args.postId : undefined
      let sourceImageUrl: string | undefined
      if (postId) {
        const post = await db.socialPost.findFirst({
          where: { id: postId, projectId },
          select: { mediaUrls: true },
        })
        const atual = post?.mediaUrls?.[0]
        if (atual && VERCEL_BLOB_HOST_REGEX.test(atual) && atual !== gen.resultUrl) {
          sourceImageUrl = atual
        }
      }

      const itemId = typeof args.itemId === 'string' && args.itemId ? args.itemId : undefined
      if (itemId && postId) {
        throw new CreativeError('ENTRADA_INVALIDA', 'Informe itemId OU postId — a arte melhorada vai para um lugar só.', 400)
      }
      const planoId = itemId ? await resolverPlano(projectId, args.planoId) : undefined

      const dono = await resolverDono(projectId, principal)
      const started = await startImprovement({
        generationId,
        userRequest: typeof args.pedido === 'string' ? args.pedido : '',
        applyToPostId: postId ?? null,
        sourceImageUrl: sourceImageUrl ?? null,
        applyToItemDePlanoId: itemId ?? null,
        applyToPlanoId: planoId ?? null,
        applyToSlideOrdem: itemId && typeof args.slide === 'number' ? args.slide : null,
        actorClerkId: dono.clerkId,
        canal: canalDoPrincipal(principal),
        dedupeWindowMinutes: 10,
      })

      // Só ENFILEIRA (F0.3). O MCP não dispara na hora, de propósito: uma
      // invocação daqui pode carregar várias tools (batch JSON-RPC resolvido
      // com Promise.all) sob o mesmo `maxDuration = 300`.
      if (!started.reused && started.runnerArgs) {
        await enfileirarMelhoria(started.runnerArgs)
      }

      return {
        emAndamento: true,
        melhoriaId: started.jobGenerationId,
        ...(started.reused
          ? { jaEstavaEmAndamento: true }
          : {}),
        // A execução saiu da invocação e passou pela fila (F0.3): pode
        // esperar até um minuto pela varredura antes de começar.
        tempoEstimado: 'de 2 a 3 minutos',
        mensagem: started.reused
          ? 'Já havia uma melhoria desta arte em andamento — acompanhe ela com ver-geracao em vez de disparar outra.'
          : `Melhoria iniciada. Consulte ver-geracao com geracaoId=${started.jobGenerationId} em ~3 minutos${postId ? '; se o texto conferir, a arte do post é trocada sozinha' : itemId ? '; ao terminar, o item da leva passa a mostrar a arte nova' : ''}.`,
      }
    },
  }),

  definirTool({
    nome: 'ver-geracao',
    apelidos: ['ver-melhoria'],
    descricao:
      'Acompanha qualquer arte em andamento — a criada por gerar-imagem/criar-arte E a melhoria disparada por melhorar-arte: em andamento, pronta ou falhou. Quando pronta, traz a imagem nova e o resultado da conferência de texto; quando falha, a arte original continua valendo. Consulte ~2 minutos após disparar (e re-consulte em ~30s se ainda estiver em andamento).\n\nChamava-se `ver-melhoria`, e esse nome segue funcionando — mas ele sugeria que só servia para melhorias, o que fazia quem gerava arte nova procurar uma tool que não existe.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      geracaoId: z.string().optional().describe('O geracaoId (ou melhoriaId) devolvido por quem disparou.'),
      melhoriaId: z.string().optional().describe('Nome antigo de `geracaoId` — segue aceito.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { CreativeError }, { getPublicAppUrl }] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
        import('../../creatives/arte-rapida'),
      ])
      const projectId = args.projectId as number
      /**
       * O handler antigo exigia `melhoriaId` — quem seguia a instrução de
       * gerar-imagem e chamava com `geracaoId` (o nome promovido no A6) tomava
       * "melhoriaId é obrigatório". Corrigido na migração: qualquer um dos
       * dois vale, com o novo preferido.
       */
      const geracaoId =
        typeof args.geracaoId === 'string' && args.geracaoId
          ? args.geracaoId
          : typeof args.melhoriaId === 'string' && args.melhoriaId
            ? args.melhoriaId
            : null
      if (!geracaoId) {
        throw new ErroDeTool({
          codigo: 'ENTRADA_INVALIDA',
          mensagem: 'Informe geracaoId (o id devolvido por gerar-imagem, criar-carrossel ou melhorar-arte).',
        })
      }

      const gen = await db.generation.findFirst({
        where: { id: geracaoId, projectId },
        select: {
          id: true,
          status: true,
          resultUrl: true,
          fieldValues: true,
          createdAt: true,
          completedAt: true,
          sourceGenerationId: true,
        },
      })
      if (!gen) {
        throw new CreativeError('MELHORIA_NAO_ENCONTRADA', 'Melhoria não encontrada neste cliente.', 404)
      }

      const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
      const galleryUrl = `${getPublicAppUrl()}/projects/${projectId}?tab=criativos`

      if (gen.status === 'PROCESSING') {
        const decorrido = Math.round((Date.now() - gen.createdAt.getTime()) / 1000)
        return {
          situacao: 'em-andamento',
          decorridoSegundos: decorrido,
          mensagem:
            decorrido > 300
              ? 'Está demorando mais que o normal — se passar de 6 minutos, considere que falhou e dispare de novo.'
              : 'Ainda gerando. Consulte de novo em ~30 segundos.',
        }
      }

      if (gen.status === 'COMPLETED') {
        const applyToPostId = typeof fv.applyToPostId === 'string' ? fv.applyToPostId : null
        let aplicadaAoPost: boolean | undefined
        let avisoPost: string | undefined
        if (applyToPostId) {
          const post = await db.socialPost.findFirst({
            where: { id: applyToPostId },
            select: { generationId: true, status: true },
          })
          aplicadaAoPost = post?.generationId === gen.id
          if (!aplicadaAoPost) {
            avisoPost =
              'A melhoria ficou pronta, mas o post não estava mais aprovado quando ela terminou — a arte nova está só na galeria.'
          }
        }
        const avisos = [fv.textoAMaisAlerta, fv.textCheckAlert, fv.numerosAlerta, fv.vazamentoAlerta, fv.textoAMaisAviso]
          .filter((a): a is string => typeof a === 'string' && a.length > 0)
        return {
          situacao: 'pronta',
          url: gen.resultUrl,
          verificacaoTexto: fv.textCheck ?? 'skipped',
          ...(typeof fv.regua === 'string' ? { regua: fv.regua } : {}),
          // Aviso vermelho primeiro: texto a mais com dado (endereço, horário)
          // chega com a conferência verde e é o que o cliente reprova.
          ...(avisos.length > 0 ? { avisos, atencao: 'Há aviso da conferência: mostre à pessoa antes de aprovar.' } : {}),
          ...(aplicadaAoPost !== undefined ? { aplicadaAoPost } : {}),
          ...(avisoPost ? { avisoPost } : {}),
          galleryUrl,
          dica: 'Use conferir-arte com este generationId para VER a arte antes de mostrá-la à pessoa.',
          generationId: gen.id,
        }
      }

      return {
        situacao: 'falhou',
        motivo: typeof fv.error === 'string' ? fv.error : 'Erro desconhecido',
        verificacaoTexto: fv.textCheck ?? undefined,
        mensagem:
          'A melhoria foi descartada e a arte original continua valendo — nada mudou no post nem na galeria. Dá para tentar de novo com um pedido mais específico.',
      }
    },
  }),

  definirTool({
    nome: 'gerar-imagem',
    descricao:
      'Gera uma imagem ou arte DO ZERO com IA, ancorada em fotos reais do cliente. Duas trilhas que nunca se misturam:\n\n- trilha "imagem": fotografia/cena SEM NENHUM texto (nem logo) — para fundo de peça, cena de ambiente, variação de foto. Requer `pedido` descrevendo a cena.\n- trilha "arte": peça PRONTA com os textos desenhados na imagem — requer `copy` (os blocos exatos, na ordem) e uma foto real como cena (referência com role "subject"). A identidade da marca (logo, paleta, fontes) entra sozinha; os textos são conferidos por visão ao final.\n\nREFERÊNCIAS (a alma da qualidade): passe 1 a 3 fotos REAIS do cliente com papel declarado — "subject" (a foto do prato/produto, obrigatória na trilha arte), "anchor-ambient" (foto do salão/ambiente: a cena acontece NESTE lugar; use SEMPRE que a cena mostrar o ambiente), "anchor-dish" (segundo ângulo do prato) e "style" (arte aprovada como referência de estilo). Há ainda "documento" (máx 1, só na trilha arte): um print/cartaz que entra na peça TAL E QUAL — colado por código DEPOIS da geração, com sombra de cartão, numa faixa central que o prompt reserva; use para print de avaliação do Google, cartaz ou QR, porque a IA redesenharia o texto se o recebesse. Poucas referências boas vencem muitas: refs demais fazem o visual derivar. Fotos vêm do acervo (buscar-fotos → driveFileId) ou de URL do Studio.\n\nMODO DIRETOR (opcional, trilha imagem): se você mesmo escrever o prompt de fotografia em inglês (anatomia CAMERA:/LENS:/LIGHT:/…, física em Kelvin/graus/IRE, sem buzzwords, até ~4000 chars, zero texto na imagem), passe em `promptPronto` — ele é usado no lugar do redator automático. A validação é AVISO, não bloqueio: prompt fora da régua gera do mesmo jeito e a ressalva fica gravada. Escreva denso, mas NÃO corte as proibições para caber — são elas que seguram a identidade da marca.\n\nCUSTO (a resposta traz `creditosCobrados`, sempre confira antes de repetir): trilha arte 25 créditos; trilha imagem 10 no modelo padrão, 15 no `nano-banana-pro` em 2K e 30 nele em 4K. Só peça 4K quando a margem para recorte for usada — ela custa o TRIPLO do padrão.\n\nDemora 1–3 minutos. A resposta volta na hora com geracaoId; acompanhe com ver-geracao. Disparos de temas DIFERENTES podem ser feitos em paralelo; o mesmo pedido repetido em 10 minutos é reaproveitado, não cobrado de novo.\n\nA trilha imagem entrega a foto na resolução NATIVA do modelo (2K ≈ 1536x2752 no 9:16; 4K ≈ 3072x5504), porque ela é insumo e vai ser recortada depois. Só a trilha arte sai no tamanho exato de publicação.\n\nANCHOR SHEET: se o cliente tem âncora de tipo "ambiente" definida (listar-ancoras), toda cena gerada na trilha imagem a recebe automaticamente quando você não passar uma âncora de ambiente — não precisa repeti-la nas referências.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      trilha: z
        .enum(['imagem', 'arte'])
        .describe('"imagem" = cena sem texto; "arte" = peça com os textos desenhados.'),
      pedido: z
        .string()
        .optional()
        .describe(
          'O que gerar, em português (máx 1200). Obrigatório na trilha imagem; na trilha arte é instrução adicional opcional.',
        ),
      copy: z
        .array(z.string())
        .optional()
        .describe(
          'Trilha arte: os blocos de texto EXATOS da peça, na ordem de leitura (máx 12 blocos de 200 chars). As PALAVRAS são reproduzidas verbatim e conferidas por visão; a CAIXA das letras, não — quem decide se a manchete sai em caixa alta é a identidade da marca. Escreva em caixa natural ("Desacelere e desfrute"), deixando em maiúsculas só sigla, unidade, valor e o nome da marca.',
        ),
      formato: z.enum(FORMATOS).describe('story 9:16, feed 4:5, quadrado 1:1.'),
      referencias: z
        .array(referenciaComPapel)
        .optional()
        .describe('1 a 3 fotos reais com papel declarado. Máx: 1 subject + 3 âncoras + 2 style.'),
      instrucaoImagem: z
        .string()
        .optional()
        .describe(
          'Trilha arte, opcional: ajuste autorizado na FOTO (ex: "escurecer o fundo atrás do texto", "cortar o primeiro pedaço ao meio mostrando o ponto da carne"). Sem isso a foto é preservada intocada — a regra da casa é "a foto se melhora, nunca se modifica". Com ajuste, a peça é gerada no modelo mais caprichoso (leva ~2 min em vez de ~40s, mesmo custo em créditos): editar foto exige detalhe que o modelo rápido não entrega.',
        ),
      clienteCitadoId: z
        .number()
        .optional()
        .describe(
          'Trilha arte, opcional — co-branding: o ID do cliente CITADO na peça (de listar-clientes). A logomarca oficial dele é composta na arte no canto oposto ao da marca da casa. É como uma agência mostra o trabalho feito para um cliente.',
        ),
      promptPronto: z
        .string()
        .optional()
        .describe('Modo diretor (trilha imagem): prompt final em inglês, anatomia CAMERA:/LIGHT:/…; validado antes de usar.'),
      modelo: z
        .string()
        .optional()
        .describe(
          'Override do modelo, trilha imagem. "nano-banana-2" (padrão, 10 créditos) ou "nano-banana-pro" (15 créditos em 2K, e o único que entrega 4K). Não troque sem motivo: o padrão resolve a maioria das cenas.',
        ),
      resolution: z
        .enum(['2K', '4K'])
        .optional()
        .describe(
          'Trilha imagem, padrão 2K (~1536x2752 no 9:16). "4K" só existe no nano-banana-pro, entrega ~3072x5504 e custa 30 créditos — o TRIPLO do padrão. Peça 4K quando a foto for virar arte depois e precisar de margem para recorte; para uso direto, 2K basta. (1K foi removido: custava o mesmo que 2K e entregava um quarto dos pixels.)',
        ),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ startArtGeneration }, { enfileirarArte }, { resolverDono, canalDoPrincipal }] = await Promise.all([
        import('../../ai/creative-generation-service'),
        import('../../ai/generation-queue'),
        import('../tools'),
      ])
      const projectId = args.projectId as number

      const trilha = args.trilha === 'arte' ? ('arte' as const) : ('imagem' as const)
      const formato =
        args.formato === 'feed' ? ('feed' as const) : args.formato === 'quadrado' ? ('quadrado' as const) : ('story' as const)

      const dono = await resolverDono(projectId, principal)
      const started = await startArtGeneration({
        projectId,
        track: trilha,
        pedido: typeof args.pedido === 'string' ? args.pedido : undefined,
        copy: Array.isArray(args.copy)
          ? args.copy.filter((b: unknown): b is string => typeof b === 'string')
          : undefined,
        formato,
        referencias: lerReferencias(args.referencias),
        instrucaoImagem: typeof args.instrucaoImagem === 'string' ? args.instrucaoImagem : null,
        marcaDoClienteProjectId:
          typeof args.clienteCitadoId === 'number' && args.clienteCitadoId > 0 ? args.clienteCitadoId : null,
        modelo: typeof args.modelo === 'string' && args.modelo ? args.modelo : undefined,
        resolution: args.resolution === '2K' || args.resolution === '4K' ? args.resolution : undefined,
        finalPrompt: typeof args.promptPronto === 'string' && args.promptPronto ? args.promptPronto : null,
        actorClerkId: dono.clerkId,
        canal: canalDoPrincipal(principal),
        dedupeWindowMinutes: 10,
      })

      // Enfileira e responde — ver a nota em melhorar-arte.
      if (!started.reused && started.runnerArgs) {
        await enfileirarArte(started.runnerArgs)
      }

      return {
        emAndamento: true,
        geracaoId: started.jobGenerationId,
        ...(started.reused ? { jaEstavaEmAndamento: true } : {}),
        // O preço DESTA chamada. Sem ele, quem escolhe modelo e resolução
        // escolhe às cegas — e 4K no pro custa o triplo do padrão.
        creditosCobrados: started.creditosCobrados,
        tempoEstimado: trilha === 'arte' ? 'de 2 a 3 minutos' : 'de 1 a 2 minutos',
        mensagem: started.reused
          ? 'Já havia uma geração idêntica em andamento — acompanhe ela com ver-geracao em vez de disparar outra. Nada foi cobrado nesta chamada.'
          : `Geração iniciada (${started.creditosCobrados} créditos). Acompanhe com ver-geracao (geracaoId=${started.jobGenerationId}); quando pronta, use conferir-arte para VER o resultado antes de mostrar à pessoa.`,
      }
    },
  }),

  definirTool({
    nome: 'gerar-imagem-lote',
    descricao:
      'Gera VÁRIAS cenas de uma vez, com uma base comum e uma lista de variações — o formato natural de uma grade semanal.\n\nExiste porque doze peças eram doze chamadas repetindo o mesmo prompt de ~1.400 caracteres, mudando só gesto e cenário: caro na conversa e, pior, aberto a divergência entre peças que deveriam ser irmãs. Aqui a base é escrita UMA vez e vale para todas.\n\nCada variação vira uma geração independente, com seu próprio geracaoId — acompanhe com ver-geracao. O `loteId` fica gravado em todas, para reencontrá-las juntas depois.\n\nCUSTO: some o de cada uma. A resposta traz `creditosCobrados` no total e por item; confira ANTES de repetir o lote. Máximo de 12 por chamada.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      trilha: z.enum(['imagem', 'arte']).describe('Vale para o lote inteiro.'),
      formato: z.enum(FORMATOS).describe('Vale para o lote inteiro.'),
      modelo: z.string().optional().describe('Override do modelo (trilha imagem).'),
      resolution: z.enum(['2K', '4K']).optional().describe('Trilha imagem, padrão 2K.'),
      pedidoBase: z
        .string()
        .optional()
        .describe('O que TODAS as cenas têm em comum (máx 1200). Cada variação acrescenta o que muda.'),
      referenciasBase: z
        .array(referenciaDoLote)
        .optional()
        .describe('Referências que valem para todas. A variação pode ACRESCENTAR as suas.'),
      variacoes: z
        .array(
          z
            .object({
              pedido: z.string().optional().describe('O que muda nesta peça (gesto, cenário, prato).'),
              promptPronto: z.string().optional().describe('Modo diretor, só desta peça.'),
              copy: z.array(z.string()).optional().describe('Trilha arte: os blocos desta peça.'),
              referencias: z.array(referenciaDoLote).optional(),
              instrucaoImagem: z.string().optional().describe('Ajuste autorizado na foto, só desta peça.'),
            })
            .strict(),
        )
        .describe('De 2 a 12 peças. Cada uma herda a base e acrescenta o que é seu.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ startArtGeneration }, { enfileirarArte }, { resolverDono, canalDoPrincipal }, { randomUUID }] = await Promise.all([
        import('../../ai/creative-generation-service'),
        import('../../ai/generation-queue'),
        import('../tools'),
        import('crypto'),
      ])
      const projectId = args.projectId as number

      const variacoes = (args.variacoes ?? []) as Array<Record<string, unknown>>
      if (variacoes.length < 2) {
        throw new Error('Um lote tem pelo menos 2 variações — para uma peça só, use gerar-imagem.')
      }
      if (variacoes.length > MAX_LOTE) {
        throw new Error(`No máximo ${MAX_LOTE} peças por lote (pedidas ${variacoes.length}).`)
      }

      const trilha = args.trilha === 'arte' ? ('arte' as const) : ('imagem' as const)
      const formato =
        args.formato === 'feed' ? ('feed' as const) : args.formato === 'quadrado' ? ('quadrado' as const) : ('story' as const)
      const dono = await resolverDono(projectId, principal)
      const loteId = randomUUID()
      const refsBase = lerReferencias(args.referenciasBase)

      /**
       * SEQUENCIAL, não `Promise.all`. Cada item valida créditos e cria a
       * Generation; disparar doze em paralelo faria doze validações lerem o
       * mesmo saldo antes de qualquer dedução — e o lote inteiro passaria com
       * saldo para uma peça só. Em série, o item N já enxerga o consumo dos
       * anteriores. São escritas rápidas; a GERAÇÃO é que roda na fila.
       */
      const itens: Array<Record<string, unknown>> = []
      let creditosTotais = 0
      for (const [i, bruta] of variacoes.entries()) {
        const v = (bruta ?? {}) as Record<string, unknown>
        const pedidoDaPeca = [
          typeof args.pedidoBase === 'string' ? args.pedidoBase.trim() : '',
          typeof v.pedido === 'string' ? v.pedido.trim() : '',
        ]
          .filter(Boolean)
          .join(' ')
        try {
          const started = await startArtGeneration({
            projectId,
            track: trilha,
            pedido: pedidoDaPeca || undefined,
            copy: Array.isArray(v.copy) ? v.copy.filter((b): b is string => typeof b === 'string') : undefined,
            formato,
            referencias: [...refsBase, ...lerReferencias(v.referencias)],
            instrucaoImagem: typeof v.instrucaoImagem === 'string' ? v.instrucaoImagem : null,
            modelo: typeof args.modelo === 'string' && args.modelo ? args.modelo : undefined,
            resolution: args.resolution === '2K' || args.resolution === '4K' ? args.resolution : undefined,
            finalPrompt: typeof v.promptPronto === 'string' && v.promptPronto ? v.promptPronto : null,
            loteId,
            actorClerkId: dono.clerkId,
            canal: canalDoPrincipal(principal),
            dedupeWindowMinutes: 10,
          })
          if (!started.reused && started.runnerArgs) await enfileirarArte(started.runnerArgs)
          creditosTotais += started.creditosCobrados
          itens.push({
            posicao: i + 1,
            geracaoId: started.jobGenerationId,
            creditosCobrados: started.creditosCobrados,
            ...(started.reused ? { jaEstavaEmAndamento: true } : {}),
          })
        } catch (erro) {
          // Uma peça inválida não derruba o lote — o resto segue e o relato diz
          // o que ficou de fora, como em `upload-creative`.
          itens.push({ posicao: i + 1, erro: erro instanceof Error ? erro.message : String(erro) })
        }
      }

      const geradas = itens.filter((i) => !i.erro).length
      return {
        loteId,
        emAndamento: geradas > 0,
        creditosCobrados: creditosTotais,
        itens,
        tempoEstimado: trilha === 'arte' ? 'de 2 a 4 minutos' : 'de 1 a 3 minutos',
        mensagem:
          `${geradas} de ${variacoes.length} peça(s) na fila (${creditosTotais} créditos no total). ` +
          'Acompanhe cada uma com ver-geracao pelo geracaoId.' +
          (geradas < variacoes.length ? ' Veja `itens` para o que não entrou.' : ''),
      }
    },
  }),

  definirTool({
    nome: 'marcar-referencia-de-estilo',
    descricao:
      'Marca (ou desmarca) uma arte pronta como REFERÊNCIA DE ESTILO do cliente — "gostei desta, faça as próximas parecidas". As marcadas entram num rodízio: cada nova arte recebe UMA delas como referência visual, sempre a menos usada, para as peças terem parentesco sem sair todas iguais.\n\nUse quando a pessoa elogiar uma arte ("essa ficou ótima", "quero mais assim"). Sem argumento `marcada`, marca. Chame sem `generationId` para LISTAR as referências atuais na ordem do rodízio.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      generationId: z.string().optional().describe('A arte. Omita para apenas listar as referências atuais.'),
      marcada: z.boolean().optional().describe('true marca (default), false tira das referências.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { listarReferenciasDeEstilo, definirReferenciaDeEstilo } = await import('../../ai/style-references')
      const projectId = args.projectId as number

      if (!args.generationId) {
        const refs = await listarReferenciasDeEstilo(projectId)
        return {
          referencias: refs,
          total: refs.length,
          dica:
            refs.length === 0
              ? 'Nenhuma arte marcada ainda. Marque as que a pessoa aprovar — é o que dá cara própria às próximas.'
              : 'A primeira da lista é a que entra na próxima geração (rodízio: menos usada primeiro).',
        }
      }

      const marcada = args.marcada !== false
      const r = await definirReferenciaDeEstilo(String(args.generationId), marcada)
      return {
        ...r,
        mensagem: marcada
          ? 'Marcada. As próximas artes deste cliente vão se inspirar nela, em rodízio com as outras.'
          : 'Tirada das referências.',
      }
    },
  }),
]
