import { NextRequest, NextResponse } from 'next/server';
import { validateModel, ValidationError } from '@q3gen/core';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    try {
      const model = validateModel(data);
      return NextResponse.json({ valid: true, data: model });
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({
          valid: false,
          errors: error.errors,
        }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
