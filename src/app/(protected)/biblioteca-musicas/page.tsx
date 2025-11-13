'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useBibliotecaMusicas, useDeletarMusica, type FaixaMusica } from '@/hooks/use-music-library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Music, Plus, Search, Trash2, Edit } from 'lucide-react';

export default function BibliotecaMusicasPage() {
  const { data: faixasMusica, isLoading } = useBibliotecaMusicas();
  const [termoBusca, setTermoBusca] = useState('');

  const faixasFiltradas = faixasMusica?.filter((faixa) =>
    faixa.name.toLowerCase().includes(termoBusca.toLowerCase()) ||
    faixa.artist?.toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Biblioteca de Músicas</h1>
          <p className="mt-2 text-gray-600">Gerencie faixas de música para exportações de vídeo</p>
        </div>
        <Link href="/biblioteca-musicas/enviar">
          <Button><Plus className="mr-2 h-4 w-4" />Enviar Música</Button>
        </Link>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar por nome ou artista..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        {isLoading ? (
          <p>Carregando...</p>
        ) : faixasFiltradas && faixasFiltradas.length > 0 ? (
          <div className="grid gap-4">
            {faixasFiltradas.map((faixa) => (
              <div key={faixa.id} className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="font-medium">{faixa.name}</p>
                  <p className="text-sm text-gray-500">{faixa.artist || 'Sem artista'}</p>
                </div>
                <div className="flex gap-2">
                  <audio src={faixa.blobUrl} controls className="h-8" />
                  <Link href={`/biblioteca-musicas/${faixa.id}/editar`}>
                    <Button size="sm" variant="ghost"><Edit className="h-4 w-4" /></Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Music className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500">Nenhuma música encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}
