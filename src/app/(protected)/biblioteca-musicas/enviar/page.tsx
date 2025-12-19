'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useEnviarMusica } from '@/hooks/use-music-library';
import { useProjects } from '@/hooks/use-project';
import { useBaixarDoYoutube } from '@/hooks/use-youtube-download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Upload, Music, Download, Image as ImageIcon, FileAudio, Youtube, FolderOpen, Tag, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isYoutubeUrl } from '@/lib/youtube/utils';
import { cn } from '@/lib/utils';

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

const HUMORES = [
  'Feliz',
  'Triste',
  'Calmo',
  'Motivacional',
  'Romântico',
  'Energético',
];

export default function EnviarMusicaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const enviarMusica = useEnviarMusica();
  const baixarDoYoutube = useBaixarDoYoutube();
  const { data: projetos = [], isLoading: isLoadingProjetos } = useProjects();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadMode, setUploadMode] = useState<'file' | 'youtube'>('file');
  const [isDragging, setIsDragging] = useState(false);

  const [nome, setNome] = useState('');
  const [artista, setArtista] = useState('');
  const [genero, setGenero] = useState('');
  const [humor, setHumor] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [duracao, setDuracao] = useState(0);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [debouncedYoutubeUrl, setDebouncedYoutubeUrl] = useState('');
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [youtubeMetadataStatus, setYoutubeMetadataStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [youtubeMetadataMessage, setYoutubeMetadataMessage] = useState<string | null>(null);
  const [youtubeMetadataThumb, setYoutubeMetadataThumb] = useState<string | null>(null);
  const [nomeManual, setNomeManual] = useState(false);
  const [artistaManual, setArtistaManual] = useState(false);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('audio/')) {
      toast({
        title: 'Tipo de arquivo inválido',
        description: 'Por favor, selecione um arquivo de áudio',
        variant: 'destructive',
      });
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'Tamanho máximo é 50MB',
        variant: 'destructive',
      });
      return;
    }

    setArquivo(selectedFile);

    if (!nome) {
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setNome(fileName);
    }

    setExtraindo(true);
    try {
      const audio = new Audio();
      audio.src = URL.createObjectURL(selectedFile);

      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => {
          setDuracao(audio.duration);
          URL.revokeObjectURL(audio.src);
          resolve(true);
        });
        audio.addEventListener('error', () => {
          reject(new Error('Failed to load audio metadata'));
        });
      });
    } catch (error) {
      console.error('Erro ao extrair metadados:', error);
      toast({
        title: 'Aviso',
        description: 'Não foi possível extrair a duração do áudio. Por favor, insira manualmente.',
        variant: 'default',
      });
    } finally {
      setExtraindo(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!arquivo || !nome || !duracao) {
      toast({
        title: 'Campos obrigatórios ausentes',
        description: 'Por favor, preencha todos os campos obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    try {
      await enviarMusica.mutateAsync({
        arquivo,
        nome,
        artista: artista || undefined,
        genero: genero || undefined,
        humor: humor || undefined,
        projectId: projectId !== 'none' ? parseInt(projectId) : undefined,
        duracao,
      });

      toast({
        title: 'Sucesso',
        description: 'Música enviada com sucesso',
      });

      router.push('/biblioteca-musicas');
    } catch (error) {
      console.error('Erro no upload:', error);
      toast({
        title: 'Falha no envio',
        description: error instanceof Error ? error.message : 'Falha ao enviar música',
        variant: 'destructive',
      });
    }
  };

  const handleYoutubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!youtubeUrl.trim()) {
      toast({
        title: 'URL inválida',
        description: 'Informe um link completo do YouTube.',
        variant: 'destructive',
      });
      return;
    }

    if (!aceitouTermos) {
      toast({
        title: 'Termos não aceitos',
        description: 'Confirme que possui direitos legais para este conteúdo.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await baixarDoYoutube.mutateAsync({
        youtubeUrl: youtubeUrl.trim(),
        nome: nome || undefined,
        artista: artista || undefined,
        genero: genero || undefined,
        humor: humor || undefined,
        projectId: projectId !== 'none' ? parseInt(projectId) : undefined,
      });

      toast({
        title: 'Download iniciado',
        description: 'Estamos baixando a música do YouTube. Você será avisado quando estiver pronta.',
      });

      router.push('/biblioteca-musicas');
    } catch (error) {
      console.error('Erro ao iniciar download do YouTube:', error);
      toast({
        title: 'Falha ao iniciar download',
        description: error instanceof Error ? error.message : 'Não foi possível iniciar o download.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (uploadMode !== 'youtube') return;
    const handler = setTimeout(() => {
      setDebouncedYoutubeUrl(youtubeUrl.trim());
    }, 600);
    return () => clearTimeout(handler);
  }, [youtubeUrl, uploadMode]);

  useEffect(() => {
    if (uploadMode !== 'youtube') return;
    setNomeManual(false);
    setArtistaManual(false);
  }, [debouncedYoutubeUrl, uploadMode]);

  useEffect(() => {
    if (uploadMode === 'youtube') return;
    setDebouncedYoutubeUrl('');
    setYoutubeMetadataStatus('idle');
    setYoutubeMetadataMessage(null);
    setYoutubeMetadataThumb(null);
    setNomeManual(false);
    setArtistaManual(false);
  }, [uploadMode]);

  useEffect(() => {
    if (uploadMode !== 'youtube') return;
    const url = debouncedYoutubeUrl;

    if (!url) {
      setYoutubeMetadataStatus('idle');
      setYoutubeMetadataMessage(null);
      setYoutubeMetadataThumb(null);
      return;
    }

    if (!isYoutubeUrl(url)) {
      setYoutubeMetadataStatus('error');
      setYoutubeMetadataMessage('Informe um link válido do YouTube.');
      setYoutubeMetadataThumb(null);
      return;
    }

    const controller = new AbortController();
    setYoutubeMetadataStatus('loading');
    setYoutubeMetadataMessage(null);

    fetch(`/api/biblioteca-musicas/youtube/metadata?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Não foi possível obter as informações do vídeo.');
        }
        return res.json();
      })
      .then((data) => {
        setYoutubeMetadataStatus('success');
        setYoutubeMetadataThumb(data.thumbnail || null);
        if (!nomeManual && data.title) {
          setNome(data.title);
        }
        if (!artistaManual && data.author) {
          setArtista(data.author);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setYoutubeMetadataStatus('error');
        setYoutubeMetadataMessage(error.message);
        setYoutubeMetadataThumb(null);
      });

    return () => controller.abort();
  }, [debouncedYoutubeUrl, uploadMode, nomeManual, artistaManual]);

  const handleNomeInput = (value: string) => {
    setNome(value);
    if (uploadMode === 'youtube') {
      setNomeManual(true);
    }
  };

  const handleArtistaInput = (value: string) => {
    setArtista(value);
    if (uploadMode === 'youtube') {
      setArtistaManual(true);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/biblioteca-musicas">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Biblioteca
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
            <Music className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Enviar Música</h1>
            <p className="text-sm text-muted-foreground">Adicione uma nova faixa à sua biblioteca</p>
          </div>
        </div>
      </div>

      {/* Upload Mode Toggle */}
      <div className="mb-8 flex gap-2 rounded-xl bg-muted/50 p-1.5 border border-border">
        <button
          type="button"
          onClick={() => setUploadMode('file')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all',
            uploadMode === 'file'
              ? 'bg-card shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          )}
        >
          <FileAudio className="h-4 w-4" />
          Upload de Arquivo
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('youtube')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all',
            uploadMode === 'youtube'
              ? 'bg-card shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          )}
        >
          <Youtube className="h-4 w-4" />
          Link do YouTube
        </button>
      </div>

      {/* File Upload Mode */}
      {uploadMode === 'file' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drag & Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative cursor-pointer rounded-xl border-2 border-dashed p-8 transition-all text-center',
              isDragging
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : arquivo
                  ? 'border-green-500/50 bg-green-500/5 dark:bg-green-500/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {arquivo ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 dark:bg-green-500/20">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{arquivo.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(arquivo.size / (1024 * 1024)).toFixed(2)} MB
                    {duracao > 0 && ` • ${Math.floor(duracao / 60)}:${String(Math.floor(duracao % 60)).padStart(2, '0')}`}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setArquivo(null); setDuracao(0); }}>
                  Alterar arquivo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
                  isDragging ? 'bg-primary/20' : 'bg-muted'
                )}>
                  <Upload className={cn('h-8 w-8', isDragging ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {isDragging ? 'Solte o arquivo aqui' : 'Arraste um arquivo de áudio ou clique para selecionar'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    MP3, WAV, OGG, AAC, M4A (máx 50MB)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Basic Info Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Informações Básicas
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">
                  Nome da Faixa <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => handleNomeInput(e.target.value)}
                  placeholder="Ex: Summer Vibes"
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artista">Artista</Label>
                <Input
                  id="artista"
                  value={artista}
                  onChange={(e) => handleArtistaInput(e.target.value)}
                  placeholder="Ex: John Doe"
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* Classification Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Tag className="h-4 w-4 text-primary" />
              Classificação
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="genero">Gênero</Label>
                <Select value={genero} onValueChange={setGenero}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione o gênero" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {GENEROS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="humor">Humor</Label>
                <Select value={humor} onValueChange={setHumor}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione o humor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {HUMORES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Project Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <FolderOpen className="h-4 w-4 text-primary" />
              Vinculação
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectId">Projeto Vinculado</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjetos}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Sem projeto (música global)" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  className="max-h-[min(var(--radix-select-content-available-height),400px)] w-[var(--radix-select-trigger-width)]"
                >
                  <SelectItem value="none" className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-muted-foreground" />
                      <span>Sem projeto (música global)</span>
                    </div>
                  </SelectItem>
                  <div className="my-1 h-px bg-border" />
                  {isLoadingProjetos ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Carregando projetos...
                    </div>
                  ) : projetos.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum projeto disponível
                    </div>
                  ) : (
                    projetos.map((projeto) => (
                      <SelectItem
                        key={projeto.id}
                        value={projeto.id.toString()}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                            {projeto.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{projeto.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isLoadingProjetos
                  ? 'Carregando projetos...'
                  : projetos.length === 0
                    ? 'Crie um projeto primeiro para vincular músicas'
                    : `${projetos.length} ${projetos.length === 1 ? 'projeto disponível' : 'projetos disponíveis'}`
                }
              </p>
            </div>

            {/* Duration (hidden input, auto-extracted) */}
            {duracao > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Duração detectada: {Math.floor(duracao / 60)}:{String(Math.floor(duracao % 60)).padStart(2, '0')}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-2">
            <Link href="/biblioteca-musicas" className="flex-1">
              <Button type="button" variant="outline" className="w-full h-11">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" className="flex-1 h-11" disabled={enviarMusica.isPending || !arquivo}>
              {enviarMusica.isPending ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Enviar Música
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* YouTube Mode */}
      {uploadMode === 'youtube' && (
        <form onSubmit={handleYoutubeSubmit} className="space-y-6">
          {/* YouTube URL Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Youtube className="h-4 w-4 text-red-500" />
              URL do YouTube
            </div>

            <div className="space-y-2">
              <Input
                id="youtubeUrl"
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-11"
                required
              />
              <p className="text-xs text-muted-foreground">Cole o link completo do vídeo do YouTube</p>
            </div>

            {/* Status Messages */}
            {youtubeMetadataStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Buscando informações do vídeo...
              </div>
            )}
            {youtubeMetadataStatus === 'error' && youtubeMetadataMessage && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {youtubeMetadataMessage}
              </div>
            )}
            {youtubeMetadataStatus === 'success' && (
              <div className="flex gap-4 rounded-lg border border-border bg-muted/30 p-4">
                {youtubeMetadataThumb ? (
                  <Image
                    src={youtubeMetadataThumb}
                    alt="Thumbnail do vídeo"
                    width={80}
                    height={60}
                    className="h-[60px] w-[80px] rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-[60px] w-[80px] items-center justify-center rounded-lg bg-muted">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Campos preenchidos automaticamente</p>
                  {nome && <p className="font-medium text-foreground truncate">{nome}</p>}
                  {artista && <p className="text-sm text-muted-foreground truncate">{artista}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Legal Warning */}
          <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 space-y-3">
                <h3 className="font-semibold text-foreground">Aviso Legal Importante</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Baixar conteúdo protegido pode violar os <strong className="text-foreground">Termos de Serviço do YouTube</strong>.</p>
                  <p>Use apenas quando tiver autorização legal (Creative Commons, próprio conteúdo, domínio público).</p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceitouTermos}
                    onChange={(e) => setAceitouTermos(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
                    required
                  />
                  <span className="text-sm text-foreground">
                    Confirmo que tenho direitos legais para usar o conteúdo deste link.
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Basic Info Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Informações Básicas
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome-yt">Nome da Faixa</Label>
                <Input
                  id="nome-yt"
                  value={nome}
                  onChange={(e) => handleNomeInput(e.target.value)}
                  placeholder="Ex: Summer Vibes"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artista-yt">Artista</Label>
                <Input
                  id="artista-yt"
                  value={artista}
                  onChange={(e) => handleArtistaInput(e.target.value)}
                  placeholder="Ex: John Doe"
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* Classification Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Tag className="h-4 w-4 text-primary" />
              Classificação
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="genero-yt">Gênero</Label>
                <Select value={genero} onValueChange={setGenero}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione o gênero" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {GENEROS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="humor-yt">Humor</Label>
                <Select value={humor} onValueChange={setHumor}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione o humor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {HUMORES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Project Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <FolderOpen className="h-4 w-4 text-primary" />
              Vinculação
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectId-yt">Projeto Vinculado</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjetos}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Sem projeto (música global)" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  className="max-h-[min(var(--radix-select-content-available-height),400px)] w-[var(--radix-select-trigger-width)]"
                >
                  <SelectItem value="none" className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-muted-foreground" />
                      <span>Sem projeto (música global)</span>
                    </div>
                  </SelectItem>
                  <div className="my-1 h-px bg-border" />
                  {isLoadingProjetos ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Carregando projetos...
                    </div>
                  ) : projetos.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum projeto disponível
                    </div>
                  ) : (
                    projetos.map((projeto) => (
                      <SelectItem
                        key={projeto.id}
                        value={projeto.id.toString()}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                            {projeto.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{projeto.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isLoadingProjetos
                  ? 'Carregando projetos...'
                  : projetos.length === 0
                    ? 'Crie um projeto primeiro para vincular músicas'
                    : `${projetos.length} ${projetos.length === 1 ? 'projeto disponível' : 'projetos disponíveis'}`
                }
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-2">
            <Link href="/biblioteca-musicas" className="flex-1">
              <Button type="button" variant="outline" className="w-full h-11">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              className="flex-1 h-11"
              disabled={baixarDoYoutube.isPending || !aceitouTermos}
            >
              {baixarDoYoutube.isPending ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando download...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar do YouTube
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
