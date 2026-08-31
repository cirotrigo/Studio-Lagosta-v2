/**
 * Catálogo · planos e semana (PR 3 da migração para o registro).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db, serviços
 * e helpers (itemParaChat, resolverPlano, resolverDono) entram por
 * `await import()` relativo dentro do handler.
 *
 * ⚠️ O "Máximo 60" na descrição de criar-plano.itens é o valor de
 * MAX_ITENS_POR_PLANO cravado à mão: o schema nasce no load deste módulo, e
 * plano-service (onde a constante mora) importa o Prisma — não pode entrar
 * estático aqui. A deriva é vigiada por um assert no load de
 * catalogo/integracao.ts, que enxerga os dois lados.
 *
 * O gate mecânico de executar-plano (1ª chamada devolve a conta; só
 * `confirmar: true` produz) continua EXATAMENTE como era — é gate de cobrança,
 * e o envelope de sucesso-com-conta é o contrato que as conversas já conhecem.
 * A conversão para CONFIRMACAO_NECESSARIA na taxonomia fica para uma decisão
 * futura deliberada, nunca como efeito colateral da migração.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

const FORMATOS = ['story', 'feed', 'quadrado'] as const
const PAPEIS_DE_REFERENCIA = ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] as const

export const toolsDePlanos = [
  definirTool({
    nome: 'propor-semana',
    descricao:
      'Monta a semana inteira do cliente e a GUARDA no Studio: pega os horários da rotina dele, dá um assunto diferente a cada post, escolhe uma foto do acervo para cada um e escreve o texto — tudo de uma vez. É por onde começar quando a pessoa disser "monta minha semana", "o que eu posto essa semana?" ou "prepara os posts do By Rock".\n\nNÃO produz arte nenhuma e NÃO gasta crédito: o que sai daqui é a proposta, e a pessoa pode mexer no que quiser antes. Para mudar um item use editar-item-do-plano; para PRODUZIR as artes use executar-plano, que mostra a conta e pede confirmação antes de tocar.\n\nApresente a leva em português, item a item (dia, hora, assunto e o texto proposto), e diga que nada foi produzido ainda. Quando o cliente ainda não tem rotina, a resposta vem marcada como ponto de partida — conte isso com todas as letras em vez de apresentar os horários como se fossem o hábito dele.\n\nUse criar-plano quando VOCÊ já apurou tudo na conversa e só quer guardar; use esta aqui para o Studio montar.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      dias: z.number().optional().describe('Quantos dias à frente olhar (default 7, máx 14).'),
      maxItens: z.number().optional().describe('Quantos posts no máximo (default 7).'),
      formato: z.enum(FORMATOS).optional().describe('Formato das peças (default story).'),
      observacao: z
        .string()
        .optional()
        .describe('Recado de quem pediu ("é semana de festival", "foca no delivery").'),
      titulo: z.string().optional().describe('Como a pessoa chama esta leva.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ proporSemana }, { quemDecidiu, itemParaChat }] = await Promise.all([
        import('../../planos/propor-semana'),
        import('../tools'),
      ])
      const projectId = args.projectId as number

      const r = await proporSemana({
        projectId,
        dias: typeof args.dias === 'number' ? args.dias : undefined,
        maxItens: typeof args.maxItens === 'number' ? args.maxItens : undefined,
        formato: typeof args.formato === 'string' ? args.formato : null,
        observacao: typeof args.observacao === 'string' ? args.observacao : null,
        titulo: typeof args.titulo === 'string' ? args.titulo : null,
        criadoPor: await quemDecidiu(projectId, principal),
      })

      return {
        planoId: r.plano.id,
        titulo: r.plano.titulo,
        pontoDePartida: r.coldStart,
        itens: r.plano.itens.map((item) => itemParaChat(item)),
        progresso: r.plano.progresso.frase,
        assuntos: r.taxonomia.assuntosUsados,
        ...(r.copy.indisponivel ? { textoIndisponivel: true } : {}),
        ...(r.fotos.semFoto > 0 ? { itensSemFoto: r.fotos.semFoto } : {}),
        // A análise do que funcionou — apresente junto da leva: é o porquê da
        // inclinação de formato e de gancho que a copy recebeu.
        ...(r.desempenho.length > 0 ? { desempenho: r.desempenho } : {}),
        ...(r.avisos.length > 0 ? { avisos: r.avisos } : {}),
        mensagem: `${r.mensagem} Para mexer em algum item use editar-item-do-plano; para produzir as artes, executar-plano (ele mostra a conta antes).`,
      }
    },
  }),

  definirTool({
    nome: 'criar-plano',
    descricao:
      'Guarda no Studio a LEVA que você acabou de montar com a pessoa — a semana de posts, com o horário, o tema, o texto e a foto de cada um. A partir daí a leva existe fora da conversa: some do chat e continua lá, e a bancada do Studio mostra a mesma fila.\n\nNÃO produz arte nenhuma e NÃO gasta crédito: aqui só fica registrado o que se pretende fazer. Quem produz é executar-plano, e só depois de a pessoa ver a conta e dizer sim.\n\nMonte os itens com o que você já apurou: sugerir-posts dá os horários e o motivo de cada um, consultar-base e consultar-dna dão o que pode ser dito, buscar-fotos dá as fotos e escolher-modelo dá o modelo do cliente para o tema. Cada item nasce pela via "template" (montado num modelo do cliente, sem custo de imagem) — só marque "ia" quando nenhum modelo servir.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      titulo: z.string().optional().describe('Como a pessoa chama esta leva ("Semana de 17 a 23/08").'),
      inicio: z.string().describe('Primeiro dia da leva ("AAAA-MM-DD").'),
      fim: z.string().describe('Último dia da leva ("AAAA-MM-DD"), incluído por inteiro.'),
      itens: z
        .array(
          z
            .object({
              quando: z
                .string()
                .optional()
                .describe('Dia e hora de Brasília ("AAAA-MM-DD HH:mm"). Pode ficar vazio se ainda não foi decidido.'),
              tema: z.string().optional().describe('Do que é o post ("almoço executivo", "happy hour").'),
              texto: z
                .array(z.string())
                .optional()
                .describe(
                  'Os blocos de texto da arte, na ordem de leitura (título, apoio, chamada). ESCREVA EM CAIXA NATURAL, como uma frase: "Desacelere e desfrute", nunca "DESACELERE E DESFRUTE". A caixa alta da manchete é decisão de tipografia e quem a toma é a identidade da marca na hora de desenhar a arte — não o texto que você digita. Deixe em maiúsculas só o que é maiúsculo de verdade: sigla, unidade, valor ("50% OFF") e o nome da marca.',
                ),
              legenda: z.string().optional().describe('A legenda do Instagram, quando houver.'),
              fotoDriveId: z.string().optional().describe('A foto do acervo (de buscar-fotos).'),
              fotoUrl: z.string().optional().describe('Alternativa: imagem já no Studio.'),
              formato: z.enum(FORMATOS).describe('Obrigatório.'),
              via: z
                .enum(['template', 'ia'])
                .optional()
                .describe('Por onde a arte nasce: "template" (modelo do cliente, sem custo — o padrão) ou "ia" (gasta crédito).'),
              modeloId: z
                .string()
                .optional()
                .describe('O modelo do cliente que vira a arte — o mesmo id que criar-arte-de-modelo recebe em sourcePageId, vindo de escolher-modelo.'),
              direcao: z
                .string()
                .optional()
                .describe(
                  'Via "ia": direção adicional para o modelo de imagem, além do tema — onde a foto é a cena, como tratar um print (ex.: "o print entra como mockup de celular sobre fundo preto, fiel e legível"), o clima da peça. Máx 1200.',
                ),
              ajusteDaFoto: z
                .string()
                .optional()
                .describe(
                  'Via "ia": ajuste autorizado na FOTO desta peça (ex.: "escurecer o fundo atrás do texto"). Sem isto a foto vai intocada, que é o padrão. ⚠️ Presente, a geração sai no tier caro e lento — dirigir a composição é papel da direção, não deste campo.',
                ),
              referencias: z
                .array(
                  z
                    .object({
                      role: z.enum(PAPEIS_DE_REFERENCIA).describe('Papel da foto na geração.'),
                      driveFileId: z.string().optional().describe('Foto do acervo (de buscar-fotos).'),
                      url: z.string().optional().describe('Alternativa: imagem já no Studio.'),
                      label: z.string().optional().describe('Rótulo curto ("salão principal", "picanha na tábua").'),
                    })
                    .strict(),
                )
                .optional()
                .describe(
                  'Via "ia": as fotos da peça, cada uma com o papel dela — a cena (subject, obrigatória quando há texto), até 3 âncoras de ambiente/prato, até 2 de estilo e até 1 "documento" (print colado TAL E QUAL depois da geração — avaliação do Google, cartaz, QR). Presente, vence fotoDriveId/fotoUrl. Uma foto só? Use fotoDriveId, que continua valendo.',
                ),
              clienteCitadoId: z
                .number()
                .optional()
                .describe(
                  'Co-branding: o ID do cliente CITADO na peça (de listar-clientes). A logomarca oficial dele é composta na arte, no canto oposto ao da marca da casa. Use sempre que a peça falar do trabalho feito para um cliente.',
                ),
              motivoDoSlot: z
                .string()
                .optional()
                .describe('Por que este horário — a frase que a pessoa lê ao revisar.'),
              escopo: z
                .enum(['rotina', 'campanha', 'pontual'])
                .optional()
                .describe('O que o sistema pode aprender com este post. Mesma escolha de colocar-na-agenda.'),
              campanhaId: z.string().optional().describe('Entrada de CAMPANHAS da base a que este item pertence.'),
              sugestaoId: z
                .string()
                .optional()
                .describe('Se o horário veio de sugerir-posts, devolva o sugestaoId dele aqui.'),
            })
            .strict(),
        )
        .optional()
        .describe('Os posts pretendidos, na ordem. Máximo 60.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ criarPlano }, { quemDecidiu, itemParaChat }] = await Promise.all([
        import('../../planos/plano-service'),
        import('../tools'),
      ])
      const projectId = args.projectId as number

      const entradas = (args.itens ?? []) as Array<Record<string, any>>
      const { plano, avisos } = await criarPlano({
        projectId,
        titulo: typeof args.titulo === 'string' ? args.titulo : null,
        inicio: args.inicio as string,
        fim: args.fim as string,
        origem: 'chat',
        criadoPor: await quemDecidiu(projectId, principal),
        itens: entradas.map((i) => ({
          quando: typeof i.quando === 'string' ? i.quando : null,
          tema: typeof i.tema === 'string' ? i.tema : null,
          copyProposta: Array.isArray(i.texto)
            ? i.texto.filter((b: unknown): b is string => typeof b === 'string')
            : null,
          legenda: typeof i.legenda === 'string' ? i.legenda : null,
          fotoDriveId: typeof i.fotoDriveId === 'string' ? i.fotoDriveId : null,
          fotoUrl: typeof i.fotoUrl === 'string' ? i.fotoUrl : null,
          formato: typeof i.formato === 'string' ? i.formato : null,
          via: typeof i.via === 'string' ? i.via : null,
          sourcePageId: typeof i.modeloId === 'string' ? i.modeloId : null,
          direcao: typeof i.direcao === 'string' ? i.direcao : null,
          ajusteDaFoto: typeof i.ajusteDaFoto === 'string' ? i.ajusteDaFoto : null,
          ...(Array.isArray(i.referencias) ? { referencias: i.referencias } : {}),
          clienteProjectId: typeof i.clienteCitadoId === 'number' ? i.clienteCitadoId : null,
          motivoDoSlot: typeof i.motivoDoSlot === 'string' ? i.motivoDoSlot : null,
          escopo: typeof i.escopo === 'string' ? i.escopo : null,
          campaignId: typeof i.campanhaId === 'string' ? i.campanhaId : null,
          sugestaoId: typeof i.sugestaoId === 'string' ? i.sugestaoId : null,
        })),
      })

      return {
        planoId: plano.id,
        titulo: plano.titulo,
        itens: plano.itens.map((item) => itemParaChat(item)),
        progresso: plano.progresso.frase,
        ...(avisos.length > 0 ? { avisos } : {}),
        mensagem:
          'A leva está guardada. Nada foi produzido e nada foi cobrado — quando estiver combinada, use executar-plano.',
      }
    },
  }),

  definirTool({
    nome: 'ver-plano',
    descricao:
      'Mostra a leva do cliente como ela está agora: cada item com horário de Brasília, tema, texto, situação em português e a capa da arte quando ela já existe, mais o resumo do todo ("3 prontas, 2 gerando, 1 falhou"). Sem informar a leva, mostra a que está em aberto.\n\nCONSULTE antes e depois de produzir: é aqui que a situação dos itens é atualizada — as artes terminam em segundo plano, e nada avisa o plano quando ficam prontas. Item que aparece como "falhou" traz o motivo e pode ser produzido de novo.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      planoId: z.string().optional().describe('A leva (de criar-plano). Sem isto, a que está em aberto.'),
    }),
    // NÃO é readOnly: é aqui que a reconciliação escreve as transições dos
    // itens (na-fila → gerando → pronto) — ninguém avisa o plano quando a
    // fila termina. Idempotente porque a reconciliação é convergente.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { lerPlano }, { reconciliarPlano }, { formatarBRT }, { resolverPlano, itemParaChat }] =
        await Promise.all([
          import('../../db'),
          import('../../planos/plano-service'),
          import('../../planos/reconciliar'),
          import('../../posts/agenda-acoes'),
          import('../tools'),
        ])
      const projectId = args.projectId as number
      const planoId = await resolverPlano(projectId, args.planoId)

      // Antes de mostrar: conferir o que as artes viraram. Ninguém avisa o
      // plano quando a fila termina uma geração — sem isto o item ficaria
      // "na fila" para sempre, com a arte pronta na galeria ao lado.
      const reconciliado = await reconciliarPlano(projectId, planoId)
      const plano = await lerPlano(projectId, planoId)

      const idsDeArte = plano.itens
        .map((i) => i.generationId)
        .filter((id): id is string => !!id)
      const capas = idsDeArte.length
        ? await db.generation.findMany({
            where: { id: { in: idsDeArte } },
            select: { id: true, resultUrl: true },
          })
        : []
      const porArte = new Map(capas.map((c) => [c.id, c.resultUrl]))

      return {
        planoId: plano.id,
        titulo: plano.titulo,
        periodo: `${formatarBRT(plano.inicio)} a ${formatarBRT(plano.fim)}`,
        situacaoDaLeva: plano.status === 'ativo' ? 'em aberto' : 'encerrada',
        progresso: plano.progresso.frase,
        concluido: plano.progresso.concluido,
        itens: plano.itens.map((item) =>
          itemParaChat(item, item.generationId ? porArte.get(item.generationId) : null),
        ),
        ...(reconciliado.movidos.length > 0
          ? { atualizados: reconciliado.movidos.length }
          : {}),
      }
    },
  }),

  definirTool({
    nome: 'editar-item-do-plano',
    descricao:
      'Muda um item da leva antes de a arte existir: o horário, o tema, o texto, a legenda, a foto, o formato, o modelo ou a via. Use quando a pessoa pedir ajuste ao revisar a leva ("antecipa o de quinta", "troca o texto do happy hour").\n\nItem cuja arte já está sendo produzida, já ficou pronta ou já virou post na agenda não aceita edição — a ferramenta recusa dizendo por quê. Para pedir OUTRA arte de um item já produzido, use regenerar-item. Toda edição devolve o item para "editado": a aprovação anterior era do que estava lá antes.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      planoId: z.string().optional().describe('A leva. Sem isto, a que está em aberto.'),
      itemId: z.string().describe('O item (de ver-plano).'),
      quando: z.string().optional().describe('Novo dia e hora de Brasília ("AAAA-MM-DD HH:mm").'),
      tema: z.string().optional().describe('Novo tema.'),
      texto: z
        .array(z.string())
        .optional()
        .describe(
          'Novos blocos de texto da arte (substituem todos). Em caixa natural, como uma frase — a caixa alta da manchete quem decide é a identidade da marca ao desenhar, não o texto digitado aqui.',
        ),
      legenda: z.string().optional().describe('Nova legenda.'),
      fotoDriveId: z.string().optional().describe('Outra foto do acervo.'),
      fotoUrl: z.string().optional().describe('Outra imagem já no Studio.'),
      referencias: z
        .array(
          z
            .object({
              role: z.enum(PAPEIS_DE_REFERENCIA),
              driveFileId: z.string().optional(),
              url: z.string().optional(),
              label: z.string().optional(),
            })
            .strict(),
        )
        .optional()
        .describe(
          'Substitui a lista INTEIRA de fotos da peça, cada uma com papel (a cena + âncoras + estilo + o print "documento", colado tal e qual). Lista vazia tira todas. Para trocar só a cena, fotoDriveId continua valendo.',
        ),
      formato: z.enum(FORMATOS).optional().describe('Novo formato.'),
      via: z.enum(['template', 'ia']).optional().describe('Troca a via de criação da arte.'),
      modeloId: z.string().optional().describe('Outro modelo do cliente (de escolher-modelo).'),
      direcao: z
        .string()
        .optional()
        .describe(
          'Via "ia": nova direção adicional para o modelo de imagem (como tratar a foto ou o print, o clima da peça). String vazia limpa.',
        ),
      ajusteDaFoto: z
        .string()
        .optional()
        .describe('Via "ia": novo ajuste autorizado na foto. String vazia limpa (foto intocada).'),
      clienteCitadoId: z
        .number()
        .optional()
        .describe('Co-branding: ID do cliente citado na peça, cuja logomarca é composta na arte. 0 remove.'),
      motivoDoSlot: z.string().optional().describe('Nova explicação do horário.'),
      escopo: z.enum(['rotina', 'campanha', 'pontual']).optional().describe('Novo escopo de aprendizado.'),
      campanhaId: z.string().optional().describe('Campanha a que o item passa a pertencer.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ atualizarItem }, { quemDecidiu, resolverPlano, itemParaChat }] = await Promise.all([
        import('../../planos/plano-service'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const planoId = await resolverPlano(projectId, args.planoId)

      const { item, avisos } = await atualizarItem({
        projectId,
        planoId,
        itemId: args.itemId as string,
        decididoPor: await quemDecidiu(projectId, principal),
        patch: {
          ...(args.quando !== undefined ? { quando: args.quando } : {}),
          ...(typeof args.tema === 'string' ? { tema: args.tema } : {}),
          ...(Array.isArray(args.texto)
            ? { copyProposta: args.texto.filter((b: unknown): b is string => typeof b === 'string') }
            : {}),
          ...(typeof args.legenda === 'string' ? { legenda: args.legenda } : {}),
          ...(typeof args.fotoDriveId === 'string' ? { fotoDriveId: args.fotoDriveId } : {}),
          ...(typeof args.fotoUrl === 'string' ? { fotoUrl: args.fotoUrl } : {}),
          ...(Array.isArray(args.referencias) ? { referencias: args.referencias } : {}),
          ...(typeof args.formato === 'string' ? { formato: args.formato } : {}),
          ...(typeof args.via === 'string' ? { via: args.via } : {}),
          ...(typeof args.modeloId === 'string' ? { sourcePageId: args.modeloId } : {}),
          ...(typeof args.direcao === 'string' ? { direcao: args.direcao } : {}),
          ...(typeof args.ajusteDaFoto === 'string' ? { ajusteDaFoto: args.ajusteDaFoto } : {}),
          ...(typeof args.clienteCitadoId === 'number'
            ? { clienteProjectId: args.clienteCitadoId > 0 ? args.clienteCitadoId : null }
            : {}),
          ...(typeof args.motivoDoSlot === 'string' ? { motivoDoSlot: args.motivoDoSlot } : {}),
          ...(typeof args.escopo === 'string' ? { escopo: args.escopo } : {}),
          ...(typeof args.campanhaId === 'string' ? { campaignId: args.campanhaId } : {}),
        },
      })

      return {
        item: itemParaChat(item as Parameters<typeof itemParaChat>[0]),
        ...(avisos.length > 0 ? { avisos } : {}),
      }
    },
  }),

  definirTool({
    nome: 'regenerar-item',
    descricao:
      'Reprova um item da leva com um MOTIVO e o devolve para nova tentativa. É o caminho para "essa não ficou boa": o motivo fica registrado e alimenta o aprendizado do cliente — sem ele, a mesma arte volta na próxima leva.\n\nEscreva o motivo em palavras concretas ("o texto ficou grande demais e cobriu o prato", "essa foto já saiu semana passada"). Se o item já tinha arte, o motivo vira o feedback dela.\n\nPor padrão o item volta para edição, para você ajustar antes de produzir de novo; com voltarPara: "aprovado" ele volta pronto para ser produzido como está. Item cuja arte está sendo produzida neste momento não pode ser reprovado — espere terminar.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      planoId: z.string().optional().describe('A leva. Sem isto, a que está em aberto.'),
      itemId: z.string().describe('O item (de ver-plano).'),
      motivo: z.string().describe('Por que não serve. Obrigatório — é o que ensina o sistema.'),
      voltarPara: z
        .enum(['editado', 'aprovado'])
        .optional()
        .describe('"editado" (padrão, para você ajustar) ou "aprovado" (produzir de novo como está).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ regenerarItem }, { ROTULO_DO_STATUS }, { quemDecidiu, resolverPlano }] = await Promise.all([
        import('../../planos/regenerar'),
        import('../../planos/vocabulario'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const planoId = await resolverPlano(projectId, args.planoId)

      const r = await regenerarItem({
        projectId,
        planoId,
        itemId: args.itemId as string,
        motivo: args.motivo as string,
        voltarPara: typeof args.voltarPara === 'string' ? args.voltarPara : null,
        decididoPor: await quemDecidiu(projectId, principal),
      })

      return {
        itemId: r.itemId,
        situacao: ROTULO_DO_STATUS[r.situacao],
        motivoRegistrado: r.motivo,
        mensagem: r.mensagem,
      }
    },
  }),

  definirTool({
    nome: 'executar-plano',
    descricao:
      'Manda o Studio PRODUZIR as artes dos itens da leva. É o ÚNICO ponto de todo o plano que gasta crédito.\n\nFunciona em DUAS chamadas, e a do meio é a pessoa:\n\n1. Chame SEM `confirmar`. Nada é produzido e nada é cobrado — a resposta é a conta: quantas artes saem por IA (com o custo em créditos), quantas saem de modelo do cliente (sem custo nenhum) e qual é o saldo hoje.\n2. Mostre essa conta a quem está falando com você, com todas as letras, e pergunte se pode tocar. Só chame de novo, com `confirmar: true`, DEPOIS do sim explícito dessa pessoa.\n\nNunca confirme por conta própria. Nem quando ela já tiver dito antes "pode fazer tudo" (ela ainda não tinha visto a conta), nem quando a conta der zero crédito, nem para "adiantar". Se houver qualquer hesitação, não chame.\n\nNa segunda chamada, as artes por IA entram na fila e ficam prontas sozinhas em alguns minutos (acompanhe com ver-plano, que é onde a situação é atualizada); as de modelo são montadas na hora, uma a uma. Leva grande pode não caber de uma vez: a resposta diz quantos itens ficaram para depois, e basta chamar de novo com `confirmar: true` para continuar de onde parou. Item que falha não derruba os outros — cada falha vem com o motivo.\n\nUse `itemIds` para produzir só uma parte da leva. Item reprovado é pulado de propósito: passe antes por regenerar-item.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      planoId: z.string().optional().describe('A leva. Sem isto, a que está em aberto.'),
      itemIds: z
        .array(z.string())
        .optional()
        .describe('Só estes itens (de ver-plano). Sem isto, todos os que estiverem prontos para produzir.'),
      confirmar: z
        .boolean()
        .optional()
        .describe('Só depois de a pessoa ver a conta e dizer sim. Sem isto a ferramenta apenas calcula e não produz nada.'),
    }),
    // Gasta crédito e chama modelo de imagem externo (openWorld) — mas o
    // freio de verdade é o gate mecânico do serviço: sem `confirmar: true`
    // literal, a chamada só calcula. destructive fica false para a 1ª chamada
    // (a conta) não tropeçar em confirmação de cliente MCP.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ executarPlano }, { resolverPlano, resolverDono }] = await Promise.all([
        import('../../planos/executar-plano'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const planoId = await resolverPlano(projectId, args.planoId)

      const dono = await resolverDono(projectId, principal)
      const r = await executarPlano({
        projectId,
        planoId,
        itemIds: Array.isArray(args.itemIds)
          ? (args.itemIds as string[])
          : undefined,
        confirmar: args.confirmar === true,
        actorClerkId: dono.clerkId,
        donoUserId: dono.id,
        decididoPor: dono.id,
      })

      return {
        planoId: r.planoId,
        conta: {
          artesPorIA: r.conta.porIA,
          artesPorModelo: r.conta.porModelo,
          creditos: r.conta.creditos,
          saldo: r.conta.saldo,
          resumo: r.conta.resumo,
        },
        ...(r.confirmacaoNecessaria ? { confirmacaoNecessaria: true } : {}),
        mensagem: r.mensagem,
        ...(r.executados.length > 0 ? { produzindo: r.executados } : {}),
        ...(r.falhas.length > 0 ? { falhas: r.falhas } : {}),
        ...(r.ignorados.length > 0 ? { pulados: r.ignorados } : {}),
        ...(r.faltaram ? { faltaram: r.faltaram } : {}),
        ...(r.progresso ? { progresso: r.progresso.frase } : {}),
        ...(r.avisos ? { avisos: r.avisos } : {}),
      }
    },
  }),

  definirTool({
    nome: 'listar-combinacoes-de-texto',
    apelidos: ['list-font-combinations'],
    descricao:
      'Composições de texto prontas do cliente, com posição, tamanho e cor já ajustados à marca. Escolher uma e só trocar as palavras costuma dar resultado melhor do que posicionar tudo na mão. Repare em quantos campos cada uma tem: texto longo demais para os campos disponíveis fica sobreposto na arte.',
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { listFontCombinations } = await import('../../creatives/arte-livre')
      return listFontCombinations(args.projectId as number)
    },
  }),
]
