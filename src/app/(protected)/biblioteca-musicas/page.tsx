'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMusicLibrary, useDeleteMusic, type MusicTrack } from '@/hooks/use-music-library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Music, Plus, Search, Trash2, Edit, Play, Pause } from 'lucide-react';
import { useAudio } from 'react-use';
import { Badge } from '@/components/ui/badge';

export default function MusicLibraryPage() {
  const { data: musicTracks, isLoading, error } = useMusicLibrary();
  const deleteMusic = useDeleteMusic();

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [musicToDelete, setMusicToDelete] = useState<number | null>(null);
  const [playingMusicId, setPlayingMusicId] = useState<number | null>(null);

  const filteredTracks = musicTracks?.filter((track) =>
    track.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    track.artist?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async () => {
    if (musicToDelete) {
      await deleteMusic.mutateAsync(musicToDelete);
      setDeleteDialogOpen(false);
      setMusicToDelete(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-800">
          Error loading music library: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Music Library</h1>
          <p className="mt-2 text-gray-600">
            Manage music tracks for video exports
          </p>
        </div>
        <Link href="/admin/music-library/upload">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Upload Music
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by name or artist..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-blue-500" />
            <p className="text-sm font-medium text-gray-600">Total Tracks</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{musicTracks?.length || 0}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-green-500" />
            <p className="text-sm font-medium text-gray-600">Active Tracks</p>
          </div>
          <p className="mt-2 text-2xl font-bold">
            {musicTracks?.filter((t) => t.isActive).length || 0}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-purple-500" />
            <p className="text-sm font-medium text-gray-600">Total Duration</p>
          </div>
          <p className="mt-2 text-2xl font-bold">
            {formatDuration(
              musicTracks?.reduce((acc, t) => acc + t.duration, 0) || 0
            )}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-gray-500">Loading music library...</div>
          </div>
        ) : filteredTracks && filteredTracks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead>Mood</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTracks.map((track) => (
                <MusicRow
                  key={track.id}
                  track={track}
                  isPlaying={playingMusicId === track.id}
                  onPlayToggle={(id) =>
                    setPlayingMusicId(playingMusicId === id ? null : id)
                  }
                  onDelete={(id) => {
                    setMusicToDelete(id);
                    setDeleteDialogOpen(true);
                  }}
                  formatDuration={formatDuration}
                  formatFileSize={formatFileSize}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center">
            <Music className="mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No music tracks found</p>
            <Link href="/admin/music-library/upload">
              <Button className="mt-4" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Upload Your First Track
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Music Track?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the music track as inactive. Videos using this track will still work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Separate component for each music row with audio player
function MusicRow({
  track,
  isPlaying,
  onPlayToggle,
  onDelete,
  formatDuration,
  formatFileSize,
}: {
  track: MusicTrack;
  isPlaying: boolean;
  onPlayToggle: (id: number) => void;
  onDelete: (id: number) => void;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
}) {
  const [audio, state, controls] = useAudio({
    src: track.blobUrl,
    autoPlay: false,
  });

  // Handle play/pause
  const handlePlayPause = () => {
    if (isPlaying) {
      controls.pause();
      onPlayToggle(track.id);
    } else {
      controls.play();
      onPlayToggle(track.id);
    }
  };

  // Stop playback when not playing
  if (!isPlaying && !state.paused) {
    controls.pause();
    controls.seek(0);
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePlayPause}
            className="h-8 w-8 p-0"
          >
            {isPlaying && state.playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          {track.name}
          {audio}
        </div>
      </TableCell>
      <TableCell>{track.artist || '-'}</TableCell>
      <TableCell>
        {track.genre ? (
          <Badge variant="secondary">{track.genre}</Badge>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell>
        {track.mood ? (
          <Badge variant="outline">{track.mood}</Badge>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell>{formatDuration(track.duration)}</TableCell>
      <TableCell>{formatFileSize(track.blobSize)}</TableCell>
      <TableCell>
        {track.isActive ? (
          <Badge variant="default" className="bg-green-500">
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Link href={`/admin/music-library/${track.id}/edit`}>
            <Button size="sm" variant="ghost">
              <Edit className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(track.id)}
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
