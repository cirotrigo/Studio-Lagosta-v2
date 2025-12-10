'use client';

import { useEffect, useState } from 'react';
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
import { ArrowLeft, Upload, Music, Download, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isYoutubeUrl } from '@/lib/youtube/utils';

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

  const [uploadMode, setUploadMode] = useState<'file' | 'youtube'>('file');

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

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

  const renderInformacoesBasicas = (requireNome: boolean) => (
    <div className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Informações Básicas</h3>
      <div className="space-y-2">
        <Label htmlFor="nome">
          Nome da Faixa {requireNome && <span className="text-red-500">*</span>}
        </Label>
        <Input
          id="nome"
          value={nome}
          onChange={(e) => handleNomeInput(e.target.value)}
          placeholder="Summer Vibes"
          required={requireNome}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="artista">Artista</Label>
        <Input
          id="artista"
          value={artista}
          onChange={(e) => handleArtistaInput(e.target.value)}
          placeholder="John Doe"
        />
      </div>
    </div>
  );

  const renderClassificacao = () => (
    <div className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Classificação</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="genero">Gênero</Label>
          <Select value={genero} onValueChange={setGenero}>
            <SelectTrigger>
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
            <SelectTrigger>
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
  );

  const renderVinculacao = (options: { includeDuration: boolean }) => (
    <div className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Vinculação e Metadados</h3>
      <div className="space-y-2">
        <Label htmlFor="projectId">Projeto Vinculado</Label>
        <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjetos}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sem projeto (música global)" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            className="max-h-[min(var(--radix-select-content-available-height),400px)] w-[var(--radix-select-trigger-width)]"
          >
            <SelectItem value="none" className="cursor-pointer">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-gray-400" />
                <span className="font-medium">Sem projeto (música global)</span>
              </div>
            </SelectItem>
            <div className="my-1 h-px bg-gray-200" />
            {isLoadingProjetos ? (
              <div className="py-6 text-center text-sm text-gray-500">
                Carregando projetos...
              </div>
            ) : projetos.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
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
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs font-semibold text-blue-700">
                      {projeto.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{projeto.name}</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">
          {isLoadingProjetos
            ? 'Carregando projetos...'
            : projetos.length === 0
            ? 'Crie um projeto primeiro para vincular músicas'
            : `${projetos.length} ${projetos.length === 1 ? 'projeto disponível' : 'projetos disponíveis'}`
          }
        </p>
      </div>
      {options.includeDuration && (
        <div className="space-y-2">
          <Label htmlFor="duracao">
            Duração (segundos) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="duracao"
            type="number"
            value={duracao || ''}
            onChange={(e) => setDuracao(parseFloat(e.target.value))}
            placeholder="180"
            min="1"
            step="0.1"
            required
            disabled={extraindo}
          />
          {extraindo && <p className="text-sm text-gray-500">Extraindo metadados...</p>}
          {duracao > 0 && (
            <p className="text-sm text-green-600">
              ✓ {Math.floor(duracao / 60)}:{String(Math.floor(duracao % 60)).padStart(2, '0')} min
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <Link href="/biblioteca-musicas">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Biblioteca
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Enviar Música</h1>
        <p className="mt-2 text-gray-600">Adicione uma nova faixa à biblioteca</p>
      </div>

      <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setUploadMode('file')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            uploadMode === 'file' ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📁 Upload de Arquivo
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('youtube')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            uploadMode === 'youtube' ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔗 Link do YouTube
        </button>
      </div>

      {uploadMode === 'file' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 rounded-lg border bg-white p-6 shadow-sm">
            <Label htmlFor="arquivo" className="text-base font-semibold">
              Arquivo de Áudio <span className="text-red-500">*</span>
            </Label>
            <div className="flex flex-col gap-4">
              <Input
                id="arquivo"
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="flex-1"
                required
              />
              {arquivo && (
                <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <Music className="h-4 w-4" />
                    <span className="font-medium">{arquivo.name}</span>
                  </div>
                  <span className="text-sm text-green-600">
                    {(arquivo.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Formatos suportados: MP3, WAV, OGG, AAC, M4A (max 50MB)
            </p>
          </div>

          {renderInformacoesBasicas(true)}
          {renderClassificacao()}
          {renderVinculacao({ includeDuration: true })}

          <div className="flex gap-4 pt-4">
            <Link href="/biblioteca-musicas" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={enviarMusica.isPending || !arquivo}>
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

      {uploadMode === 'youtube' && (
        <form onSubmit={handleYoutubeSubmit} className="space-y-6">
          <div className="space-y-2 rounded-lg border bg-white p-6 shadow-sm">
            <Label htmlFor="youtubeUrl" className="text-base font-semibold">
              URL do YouTube <span className="text-red-500">*</span>
            </Label>
            <Input
              id="youtubeUrl"
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
            <p className="text-sm text-gray-500">Cole o link completo do vídeo do YouTube</p>
            {youtubeMetadataStatus === 'loading' && (
              <p className="text-sm text-blue-600">Buscando informações do vídeo...</p>
            )}
            {youtubeMetadataStatus === 'error' && youtubeMetadataMessage && (
              <p className="text-sm text-red-600">{youtubeMetadataMessage}</p>
            )}
            {youtubeMetadataStatus === 'success' && (
              <div className="mt-2 flex gap-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                {youtubeMetadataThumb ? (
                  <Image
                    src={youtubeMetadataThumb}
                    alt="Thumbnail do vídeo"
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-blue-100">
                    <ImageIcon className="h-5 w-5 text-blue-500" />
                  </div>
                )}
                <div>
                  <p>Preenchemos automaticamente os campos com as informações do vídeo.</p>
                  {nome && <p className="mt-1 font-semibold text-blue-950">{nome}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-6">
            <h3 className="mb-3 text-base font-bold text-red-900">⚠️ Aviso legal importante</h3>
            <div className="space-y-2 text-sm text-red-800">
              <p>
                Baixar conteúdo protegido pode violar os <strong>Termos de Serviço do YouTube</strong>.
              </p>
              <p>Use apenas quando tiver autorização legal (Creative Commons, próprio conteúdo, domínio público).</p>
              <p className="font-semibold">Você é o responsável por qualquer uso indevido.</p>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="aceitouTermos"
                checked={aceitouTermos}
                onChange={(e) => setAceitouTermos(e.target.checked)}
                className="mt-1 h-4 w-4"
                required
              />
              <label htmlFor="aceitouTermos" className="text-sm text-red-900">
                Confirmo que tenho direitos legais para usar o conteúdo deste link.
              </label>
            </div>
          </div>

          {renderInformacoesBasicas(false)}
          {renderClassificacao()}
          {renderVinculacao({ includeDuration: false })}

          <div className="flex gap-4 pt-4">
            <Link href="/biblioteca-musicas" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              className="flex-1"
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
