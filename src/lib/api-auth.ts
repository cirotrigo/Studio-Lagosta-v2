import { NextRequest, NextResponse } from 'next/server';
// import { db } from '@/lib/db';

// TODO: Implement API key validation when apiKey table is added to schema
export async function validateApiKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { 
      isValid: false, 
      error: 'Missing or invalid authorization header',
      status: 401 
    };
  }

  // const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // TODO: Implement when apiKey table is added to Prisma schema
    /*
    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const keyRecord = await db.apiKey.findUnique({
      where: { key: apiKey },
      include: { user: true }
    });

    if (!keyRecord) {
      return {
        isValid: false,
        error: 'Invalid API key',
        status: 401
      };
    }

    if (!keyRecord.isActive) {
      return {
        isValid: false,
        error: 'API key is deactivated',
        status: 401
      };
    }

    // Update last used timestamp
    await db.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });
    */

    // Temporary implementation - always return invalid until schema is updated
    return {
      isValid: false,
      error: 'API key validation not implemented',
      status: 501
    };
  } catch {
    return {
      isValid: false,
      error: 'Internal server error',
      status: 500
    };
  }
}

export function createUnauthorizedResponse(error: string, status: number = 401) {
  return NextResponse.json(
    { error, success: false },
    { status }
  );
}

export function createSuccessResponse<T>(data: T, status: number = 200) {
  return NextResponse.json({
    success: true,
    data
  }, { status });
}

export function createErrorResponse(error: string, status: number = 500) {
  return NextResponse.json({
    success: false,
    error
  }, { status });
}