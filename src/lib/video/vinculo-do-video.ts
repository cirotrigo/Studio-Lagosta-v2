/**
 * A página de onde um vídeo exportado saiu (`fieldValues.videoDaPagina.pageId`),
 * conferida contra o PROJETO da Generation: o vínculo é texto num JSON e não
 * prova dono.
 *
 * É o que deixa o post agendado pelo vídeo da galeria (só com `generationId`)
 * nascer ligado à página — e com ela o "Editar vídeo" da agenda. Sem
 * conferência, um `pageId` de outro cliente viraria a página do post.
 */
import { lerVideoDaPagina } from './destino-do-video'

interface LeitorDePagina {
  page: {
    findFirst(args: {
      where: { id: string; Template: { projectId: number } }
      select: { id: true; templateId: true }
    }): Promise<{ id: string; templateId: number } | null>
  }
}

export async function vinculoDoVideo(
  leitor: unknown,
  geracao: { projectId: number | null; fieldValues: unknown },
): Promise<{ pageId: string; templateId: number } | null> {
  const video = lerVideoDaPagina(geracao.fieldValues)
  if (!video || geracao.projectId == null) return null
  const page = await (leitor as LeitorDePagina).page.findFirst({
    where: { id: video.pageId, Template: { projectId: geracao.projectId } },
    select: { id: true, templateId: true },
  })
  return page ? { pageId: page.id, templateId: page.templateId } : null
}
