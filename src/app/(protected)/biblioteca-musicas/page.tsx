'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBibliotecaMusicas, useDeletarMusica, type FaixaMusica } from '@/hooks/use-music-library';
import { useMusicStemStatus } from '@/hooks/use-music-stem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Music, Plus, Search, MicOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MusicWaveformPlayer } from '@/components/music/music-waveform-player';
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
      <Badge variant="outline" className="text-xs text-muted-foreground">
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

// Componente para renderizar cada item de música
interface MusicItemProps {
  faixa: FaixaMusica;
  onDownload: (faixa: FaixaMusica) => void;
  onEdit: (id: number) => void;
  onDelete: (faixa: FaixaMusica) => void;
  isDownloading: boolean;
}

function MusicItem({ faixa, onDownload, onEdit, onDelete, isDownloading }: MusicItemProps) {
  const { data: stemStatus } = useMusicStemStatus(faixa.id);

  return (
    <MusicWaveformPlayer
      originalUrl={faixa.blobUrl}
      instrumentalUrl={stemStatus?.instrumentalUrl}
      musicName={faixa.name}
      artist={faixa.artist}
      duration={faixa.duration}
      onDownload={() => onDownload(faixa)}
      onEdit={() => onEdit(faixa.id)}
      onDelete={() => onDelete(faixa)}
      isDownloading={isDownloading}
      stemBadge={<MusicStemBadge musicId={faixa.id} />}
    />
  );
}

export default function BibliotecaMusicasPage() {
  const router = useRouter();
  const { data: faixasMusica, isLoading } = useBibliotecaMusicas();
  const deletarMusica = useDeletarMusica();
  const { toast } = useToast();
  const [termoBusca, setTermoBusca] = useState('');
  const [musicaParaDeletar, setMusicaParaDeletar] = useState<FaixaMusica | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a música. Tente novamente.',
      });
    }
  };

  const handleDownloadZip = async (faixa: FaixaMusica) => {
    try {
      setDownloadingId(faixa.id);

      const response = await fetch(`/api/biblioteca-musicas/${faixa.id}/download-zip`);

      if (!response.ok) {
        throw new Error('Erro ao gerar arquivo ZIP');
      }

      // Criar blob e fazer download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extrair nome do arquivo do header Content-Disposition ou usar fallback
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename="(.+)"/);
      const fileName = fileNameMatch ? fileNameMatch[1] : `${faixa.name}.zip`;

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Download iniciado',
        description: `Baixando "${faixa.name}" com as versões original e instrumental.`,
      });
    } catch (error) {
      console.error('Erro ao baixar ZIP:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao baixar',
        description: 'Não foi possível gerar o arquivo ZIP. Tente novamente.',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Helper function to get stem status for a music track
  const getStemStatus = (musicId: number) => {
    // This would need to be implemented with the actual hook
    // For now, return null
    return null;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Biblioteca de Músicas
          </h1>
          <p className="mt-2 text-muted-foreground">
            Gerencie faixas de música para exportações de vídeo
          </p>
        </div>
        <Link href="/biblioteca-musicas/enviar">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Enviar Música
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome ou artista..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
      </div>

      {/* YouTube Jobs List */}
      <div className="mb-6">
        <YoutubeJobsList />
      </div>

      {/* Music List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : faixasFiltradas && faixasFiltradas.length > 0 ? (
          faixasFiltradas.map((faixa) => (
            <MusicItem
              key={faixa.id}
              faixa={faixa}
              onDownload={handleDownloadZip}
              onEdit={(id) => router.push(`/biblioteca-musicas/${id}/editar`)}
              onDelete={setMusicaParaDeletar}
              isDownloading={downloadingId === faixa.id}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Music className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhuma música encontrada</h3>
            <p className="text-muted-foreground mb-6">
              {termoBusca
                ? 'Tente ajustar sua busca ou adicione uma nova música'
                : 'Comece adicionando músicas à sua biblioteca'}
            </p>
            <Link href="/biblioteca-musicas/enviar">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Enviar Música
              </Button>
            </Link>
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
              className="bg-destructive hover:bg-destructive/90"
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
