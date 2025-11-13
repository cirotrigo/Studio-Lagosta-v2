'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMusica, useAtualizarMusica } from '@/hooks/use-music-library';
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
import { ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const GENEROS = [
  'Rock', 'Pop', 'Electronic', 'Hip Hop', 'Jazz', 'Classical',
  'Ambient', 'Indie', 'Folk', 'R&B', 'Country', 'Latin', 'Outro',
];

const HUMORES = [
  'Feliz', 'Triste', 'Energético', 'Calmo', 'Motivacional',
  'Romântico', 'Sombrio', 'Edificante', 'Melancólico',
  'Épico', 'Relaxante', 'Intenso',
];

export default function EditarMusicaPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [musicaId, setMusicaId] = useState<number>(0);

  useEffect(() => {
    params.then(p => setMusicaId(parseInt(p.id)));
  }, [params]);

  const { data: musica, isLoading } = useMusica(musicaId);
  const atualizarMusica = useAtualizarMusica(musicaId);

  const [nome, setNome] = useState('');
  const [artista, setArtista] = useState('');
  const [genero, setGenero] = useState('');
  const [humor, setHumor] = useState('');
  const [bpm, setBpm] = useState('');

  useEffect(() => {
    if (musica) {
      setNome(musica.name);
      setArtista(musica.artist || '');
      setGenero(musica.genre || '');
      setHumor(musica.mood || '');
      setBpm(musica.bpm?.toString() || '');
    }
  }, [musica]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, preencha o nome da música',
        variant: 'destructive',
      });
      return;
    }

    try {
      await atualizarMusica.mutateAsync({
        nome,
        artista: artista || undefined,
        genero: genero || undefined,
        humor: humor || undefined,
        bpm: bpm ? parseInt(bpm) : undefined,
      });

      toast({
        title: 'Sucesso',
        description: 'Música atualizada com sucesso',
      });

      router.push('/biblioteca-musicas');
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast({
        title: 'Falha na atualização',
        description: error instanceof Error ? error.message : 'Falha ao atualizar música',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!musica) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <p>Música não encontrada</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <Link href="/biblioteca-musicas">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Biblioteca
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Editar Música</h1>
        <p className="mt-2 text-gray-600">
          Atualize os metadados da faixa de música
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preview de Áudio */}
        <div className="rounded-lg border bg-gray-50 p-4">
          <Label>Preview</Label>
          <audio src={musica.blobUrl} controls className="mt-2 w-full" />
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

        {/* BPM */}
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

        {/* Botões */}
        <div className="flex gap-4 pt-4">
          <Link href="/biblioteca-musicas" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            className="flex-1"
            disabled={atualizarMusica.isPending}
          >
            {atualizarMusica.isPending ? (
              <>
                <Save className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
