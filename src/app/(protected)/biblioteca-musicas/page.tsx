'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useBibliotecaMusicas, useDeletarMusica, type FaixaMusica } from '@/hooks/use-music-library';
import { useMusicStemStatus } from '@/hooks/use-music-stem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Music, Plus, Search, Trash2, Edit, MicOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MusicPlayer } from '@/components/music/music-player';
import { YoutubeJobsList } from '@/components/youtube/youtube-jobs-list';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Componente auxiliar para exibir badges de stem
function MusicStemBadge({ musicId }: { musicId: number }) {
  const { data: stemStatus } = useMusicStemStatus(musicId);

  if (!stemStatus) return null;

  // Stem instrumental completo e disponível
  if (stemStatus.hasInstrumentalStem) {
    return (
      <Badge variant="secondary" className="text-xs">
        <MicOff className="h-3 w-3 mr-1" />
        Instrumental
      </Badge>
    );
  }

  // Processando
  if (stemStatus.job?.status === 'processing') {
    return (
      <Badge variant="outline" className="text-xs">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {stemStatus.job.progress}%
      </Badge>
    );
  }

  // Pendente
  if (stemStatus.job?.status === 'pending') {
    return (
      <Badge variant="outline" className="text-xs text-gray-500">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Na fila
      </Badge>
    );
  }

  // Falhou
  if (stemStatus.job?.status === 'failed') {
    return (
      <Badge variant="destructive" className="text-xs">
        Erro
      </Badge>
    );
  }

  return null;
}

// Componente auxiliar para player com busca de stems
function MusicPlayerWithStems({ faixa }: { faixa: FaixaMusica }) {
  const { data: stemStatus } = useMusicStemStatus(faixa.id);

  return (
    <MusicPlayer
      originalUrl={faixa.blobUrl}
      instrumentalUrl={stemStatus?.instrumentalUrl}
      musicName={faixa.name}
    />
  );
}

export default function BibliotecaMusicasPage() {
  const { data: faixasMusica, isLoading } = useBibliotecaMusicas();
  const deletarMusica = useDeletarMusica();
  const { toast } = useToast();
  const [termoBusca, setTermoBusca] = useState('');
  const [musicaParaDeletar, setMusicaParaDeletar] = useState<FaixaMusica | null>(null);

  const faixasFiltradas = faixasMusica?.filter((faixa) =>
    faixa.name.toLowerCase().includes(termoBusca.toLowerCase()) ||
    faixa.artist?.toLowerCase().includes(termoBusca.toLowerCase())
  );

  const handleDeletar = async () => {
    if (!musicaParaDeletar) return;

    try {
      await deletarMusica.mutateAsync(musicaParaDeletar.id);
      toast({
        title: 'Música excluída',
        description: `"${musicaParaDeletar.name}" foi excluída com sucesso.`,
      });
      setMusicaParaDeletar(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a música. Tente novamente.',
      });
    }
  };

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

      <YoutubeJobsList />

      <div className="rounded-lg border bg-white p-4">
        {isLoading ? (
          <p>Carregando...</p>
        ) : faixasFiltradas && faixasFiltradas.length > 0 ? (
          <div className="grid gap-4">
            {faixasFiltradas.map((faixa) => (
              <div key={faixa.id} className="flex items-center justify-between border-b pb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{faixa.name}</p>
                    <MusicStemBadge musicId={faixa.id} />
                  </div>
                  <p className="text-sm text-gray-500">{faixa.artist || 'Sem artista'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <MusicPlayerWithStems faixa={faixa} />
                  <Link href={`/biblioteca-musicas/${faixa.id}/editar`}>
                    <Button size="sm" variant="ghost"><Edit className="h-4 w-4" /></Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMusicaParaDeletar(faixa)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
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

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!musicaParaDeletar} onOpenChange={(open) => !open && setMusicaParaDeletar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a música "{musicaParaDeletar?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletar}
              className="bg-red-500 hover:bg-red-600"
              disabled={deletarMusica.isPending}
            >
              {deletarMusica.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
