/**
 * Os GRADIENTES DA MARCA como template para cada cliente — o mesmo conjunto que
 * a Real ganhou no template 427 (medido pela Roberta em 10/09/2026): um tom
 * escuro e um claro da marca, cada um no rodapé e no topo, sobre uma foto de
 * exemplo do próprio cliente. Pedido do Ciro (11/09/2026): "vai me ajudar dar
 * um ponto de partida para personalização em cada um".
 *
 *   npx tsx scripts/criar-templates-de-gradiente.ts            # simulação (default)
 *   npx tsx scripts/criar-templates-de-gradiente.ts --aplicar  # grava
 *   npx tsx scripts/criar-templates-de-gradiente.ts --aplicar --so 3,6
 *
 * - A CURVA é a da Real (11 paradas, sólida no pé e sumindo perto do meio), e
 *   todas as paradas levam a MESMA cor — cor diferente numa ponta acinzenta o
 *   meio (regra de gradients-library.ts).
 * - O ESCURO é o dark da marca em `Project.assinatura.mancha` — o mesmo que o
 *   compositor usa no gradiente de leitura. O CLARO é o creme/branco da paleta
 *   ou do texto da assinatura.
 * - Rodapé a 11° e topo a 169° (180 − 11), como os da Real.
 * - Páginas de CONTEÚDO (isTemplate false): recurso da marca para copiar, nunca
 *   modelo que entra no rodízio.
 * - Cliente que já tem o template (tag `gradientes-da-marca`) é pulado.
 *
 * Para o compositor usar um gradiente personalizado: copie a camada de
 * gradiente para a página de assinatura do cliente — ela manda na cor e na curva.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { gradientesDoProjeto } from '@/lib/assets/gradients-library'
import { createId } from '@/lib/id'
import type { Layer } from '@/types/template'

const TAG = 'gradientes-da-marca'

interface Tom {
  nome: string
  cor: string
}

const CLIENTES: Record<number, { escuro: Tom; claro: Tom; foto: string }> = {
  2: { escuro: { nome: 'Escuro da marca', cor: '#1F1B16' }, claro: { nome: 'Creme', cor: '#F5F0E8' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/179VzvdbjDqpA-Xs_sy8d3dqtxx_tW541-s1920.jpg' },
  3: { escuro: { nome: 'Escuro da marca', cor: '#130D0A' }, claro: { nome: 'Creme', cor: '#F8F2F0' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1uivcZexnqH2YjFV_n6gf0c_B7oLw8mYe-s1920.jpg' },
  4: { escuro: { nome: 'Escuro da marca', cor: '#0E0B08' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1uwFj_UcSpCIC9tLng1RiYf35c2WYdq7V-s1920.jpg' },
  5: { escuro: { nome: 'Escuro da marca', cor: '#1A1410' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1BXrT2tJ8nh3TN_1b7zVpZ4i05HCVUOH4-s1920.jpg' },
  6: { escuro: { nome: 'Escuro da marca', cor: '#170E09' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1SRWF7BH-uR_b68r7pW_SGMpLBgN6UKm--s1920.jpg' },
  7: { escuro: { nome: 'Escuro da marca', cor: '#111111' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1_tXR87_9RfN3YzpF5jshbaoaGEWhSlKL-s1920.jpg' },
  8: { escuro: { nome: 'Escuro da marca', cor: '#0B0B0B' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/compor/lagosta-setembro/magrao-CMT00667.jpg' },
  11: { escuro: { nome: 'Escuro da marca', cor: '#240000' }, claro: { nome: 'Creme Off-White', cor: '#F9F7F2' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1X1XBPLMRC6cKxTj-7_u7yvZJckm5wxcX-s1920.jpg' },
  12: { escuro: { nome: 'Escuro da marca', cor: '#2C3445' }, claro: { nome: 'Branco', cor: '#FFFFFF' }, foto: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1xPrrzlwvePX6zrlztgSsKBgJg-7Su8uF-s1920.jpg' },
}

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** As paradas da curva medida na Real, trocando só a cor. */
function paradasCom(cor: string) {
  const verde = gradientesDoProjeto(1).daMarca.find((g) => g.id === 'real-verde-rodape')
  if (!verde) throw new Error('A curva da Real não está em GRADIENTES_POR_PROJETO — nada a copiar.')
  return verde.gradientStops.map((s, i) => ({ id: String(i + 1), position: s.position, color: cor, opacity: s.opacity }))
}

