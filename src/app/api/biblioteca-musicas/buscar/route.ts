import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

/**
 * GET /api/biblioteca-musicas/buscar
 * Buscar e filtrar biblioteca de músicas
 * Query params: busca, genero, humor, duracaoMinima, duracaoMaxima
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const busca = searchParams.get('busca') || '';
    const genero = searchParams.get('genero');
    const humor = searchParams.get('humor');
    const duracaoMinima = searchParams.get('duracaoMinima');
    const duracaoMaxima = searchParams.get('duracaoMaxima');

    const faixasMusica = await db.musicLibrary.findMany({
      where: {
        isActive: true,
        isPublic: true,
        AND: [
          // Busca de texto em nome e artista
          busca
            ? {
                OR: [
                  { name: { contains: busca, mode: 'insensitive' } },
                  { artist: { contains: busca, mode: 'insensitive' } },
                ],
              }
            : {},
          // Filtro de gênero
          genero ? { genre: genero } : {},
          // Filtro de humor
          humor ? { mood: humor } : {},
          // Filtros de duração
          duracaoMinima ? { duration: { gte: parseFloat(duracaoMinima) } } : {},
          duracaoMaxima ? { duration: { lte: parseFloat(duracaoMaxima) } } : {},
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(faixasMusica);
  } catch (error) {
    console.error('[Biblioteca Músicas Buscar]', error);
    return NextResponse.json(
      { erro: 'Falha ao buscar biblioteca de músicas' },
      { status: 500 }
    );
  }
}
