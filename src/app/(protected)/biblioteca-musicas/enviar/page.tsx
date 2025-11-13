'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEnviarMusica } from '@/hooks/use-music-library';
import { useProjects } from '@/hooks/use-project';
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
import { ArrowLeft, Upload, Music } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const GENEROS = [
  'Rock',
  'Pop',
  'Eletrônico',
  'Hip Hop',
  'Jazz',
  'Samba',
  'Bossa',
  'Pagode',
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
  const { data: projetos = [], isLoading: isLoadingProjetos } = useProjects();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [artista, setArtista] = useState('');
  const [genero, setGenero] = useState('');
  const [humor, setHumor] = useState('');
  const [projectId, setProjectId] = useState<string>('none'); // 'none' = sem projeto (música global)
  const [duracao, setDuracao] = useState(0);
  const [extraindo, setExtraindo] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validar tipo de arquivo
    if (!selectedFile.type.startsWith('audio/')) {
      toast({
        title: 'Tipo de arquivo inválido',
        description: 'Por favor, selecione um arquivo de áudio',
        variant: 'destructive',
      });
      return;
    }

    // Validar tamanho do arquivo (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'Tamanho máximo é 50MB',
        variant: 'destructive',
      });
      return;
    }

    setArquivo(selectedFile);

    // Auto-fill name from filename if not set
    if (!nome) {
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setNome(fileName);
    }

    // Extract duration
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

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/biblioteca-musicas">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Biblioteca
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Enviar Música</h1>
        <p className="mt-2 text-gray-600">
          Adicione uma nova faixa de música à biblioteca
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Upload de Arquivo */}
        <div className="space-y-2 rounded-lg border p-6 bg-white shadow-sm">
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
              <div className="flex items-center justify-between rounded-md bg-green-50 p-3 border border-green-200">
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

        {/* Informações Básicas */}
        <div className="space-y-4 rounded-lg border p-6 bg-white shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Informações Básicas</h3>

          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">
              Nome da Faixa <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Summer Vibes"
              required
            />
          </div>

          {/* Artista */}
          <div className="space-y-2">
            <Label htmlFor="artista">Artista</Label>
            <Input
              id="artista"
              value={artista}
              onChange={(e) => setArtista(e.target.value)}
              placeholder="John Doe"
            />
          </div>
        </div>

        {/* Classificação */}
        <div className="space-y-4 rounded-lg border p-6 bg-white shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Classificação</h3>

          {/* Gênero e Humor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Vinculação e Metadados */}
        <div className="space-y-4 rounded-lg border p-6 bg-white shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Vinculação e Metadados</h3>

          {/* Projeto */}
          <div className="space-y-2">
          <Label htmlFor="projectId">Projeto Vinculado</Label>
          <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjetos}>
            <SelectTrigger>
              <SelectValue placeholder="Sem projeto (música global)" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
              <SelectItem value="none">Sem projeto (música global)</SelectItem>
              {projetos.map((projeto) => (
                <SelectItem key={projeto.id} value={projeto.id.toString()}>
                  {projeto.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500">
            Músicas globais ficam disponíveis para todos os projetos
          </p>
        </div>

        {/* Duração */}
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
          {extraindo && (
            <p className="text-sm text-gray-500">Extraindo metadados...</p>
          )}
          {duracao > 0 && (
            <p className="text-sm text-green-600">
              ✓ {Math.floor(duracao / 60)}:{String(Math.floor(duracao % 60)).padStart(2, '0')} min
            </p>
          )}
        </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4">
          <Link href="/biblioteca-musicas" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            className="flex-1"
            disabled={enviarMusica.isPending || !arquivo}
          >
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
    </div>
  );
}
