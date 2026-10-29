'use client'

import * as React from 'react'
import { Eye } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useExibicaoDoEditor } from '@/hooks/use-exibicao-do-editor'

/**
 * O menu "Exibir" da barra do editor (L2 das linhas-guia): as quatro escolhas de exibição com os atalhos ao lado.
 * O mesmo estado das teclas R, M e C — alternar aqui ou no teclado dá no mesmo, e fica salvo por pessoa.
 */
export function MenuExibir() {
  const { exibicao, definir } = useExibicaoDoEditor()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" title="O que o editor mostra por cima da arte (nada disso sai no download)">
          <Eye className="mr-2 h-4 w-4" />
          Exibir
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Por cima da arte</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={exibicao.margens} onCheckedChange={(v) => definir('margens', v === true)}>
          Margens da marca
          <DropdownMenuShortcut>R</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={exibicao.interface} onCheckedChange={(v) => definir('interface', v === true)}>
          Interface do Instagram (Story)
          <DropdownMenuShortcut>M</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={exibicao.bordas} onCheckedChange={(v) => definir('bordas', v === true)}>
          Bordas da página
          <DropdownMenuShortcut>C</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={exibicao.encaixe} onCheckedChange={(v) => definir('encaixe', v === true)}>
          Encaixe ao arrastar
          <DropdownMenuShortcut>Alt desliga</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
