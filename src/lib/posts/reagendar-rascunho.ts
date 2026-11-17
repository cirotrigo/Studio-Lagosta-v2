/** Operação restrita: não aprova, não publica, não refila páginas nem chama provedores.
 * Autorização de curador/projeto vem da porta MCP; pertencimento e CAS são repetidos aqui.
 * Nenhuma exclusão: arquivamento recuperável exige contrato próprio.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { CreativeError } from '@/lib/creatives/errors';
import { chaveDaAgenda } from '@/lib/trava-por-chave';
import { formatoDoTipo, ocupaOSlot } from './contexto-da-semana';
import { TOLERANCIA_SLOT_MIN } from './cobertura';

const iso = z
  .string()
  .refine(
    (s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s,
    'Use ISO UTC canônico com milissegundos'
  );
const entradaSchema = z
  .object({
    projectId: z.number().int().positive(),
    postId: z.string().min(1),
    versaoEsperada: iso,
    quandoISO: iso,
  })
  .strict();
const semEnvio = {
  laterPostId: null,
  bufferId: null,
  sentAt: null,
  bufferSentAt: null,
  instagramMediaId: null,
  publishedUrl: null,
  latePublishedAt: null,
  latePlatformUrl: null,
};

export async function reagendarRascunho(entrada: unknown, cliente = db) {
  const e = entradaSchema.parse(entrada);
  const quando = new Date(e.quandoISO);
  if (quando.getTime() <= Date.now())
    throw new CreativeError(
      'DATA_NO_PASSADO',
      'Escolha um horário futuro.',
      400
    );
  return cliente.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${chaveDaAgenda(e.projectId)}))`;
      await tx.$queryRaw`SELECT id FROM "SocialPost" WHERE id = ${e.postId} AND "projectId" = ${e.projectId} FOR UPDATE`;
      const post = await tx.socialPost.findFirst({
        where: { id: e.postId, projectId: e.projectId },
      });
      if (!post || post.projectId !== e.projectId)
        throw new CreativeError(
          'POST_NAO_ENCONTRADO',
          'Rascunho não encontrado neste projeto.',
          404
        );
      if (post.status !== 'DRAFT')
        throw new CreativeError(
          'POST_NAO_E_RASCUNHO',
          'Só rascunhos podem ser alterados por esta operação.',
          409
        );
      if (Object.keys(semEnvio).some((k) => post[k] != null))
        throw new CreativeError(
          'RASCUNHO_COM_ENVIO',
          'Há registro de envio/publicação. Confira a agenda; nada foi alterado.',
          409
        );
      if (post.isRecurring || post.scheduleType !== 'SCHEDULED')
        throw new CreativeError(
          'RASCUNHO_RECORRENTE',
          'Só rascunho de horário único é aceito.',
          409
        );
      if (post.updatedAt.toISOString() !== e.versaoEsperada)
        throw new CreativeError(
          'VERSAO_DO_POST_MUDOU',
          'O post mudou. Consulte ver-agenda antes de tentar novamente.',
          409
        );
      if (quando.getTime() <= Date.now())
        throw new CreativeError(
          'DATA_NO_PASSADO',
          'O horário venceu durante a espera.',
          409
        );
      const tolerancia = TOLERANCIA_SLOT_MIN * 60000;
      const vizinhos = await tx.socialPost.findMany({
        where: {
          projectId: e.projectId,
          id: { not: e.postId },
          scheduledDatetime: {
            gte: new Date(quando.getTime() - tolerancia),
            lte: new Date(quando.getTime() + tolerancia),
          },
        },
        select: { postType: true, scheduledDatetime: true },
      });
      if (
        vizinhos.some(
          (p) =>
            p.scheduledDatetime &&
            ocupaOSlot(
              {
                t: p.scheduledDatetime.getTime(),
                formato: formatoDoTipo(p.postType),
              },
              quando.getTime(),
              formatoDoTipo(post.postType),
              TOLERANCIA_SLOT_MIN
            )
        )
      )
        throw new CreativeError(
          'HORARIO_OCUPADO',
          'Outro post ocupa este horário/formato. Consulte a agenda.',
          409
        );
      const updatedAt = new Date(
        Math.max(Date.now(), post.updatedAt.getTime() + 1)
      );
      const r = await tx.socialPost.updateMany({
        where: {
          id: e.postId,
          projectId: e.projectId,
          status: 'DRAFT',
          updatedAt: new Date(e.versaoEsperada),
          isRecurring: false,
          scheduleType: 'SCHEDULED',
          ...semEnvio,
        },
        data: { scheduledDatetime: quando, updatedAt },
      });
      if (r.count !== 1)
        throw new CreativeError(
          'VERSAO_DO_POST_MUDOU',
          'O post mudou durante a operação; nada foi reagendado.',
          409
        );
      return {
        postId: e.postId,
        situacao: 'rascunho' as const,
        quandoISO: quando.toISOString(),
        versao: updatedAt.toISOString(),
        mensagem:
          'Horário do rascunho alterado. Não aprova nem publica. A pasta/nome da arte não foi alterada.',
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 20000 }
  );
}
