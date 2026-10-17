/**
 * Leitura da carteira para a auditoria de operação (H2 do Dot, 13/10/2026).
 *
 * Um número FIXO de consultas para a carteira inteira, todas com
 * `projectId in [...]`, nunca uma por cliente: projetos, histórico de POSTED,
 * posts da janela, entradas de grade e assinaturas em paralelo, e depois as
 * campanhas citadas. A decisão (expectativa, cobertura, ação) é toda de
 * `cobertura.ts`, que é puro.
 *
 * SÓ LEITURA. Diferente de `sugerirPosts`, aqui não se registra sugestão
 * nem sinal de aprendizado: auditar não é propor, e um slot que ninguém viu
 * não pode entrar no denominador da taxa de aceitação.
 */

import {
  resumoDoGateDosPosts,
  resumoVazio,
  TETO_DE_POSTS_DO_GATE,
  type ResumoDoGateDaCarteira,
} from '@/lib/creatives/revisao/gate-resumo';
import { db } from '@/lib/db';
import { NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura';
import {
  auditarCarteira,
  JANELA_HISTORICO_DIAS,
  TARGET_DAYS_AHEAD,
  TOLERANCIA_SLOT_MIN,
  type AuditoriaDaCarteira,
} from '@/lib/posts/cobertura';
import {
  inicioDoDiaBRT,
  janelaDaSugestao,
  janelaDeConsultaDeOcupacao,
} from '@/lib/posts/contexto-da-semana';

/**
 * `permitidos` = o escopo do principal (`projetosVisiveis`): `null` só para o
 * principal de serviço, que enxerga a carteira toda. Quem resolve o escopo é a
 * tool, não este módulo.
 */
export async function auditarOperacao(args: {
  permitidos: number[] | null;
  agora?: Date;
}): Promise<AuditoriaDaCarteira> {
  const agora = args.agora ?? new Date();
  const projetos = await db.project.findMany({
    where: {
      status: 'ACTIVE',
      ...(args.permitidos ? { id: { in: args.permitidos } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const vazio = {
    historico: [],
    posts: [],
    entradasDaGrade: [],
    campanhas: [],
    comAssinatura: new Set<number>(),
    agora,
  };
  if (projetos.length === 0)
    return {
      ...auditarCarteira({ projetos, ...vazio }),
      // CP5e § 2: o bloco `gate` está SEMPRE na resposta — sem projetos, vazio.
      gate: resumoDoGateDosPosts({ posts: [], generations: [], pages: [], permitidos: args.permitidos }).total,
    };

  const ids = projetos.map((p) => p.id);
  const inicioHistorico = new Date(
    agora.getTime() - JANELA_HISTORICO_DIAS * 24 * 3600_000
  );
  // Do começo de HOJE (as falhas de hoje que já passaram contam) ao fim de
  // depois de amanhã, alargado pela tolerância do slot dos dois lados (R27).
  const janela = janelaDaSugestao({ agora, dias: TARGET_DAYS_AHEAD + 1 });
  const consulta = janelaDeConsultaDeOcupacao(
    { inicio: inicioDoDiaBRT(janela.datas[0]), fim: janela.fim },
    TOLERANCIA_SLOT_MIN
  );

  const [historico, posts, entradasDaGrade, assinaturas, semHorario] =
    await Promise.all([
      // A mesma população da cadência de `sugerirPosts`: só POSTED, sem PONTUAL.
      db.socialPost.findMany({
        where: {
          projectId: { in: ids },
          status: 'POSTED',
          scheduledDatetime: { gte: inicioHistorico, lte: agora },
          learningScope: { not: 'PONTUAL' },
        },
        select: {
          projectId: true,
          scheduledDatetime: true,
          origem: true,
          learningScope: true,
          campaignId: true,
          postType: true,
        },
      }),
      // Todas as situações, FAILED inclusive: falha não cobre, mas ocupa o
      // horário (não se compõe por cima) e é relatada.
      db.socialPost.findMany({
        where: {
          projectId: { in: ids },
          scheduledDatetime: { gte: consulta.inicio, lte: consulta.fim },
        },
        select: {
          id: true,
          projectId: true,
          scheduledDatetime: true,
          postType: true,
          status: true,
          mediaUrls: true,
          pageId: true,
          // CP5e § 2: o bloco `gate` lê o registro da Generation do post.
          generationId: true,
          renderStatus: true,
          renderError: true,
          errorMessage: true,
          verificationStatus: true,
          campaignId: true,
        },
        orderBy: { scheduledDatetime: 'asc' },
      }),
      // O mesmo filtro da grade em `sugerirPosts`. Falha aqui degrada para a cadência, como lá.
      db.knowledgeBaseEntry
        .findMany({
          where: {
            projectId: { in: ids },
            status: 'ACTIVE',
            category: { in: ['POLITICAS', 'HORARIOS'] },
            OR: [
              {
                title: { contains: 'Padrões de Postagem', mode: 'insensitive' },
              },
              { tags: { hasSome: ['grade', 'cadencia'] } },
            ],
          },
          select: { projectId: true, title: true, content: true },
        })
        .catch((erro: unknown) => {
          console.error(
            '[auditar-operacao] não deu para ler as grades da base (seguindo pela cadência):',
            erro
          );
          return [] as Array<{
            projectId: number;
            title: string;
            content: string;
          }>;
        }),
      // A mesma regra de `projetoTemAssinatura`: o template "Assinatura" com ao menos uma página.
      db.template.findMany({
        where: {
          projectId: { in: ids },
          name: NOME_DO_TEMPLATE_DE_ASSINATURA,
          Page: { some: {} },
        },
        select: { projectId: true },
      }),
      // Rascunho sem horário não ocupa slot, mas pode ser a peça de um vazio.
      db.socialPost.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: ids },
          status: 'DRAFT',
          scheduledDatetime: null,
        },
        _count: { _all: true },
      }),
    ]);

  // Campanhas citadas pelo histórico (encerrada sai da cadência) e pela janela
  // (vencida não cobre). Leitura defensiva como `campanhasEncerradas`: erro
  // vira "nenhuma campanha com prazo", nunca derruba a auditoria.
  const citadas = Array.from(
    new Set(
      [...historico, ...posts]
        .map((p) => p.campaignId)
        .filter((id): id is string => !!id)
    )
  );
  const campanhas = citadas.length
    ? await db.knowledgeBaseEntry
        .findMany({
          where: {
            id: { in: citadas },
            projectId: { in: ids },
            expiresAt: { not: null },
          },
          select: { id: true, projectId: true, expiresAt: true },
        })
        .catch((erro: unknown) => {
          console.error(
            '[auditar-operacao] não deu para conferir a vigência das campanhas:',
            erro
          );
          return [] as Array<{
            id: string;
            projectId: number;
            expiresAt: Date | null;
          }>;
        })
    : [];

  // CP5e § 2 — o bloco `gate`: só LEITURA do registro (CP5b) dos posts da janela, em DUAS consultas (sem N+1), com
  // teto por chamada; o vínculo post → Generation → página → projeto é conferido no resumo (fail-closed). Falha aqui
  // degrada para "sem bloco" com o motivo, nunca derruba a auditoria.
  const gate = await resumoDoGateDaJanela(posts, args.permitidos).catch(
    (erro: unknown): GateIndisponivel => {
      console.error(
        '[auditar-operacao] não deu para ler o registro do gate dos posts (o bloco sai como indisponível):',
        erro
      );
      return {
        indisponivel: true,
        motivo: `a leitura do registro do gate falhou: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 160)}`,
      };
    }
  );

  const auditoria = auditarCarteira({
    projetos,
    historico,
    posts,
    entradasDaGrade,
    campanhas,
    comAssinatura: new Set(assinaturas.map((t) => t.projectId)),
    rascunhosSemHorario: new Map(
      semHorario.map((g) => [g.projectId, g._count._all])
    ),
    agora,
  });
  if ('indisponivel' in gate) return { ...auditoria, gate };
  return {
    ...auditoria,
    gate: gate.total,
    clientes: auditoria.clientes.map((c) => ({
      ...c,
      gate: gate.porProjeto.get(c.projectId) ?? resumoVazio(),
    })),
  };
}

/** CP5e § 2: a leitura do registro falhou — o bloco diz isso em vez de sumir (nunca "sem registro"). */
export interface GateIndisponivel {
  indisponivel: true;
  motivo: string;
}

async function resumoDoGateDaJanela(
  posts: Array<{
    id: string;
    projectId: number;
    pageId: string | null;
    generationId: string | null;
  }>,
  permitidos: number[] | null
): Promise<ResumoDoGateDaCarteira> {
  const lidos = posts.slice(0, TETO_DE_POSTS_DO_GATE);
  const generationIds = Array.from(
    new Set(
      lidos.map((p) => p.generationId).filter((id): id is string => !!id)
    )
  );
  const pageIds = Array.from(
    new Set(
      lidos
        .filter((p) => p.generationId)
        .map((p) => p.pageId)
        .filter((id): id is string => !!id)
    )
  );
  const [generations, pages] = await Promise.all([
    generationIds.length
      ? db.generation.findMany({
          where: { id: { in: generationIds } },
          select: { id: true, projectId: true, fieldValues: true },
        })
      : Promise.resolve([]),
    pageIds.length
      ? db.page.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            name: true,
            tags: true,
            width: true,
            height: true,
            background: true,
            layers: true,
            copyAutoral: true,
            Template: { select: { projectId: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  return resumoDoGateDosPosts({ posts, generations, pages, permitidos });
}
