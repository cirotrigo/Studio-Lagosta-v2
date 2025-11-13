import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { put } from '@vercel/blob';

/**
 * GET /api/biblioteca-musicas
 * Listar todas as faixas de música ativas
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const faixasMusica = await db.musicLibrary.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(faixasMusica);
  } catch (error) {
    console.error('[Biblioteca Músicas GET]', error);
    return NextResponse.json(
      { erro: 'Falha ao buscar biblioteca de músicas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/biblioteca-musicas
 * Fazer upload de uma nova faixa de música
 * Disponível para todos os usuários autenticados (não apenas admin)
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File;
    const nome = formData.get('nome') as string;
    const artista = formData.get('artista') as string | null;
    const genero = formData.get('genero') as string | null;
    const humor = formData.get('humor') as string | null;
    const projectId = formData.get('projectId') as string | null;
    const duracao = formData.get('duracao') as string;

    if (!arquivo || !nome || !duracao) {
      return NextResponse.json(
        { erro: 'Campos obrigatórios ausentes: arquivo, nome, duracao' },
        { status: 400 }
      );
    }

    // Upload para Vercel Blob
    const blob = await put(`musicas/${Date.now()}-${arquivo.name}`, arquivo, {
      access: 'public',
      contentType: arquivo.type,
    });

    // Salvar no banco de dados
    const faixaMusica = await db.musicLibrary.create({
      data: {
        name: nome,
        artist: artista,
        genre: genero,
        mood: humor,
        projectId: projectId ? parseInt(projectId) : null,
        duration: parseFloat(duracao),
        blobUrl: blob.url,
        blobSize: arquivo.size,
        createdBy: userId,
      },
    });

    return NextResponse.json(faixaMusica, { status: 201 });
  } catch (error) {
    console.error('[Biblioteca Músicas POST]', error);
    return NextResponse.json(
      { erro: 'Falha ao enviar música' },
      { status: 500 }
    );
  }
}
