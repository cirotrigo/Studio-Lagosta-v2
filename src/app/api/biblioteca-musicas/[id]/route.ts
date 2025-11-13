import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

/**
 * GET /api/biblioteca-musicas/[id]
 * Obter detalhes de uma faixa de música específica
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const musicaId = parseInt(id);

    if (isNaN(musicaId)) {
      return NextResponse.json({ erro: 'ID de música inválido' }, { status: 400 });
    }

    const faixaMusica = await db.musicLibrary.findUnique({
      where: { id: musicaId },
    });

    if (!faixaMusica) {
      return NextResponse.json({ erro: 'Música não encontrada' }, { status: 404 });
    }

    return NextResponse.json(faixaMusica);
  } catch (error) {
    console.error('[Biblioteca Músicas GET por ID]', error);
    return NextResponse.json(
      { erro: 'Falha ao buscar música' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/biblioteca-musicas/[id]
 * Atualizar metadados da música
 * Disponível para todos os usuários autenticados
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const musicaId = parseInt(id);

    if (isNaN(musicaId)) {
      return NextResponse.json({ erro: 'ID de música inválido' }, { status: 400 });
    }

    const body = await req.json();
    const { nome, artista, genero, humor, ativo, publico, thumbnailUrl, projectId } = body;

    const musicaAtualizada = await db.musicLibrary.update({
      where: { id: musicaId },
      data: {
        name: nome,
        artist: artista,
        genre: genero,
        mood: humor,
        isActive: ativo,
        isPublic: publico,
        thumbnailUrl,
        projectId: projectId !== undefined ? projectId : undefined,
      },
    });

    return NextResponse.json(musicaAtualizada);
  } catch (error) {
    console.error('[Biblioteca Músicas PATCH]', error);
    return NextResponse.json(
      { erro: 'Falha ao atualizar música' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/biblioteca-musicas/[id]
 * Deletar uma faixa de música
 * Disponível para todos os usuários autenticados
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const musicaId = parseInt(id);

    if (isNaN(musicaId)) {
      return NextResponse.json({ erro: 'ID de música inválido' }, { status: 400 });
    }

    // Soft delete - apenas marcar como inativo
    await db.musicLibrary.update({
      where: { id: musicaId },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error('[Biblioteca Músicas DELETE]', error);
    return NextResponse.json(
      { erro: 'Falha ao deletar música' },
      { status: 500 }
    );
  }
}
