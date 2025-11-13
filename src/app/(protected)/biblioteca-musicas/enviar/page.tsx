'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEnviarMusica } from '@/hooks/use-music-library';
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
  'Electronic',
  'Hip Hop',
  'Jazz',
  'Classical',
  'Ambient',
  'Indie',
  'Folk',
  'R&B',
  'Country',
  'Latin',
  'Outro',
];

const HUMORES = [
  'Feliz',
  'Triste',
  'Energético',
  'Calmo',
  'Motivacional',
  'Romântico',
  'Sombrio',
  'Edificante',
  'Melancólico',
  'Épico',
  'Relaxante',
  'Intenso',
];

export default function EnviarMusicaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const enviarMusica = useEnviarMusica();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [artista, setArtista] = useState('');
  const [genero, setGenero] = useState('');
  const [humor, setHumor] = useState('');
  const [bpm, setBpm] = useState('');
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
        bpm: bpm ? parseInt(bpm) : undefined,
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
        <div className="space-y-2">
          <Label htmlFor="arquivo">
            Arquivo de Áudio <span className="text-red-500">*</span>
          </Label>
          <div className="flex items-center gap-4">
            <Input
              id="arquivo"
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="flex-1"
              required
            />
            {arquivo && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Music className="h-4 w-4" />
                {(arquivo.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Formatos suportados: MP3, WAV, OGG, AAC, M4A (max 50MB)
          </p>
        </div>

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

        {/* Gênero e Humor */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="genero">Gênero</Label>
            <Select value={genero} onValueChange={setGenero}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o gênero" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectContent>
                {HUMORES.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* BPM e Duração */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bpm">BPM (Batidas Por Minuto)</Label>
            <Input
              id="bpm"
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="120"
              min="1"
              max="300"
            />
          </div>

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
