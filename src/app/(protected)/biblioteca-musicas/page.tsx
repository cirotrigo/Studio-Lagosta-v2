'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useBibliotecaMusicas, useDeletarMusica, type FaixaMusica } from '@/hooks/use-music-library';
import { useMusicStemStatus } from '@/hooks/use-music-stem';
import { useBaixarDoYoutube, useUploadYoutubeMp3, StartYoutubeDownloadResponse } from '@/hooks/use-youtube-download';
import { useProjects } from '@/hooks/use-project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Music, Plus, Search, MicOff, Loader2, Youtube, ExternalLink, Upload, CheckCircle2, X, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MusicWaveformPlayer } from '@/components/music/music-waveform-player';
import { YoutubeJobsList } from '@/components/youtube/youtube-jobs-list';
import { isYoutubeUrl } from '@/lib/youtube/utils';
import { cn } from '@/lib/utils';
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

const GENEROS = [
  'Rock',
  'Pop',
  'Eletrônico',
  'Hip Hop',
  'Jazz',
  'Samba',
  'Bossa',
  'Pagode',
  'Sertanejo',
  'Chorinho',
  'Ambiente',
];

// Componente auxiliar para exibir badges de stem
function MusicStemBadge({ musicId }: { musicId: number }) {
  const { data: stemStatus } = useMusicStemStatus(musicId);

  if (!stemStatus) return null;

  if (stemStatus.hasInstrumentalStem) {
    return (
      <Badge variant="secondary" className="text-xs">
        <MicOff className="h-3 w-3 mr-1" />
        Instrumental
      </Badge>
    );
  }

  if (stemStatus.job?.status === 'processing') {
    return (
      <Badge variant="outline" className="text-xs">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {stemStatus.job.progress}%
      </Badge>
    );
  }

  if (stemStatus.job?.status === 'pending') {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Na fila
      </Badge>
    );
  }

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
  const { toast } = useToast();
  const { data: faixasMusica, isLoading } = useBibliotecaMusicas();
  const deletarMusica = useDeletarMusica();
  const baixarDoYoutube = useBaixarDoYoutube();
  const uploadMp3 = useUploadYoutubeMp3();
  const { data: projetos = [], isLoading: isLoadingProjetos } = useProjects();
  const mp3InputRef = useRef<HTMLInputElement>(null);

  const [termoBusca, setTermoBusca] = useState('');
  const [musicaParaDeletar, setMusicaParaDeletar] = useState<FaixaMusica | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Estados YouTube
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [debouncedYoutubeUrl, setDebouncedYoutubeUrl] = useState('');
  const [youtubePhase, setYoutubePhase] = useState<'idle' | 'loading-meta' | 'ready' | 'getting-link' | 'download-ready' | 'uploading'>('idle');
  const [youtubeMetadata, setYoutubeMetadata] = useState<{ title?: string; author?: string; thumbnail?: string } | null>(null);
  const [youtubeJobData, setYoutubeJobData] = useState<StartYoutubeDownloadResponse | null>(null);
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [genero, setGenero] = useState('');
  const [projectId, setProjectId] = useState<string>('none');

  const faixasFiltradas = faixasMusica?.filter((faixa) =>
    faixa.name.toLowerCase().includes(termoBusca.toLowerCase()) ||
    faixa.artist?.toLowerCase().includes(termoBusca.toLowerCase())
  );

  // Debounce YouTube URL
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedYoutubeUrl(youtubeUrl.trim());
    }, 600);
    return () => clearTimeout(handler);
  }, [youtubeUrl]);

  // Fetch YouTube metadata
  useEffect(() => {
    const url = debouncedYoutubeUrl;

    if (!url) {
      setYoutubePhase('idle');
      setYoutubeMetadata(null);
      return;
    }

    if (!isYoutubeUrl(url)) {
      setYoutubePhase('idle');
      setYoutubeMetadata(null);
      return;
    }

    const controller = new AbortController();
    setYoutubePhase('loading-meta');

    fetch(`/api/biblioteca-musicas/youtube/metadata?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Erro ao buscar metadata');
        return res.json();
      })
      .then((data) => {
        setYoutubeMetadata({
          title: data.title,
          author: data.author,
          thumbnail: data.thumbnail,
        });
        setYoutubePhase('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error('Erro metadata:', error);
        setYoutubePhase('idle');
        setYoutubeMetadata(null);
      });

    return () => controller.abort();
  }, [debouncedYoutubeUrl]);

  const handleYoutubeSubmit = async () => {
    if (!youtubeUrl.trim() || !isYoutubeUrl(youtubeUrl)) {
      toast({
        title: 'URL inválida',
        description: 'Informe um link válido do YouTube.',
        variant: 'destructive',
      });
      return;
    }

    setYoutubePhase('getting-link');

    try {
      const result = await baixarDoYoutube.mutateAsync({
        youtubeUrl: youtubeUrl.trim(),
        nome: youtubeMetadata?.title || undefined,
        artista: youtubeMetadata?.author || undefined,
        genero: genero || undefined,
        projectId: projectId !== 'none' ? parseInt(projectId) : undefined,
      });

      if (result.downloadLink) {
        setYoutubeJobData(result);
        setYoutubePhase('download-ready');
        toast({
          title: 'Link pronto!',
          description: 'Baixe o MP3 e faça upload.',
        });
      } else {
        toast({
          title: 'Download iniciado',
          description: 'Aguarde o processamento.',
        });
        handleResetYoutube();
      }
    } catch (error) {
      console.error('Erro ao iniciar download:', error);
      setYoutubePhase('ready');
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Falha ao obter link.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadClick = () => {
    if (youtubeJobData?.downloadLink) {
      window.open(youtubeJobData.downloadLink, '_blank');
    }
  };

  const handleMp3FileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.includes('audio') && !selectedFile.name.endsWith('.mp3')) {
        toast({
          title: 'Arquivo inválido',
          description: 'Selecione um arquivo MP3.',
          variant: 'destructive',
        });
        return;
      }
      setMp3File(selectedFile);
    }
  };

  const handleMp3Upload = async () => {
    if (!mp3File || !youtubeJobData?.jobId) return;

    setYoutubePhase('uploading');

    try {
      await uploadMp3.mutateAsync({
        jobId: youtubeJobData.jobId,
        file: mp3File,
      });

      toast({
        title: 'Sucesso!',
        description: 'Música adicionada à biblioteca.',
      });

      handleResetYoutube();
    } catch (error) {
      console.error('Erro no upload:', error);
      setYoutubePhase('download-ready');
      toast({
        title: 'Erro no upload',
        description: error instanceof Error ? error.message : 'Falha ao enviar.',
        variant: 'destructive',
      });
    }
  };

  const handleResetYoutube = () => {
    setYoutubeUrl('');
    setYoutubePhase('idle');
    setYoutubeMetadata(null);
    setYoutubeJobData(null);
    setMp3File(null);
    setGenero('');
    setProjectId('none');
  };

  const handleDeletar = async () => {
    if (!musicaParaDeletar) return;

    try {
      await deletarMusica.mutateAsync(musicaParaDeletar.id);
      toast({
        title: 'Música excluída',
        description: `"${musicaParaDeletar.name}" foi excluída.`,
      });
      setMusicaParaDeletar(null);
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Tente novamente.',
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

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

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
        description: `Baixando "${faixa.name}".`,
      });
    } catch (error) {
      console.error('Erro ao baixar ZIP:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao baixar',
        description: 'Tente novamente.',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Biblioteca de Músicas
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Gerencie suas músicas e baixe do YouTube
          </p>
        </div>
        <Link href="/biblioteca-musicas/enviar">
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Upload Manual
          </Button>
        </Link>
      </div>

      {/* YouTube Download Section */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Youtube className="h-5 w-5 text-red-500" />
          <span className="font-medium">Adicionar do YouTube</span>
        </div>

        {youtubePhase !== 'download-ready' && youtubePhase !== 'uploading' ? (
          <div className="space-y-4">
            {/* URL Input */}
            <div className="flex gap-2">
              <Input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Cole o link do YouTube aqui..."
                className="flex-1"
                disabled={youtubePhase === 'getting-link'}
              />
              {youtubeUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetYoutube}
                  disabled={youtubePhase === 'getting-link'}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Loading metadata */}
            {youtubePhase === 'loading-meta' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando informações...
              </div>
            )}

            {/* Metadata + Options */}
            {youtubePhase === 'ready' && youtubeMetadata && (
              <div className="space-y-4">
                {/* Video Preview */}
                <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                  {youtubeMetadata.thumbnail && (
                    <Image
                      src={youtubeMetadata.thumbnail}
                      alt="Thumbnail"
                      width={80}
                      height={60}
                      className="rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{youtubeMetadata.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{youtubeMetadata.author}</p>
                  </div>
                </div>

                {/* Options Row */}
                <div className="flex gap-3 flex-wrap">
                  <Select value={genero} onValueChange={setGenero}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Gênero" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENEROS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjetos}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Projeto (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div className="flex items-center gap-2">
                          <Music className="h-4 w-4 text-muted-foreground" />
                          Sem projeto
                        </div>
                      </SelectItem>
                      {projetos.map((projeto) => (
                        <SelectItem key={projeto.id} value={projeto.id.toString()}>
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            {projeto.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleYoutubeSubmit}
                    disabled={baixarDoYoutube.isPending}
                    className="ml-auto"
                  >
                    {baixarDoYoutube.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Obtendo link...
                      </>
                    ) : (
                      'Baixar Música'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Download Ready / Uploading Phase */
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Link pronto!</p>
                <p className="text-xs text-muted-foreground truncate">{youtubeJobData?.title}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Step 1: Download */}
              <div className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                  <span className="text-sm font-medium">Baixar MP3</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleDownloadClick}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir download
                </Button>
              </div>

              {/* Step 2: Upload */}
              <div className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
                  <span className="text-sm font-medium">Enviar arquivo</span>
                </div>
                <div
                  onClick={() => mp3InputRef.current?.click()}
                  className={cn(
                    'cursor-pointer rounded-lg border border-dashed p-3 text-center transition-colors',
                    mp3File ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-primary/50'
                  )}
                >
                  <input
                    ref={mp3InputRef}
                    type="file"
                    accept="audio/mpeg,.mp3"
                    onChange={handleMp3FileChange}
                    className="hidden"
                    disabled={youtubePhase === 'uploading'}
                  />
                  {mp3File ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm truncate">{mp3File.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Clique para selecionar</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetYoutube}
                disabled={youtubePhase === 'uploading'}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleMp3Upload}
                disabled={!mp3File || youtubePhase === 'uploading'}
              >
                {youtubePhase === 'uploading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Adicionar à biblioteca
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
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
                ? 'Tente ajustar sua busca'
                : 'Cole um link do YouTube acima para começar'}
            </p>
          </div>
        )}
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!musicaParaDeletar} onOpenChange={(open) => !open && setMusicaParaDeletar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{musicaParaDeletar?.name}"?
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