function camadasDaPagina(tom: Tom, borda: 'rodape' | 'topo', foto: string): Layer[] {
  const nome = `Gradiente ${tom.nome} — ${borda === 'rodape' ? 'rodapé' : 'topo'}`
  return [
    {
      id: 'foto',
      type: 'image',
      name: 'Foto de fundo (exemplo)',
      visible: true,
      locked: false,
      order: 0,
      position: { x: 0, y: 0 },
      size: { width: 1080, height: 1920 },
      rotation: 0,
      fileUrl: foto,
      style: { objectFit: 'cover', cropPosition: 'center-middle' },
    },
    {
      id: `gradiente-${slug(tom.nome)}-${borda}`,
      type: 'gradient',
      name: nome,
      visible: true,
      locked: false,
      order: 1,
      position: { x: 0, y: 0 },
      size: { width: 1080, height: 1920 },
      rotation: 0,
      style: { gradientType: 'linear', gradientAngle: borda === 'rodape' ? 11 : 169, gradientStops: paradasCom(tom.cor) },
    },
  ] as Layer[]
}

/** Miniatura em JPEG pequeno no Blob — é o que dá capa à pasta na aba Templates. */
async function miniatura(layers: Layer[], fundo: string, chave: string): Promise<string | null> {
  try {
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920, backgroundColor: fundo }, layers }, {})
    const sharp = (await import('sharp')).default
    const jpg = await sharp(png).resize(360).jpeg({ quality: 82 }).toBuffer()
    const { put } = await import('@vercel/blob')
    const blob = await put(`templates/gradientes-da-marca/${chave}-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg' })
    return blob.url
  } catch (erro) {
    console.log(`    (miniatura não saiu: ${erro instanceof Error ? erro.message : String(erro)})`)
    return null
  }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const so = argumento('--so')?.split(',').map(Number) ?? null
  const ids = Object.keys(CLIENTES).map(Number).filter((id) => !so || so.includes(id))

  for (const projectId of ids) {
    const cliente = CLIENTES[projectId]
    const projeto = await db.project.findUnique({ where: { id: projectId }, select: { name: true, userId: true } })
    if (!projeto) {
      console.log(`✗ projeto ${projectId} não existe`)
      continue
    }
    const existente = await db.template.findFirst({ where: { projectId, tags: { has: TAG } }, select: { id: true } })
    if (existente) {
      console.log(`= ${projeto.name}: já tem o template ${existente.id} — pulado`)
      continue
    }
    const paginas: Array<{ nome: string; tom: Tom; borda: 'rodape' | 'topo' }> = [
      { nome: `Gradiente ${cliente.escuro.nome} — rodapé`, tom: cliente.escuro, borda: 'rodape' },
      { nome: `Gradiente ${cliente.escuro.nome} — topo`, tom: cliente.escuro, borda: 'topo' },
      { nome: `Gradiente ${cliente.claro.nome} — rodapé`, tom: cliente.claro, borda: 'rodape' },
      { nome: `Gradiente ${cliente.claro.nome} — topo`, tom: cliente.claro, borda: 'topo' },
    ]
    console.log(`${aplicar ? '✓' : '·'} ${projeto.name}: "${projeto.name} — Gradientes da marca" com ${paginas.map((p) => `${p.nome} (${p.tom.cor})`).join(', ')}`)
    if (!aplicar) continue

    const template = await db.template.create({
      data: {
        name: `${projeto.name} — Gradientes da marca`,
        type: 'STORY',
        dimensions: '1080x1920',
        designData: {},
        tags: ['recursos-da-marca', TAG],
        projectId,
        createdBy: projeto.userId,
      },
      select: { id: true },
    })
    let capa: string | null = null
    for (const [ordem, p] of paginas.entries()) {
      const layers = camadasDaPagina(p.tom, p.borda, cliente.foto)
      const thumb = await miniatura(layers, p.tom.cor, `${projectId}-${slug(p.nome)}`)
      capa = capa ?? thumb
      await db.page.create({
        data: {
          id: createId(),
          name: p.nome,
          width: 1080,
          height: 1920,
          layers: layers as never,
          background: p.tom.cor,
          order: ordem,
          templateId: template.id,
          isTemplate: false,
          tags: ['recursos-da-marca', 'gradiente'],
          ...(thumb ? { thumbnail: thumb } : {}),
        },
      })
    }
    if (capa) await db.template.update({ where: { id: template.id }, data: { thumbnailUrl: capa } })
    console.log(`    template ${template.id} criado com ${paginas.length} páginas`)
  }
  console.log(aplicar ? '\nGravado.' : '\nSimulação — nada gravado. Rode com --aplicar para gravar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
