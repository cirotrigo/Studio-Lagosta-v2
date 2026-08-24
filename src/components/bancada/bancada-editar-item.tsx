'use client'

/**
 * Edição de um card da fila — copy, legenda, direção, ajuste da foto e a
 * própria foto — sem sair da bancada.
 *
 * Antes disto o card do plano era pegar-ou-largar: dava para gerar, agendar ou
 * descartar, mas trocar uma palavra da copy ou a foto exigia ir ao chat
 * (`editar-item-do-plano`). Revisar a leva é exatamente o trabalho da bancada,
 * então a revisão mora aqui.
 *
 * O que cada campo é:
 *  - **copy**: um bloco por linha — a mesma convenção do compositor;
 *  - **legenda**: o texto do post (carrossel/feed);
 *  - **direção adicional** (`pedido`): o que dizer ao modelo além do assunto;
 *  - **ajuste da foto** (`instrucaoImagem`): opt-in de retoque — sem ele a
 *    foto vai intocada;
 *  - **foto**: o mesmo seletor do compositor (acervo + upload), limitado aos
 *    papéis de uma peça.
 *
 * Quem persiste é o CHAMADOR (`onSalvar`): o card local grava no store; o card
 * do plano grava no store E manda `copyProposta`/`legenda`/foto ao servidor —
 * direção e ajuste são parâmetros de GERAÇÃO, não têm coluna no plano, e vivem
 * no navegador (a fusão da hidratação os preserva).
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  ArteIaImagePicker,
  type ReferenciaSelecionada,
} from '@/components/creatives/arte-ia-image-picker'
import type { BancadaItem } from '@/stores/bancada-store'

export interface EdicaoDoItem {
  copy: string[]
  legenda: string | null
  pedido: string
  instrucaoImagem: string | null
  referencias: ReferenciaSelecionada[]
}

/**
 * Desde 23/08/2026 o modal ACEITA VÁRIAS fotos, como o compositor — o Ciro
 * pediu a peça com cena + âncoras + estilo, e o `trocarCena` que vivia aqui
 * (cada foto nova substituía a anterior, conserto de 11/08 para a "âncora
 * silenciosa") impedia exatamente isso.
 *
 * O gesto de TROCAR a cena não se perdeu — mudou de lugar: o chip "cena" da
 * foto nova faz o swap de papéis no próprio seletor (a promovida vira cena, a
 * antiga assume o papel dela). E o acréscimo deixou de ser silencioso porque a
 * lista de selecionadas mostra cada foto com o papel, a prévia no hover e o
 * clique que amplia.
 */

export function BancadaEditarItem({
  item,
  aberto,
  onOpenChange,
  onSalvar,
  salvando = false,
}: {
  item: BancadaItem
  aberto: boolean
  onOpenChange: (v: boolean) => void
  onSalvar: (edicao: EdicaoDoItem) => void
  salvando?: boolean
}) {
  const [copyTexto, setCopyTexto] = React.useState('')
  const [legenda, setLegenda] = React.useState('')
  const [pedido, setPedido] = React.useState('')
  const [instrucao, setInstrucao] = React.useState('')
  const [referencias, setReferencias] = React.useState<ReferenciaSelecionada[]>([])

  // O formulário nasce do item TODA vez que o modal abre — não no mount do
  // componente: o mesmo modal serve cards diferentes ao longo da sessão.
  React.useEffect(() => {
    if (!aberto) return
    setCopyTexto(item.copy.join('\n'))
    setLegenda(item.legenda ?? '')
    setPedido(item.pedido ?? '')
    setInstrucao(item.instrucaoImagem ?? '')
    setReferencias(
      item.referencias.map((r) => ({
        key: r.driveFileId ?? r.url ?? r.thumbUrl,
        papel: r.papel,
        driveFileId: r.driveFileId,
        url: r.url,
        label: r.label,
        thumbUrl: r.thumbUrl,
      })),
    )
  }, [aberto, item])

  const salvar = () => {
    onSalvar({
      copy: copyTexto
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      legenda: legenda.trim() || null,
      pedido: pedido.trim(),
      instrucaoImagem: instrucao.trim() || null,
      referencias,
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar a peça</DialogTitle>
          <DialogDescription>
            {item.tema ? `${item.tema} · ` : ''}o que mudar aqui vale para a próxima geração.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-copy">Texto da arte (um bloco por linha)</Label>
            <Textarea
              id="edit-copy"
              value={copyTexto}
              onChange={(e) => setCopyTexto(e.target.value)}
              rows={4}
              placeholder={'SEXTA É DIA DE HAPPY HOUR\nchopp em dobro até 20h'}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-legenda">Legenda do post (opcional)</Label>
            <Textarea
              id="edit-legenda"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={2}
              placeholder="Story costuma ir sem legenda."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-pedido">Direção adicional (opcional)</Label>
            <Input
              id="edit-pedido"
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="ex.: clima de fim de tarde, tom quente, sem gente na foto"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-instrucao">Ajuste da foto (opcional)</Label>
            <Input
              id="edit-instrucao"
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              placeholder="ex.: clarear um pouco, tirar o fundo da direita"
            />
            <p className="text-[11px] text-muted-foreground">
              Sem instrução a foto vai intocada — é o padrão.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Fotos da peça (a 1ª é a cena; para trocar a cena, toque no chip &quot;cena&quot; de outra foto)</Label>
            <ArteIaImagePicker
              projectId={item.projectId}
              referencias={referencias}
              onChange={setReferencias}
              alturaDaGrade="38dvh"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
