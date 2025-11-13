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

const GENRES = [
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
  'Other',
];

const MOODS = [
  'Happy',
  'Sad',
  'Energetic',
  'Calm',
  'Motivational',
  'Romantic',
  'Dark',
  'Uplifting',
  'Melancholic',
  'Epic',
  'Chill',
  'Intense',
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

    // Validate file type
    if (!selectedFile.type.startsWith('audio/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an audio file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 50MB',
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
      console.error('Error extracting metadata:', error);
      toast({
        title: 'Warning',
        description: 'Could not extract audio duration. Please enter manually.',
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
        title: 'Missing required fields',
        description: 'Please fill in all required fields',
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
        title: 'Success',
        description: 'Music uploaded successfully',
      });

      router.push('/biblioteca-musicas');
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload music',
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
        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="file">
            Audio File <span className="text-red-500">*</span>
          </Label>
          <div className="flex items-center gap-4">
            <Input
              id="file"
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="flex-1"
              required
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Music className="h-4 w-4" />
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Supported formats: MP3, WAV, OGG, AAC, M4A (max 50MB)
          </p>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Track Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer Vibes"
            required
          />
        </div>

        {/* Artist */}
        <div className="space-y-2">
          <Label htmlFor="artist">Artist</Label>
          <Input
            id="artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="John Doe"
          />
        </div>

        {/* Genre and Mood */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger>
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mood">Mood</Label>
            <Select value={mood} onValueChange={setMood}>
              <SelectTrigger>
                <SelectValue placeholder="Select mood" />
              </SelectTrigger>
              <SelectContent>
                {MOODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* BPM and Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bpm">BPM (Beats Per Minute)</Label>
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
            <Label htmlFor="duration">
              Duration (seconds) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="duration"
              type="number"
              value={duration || ''}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
              placeholder="180"
              min="1"
              step="0.1"
              required
              disabled={isExtracting}
            />
            {isExtracting && (
              <p className="text-sm text-gray-500">Extracting metadata...</p>
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
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Music
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
