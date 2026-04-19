import { NextRequest, NextResponse } from 'next/server';
import { validateModel, MD3Exporter, MD5Exporter, glTFExporter } from '@q3gen/core';

export async function POST(request: NextRequest) {
  try {
    const { model, format } = await request.json();

    // Validate model
    const validatedModel = validateModel(model);

    let exportData: ArrayBuffer | string;
    let mimeType = 'application/octet-stream';
    let extension = 'bin';

    // Export based on format
    switch (format) {
      case 'md3':
        exportData = MD3Exporter.export(validatedModel);
        mimeType = 'application/octet-stream';
        extension = 'md3';
        break;
      case 'md5':
        exportData = MD5Exporter.export(validatedModel);
        mimeType = 'text/plain';
        extension = 'md5';
        break;
      case 'gltf':
        exportData = glTFExporter.export(validatedModel);
        mimeType = 'application/json';
        extension = 'gltf';
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}` },
          { status: 400 }
        );
    }

    // Convert to buffer if needed
    let buffer: ArrayBuffer;
    if (typeof exportData === 'string') {
      buffer = new TextEncoder().encode(exportData).buffer;
    } else {
      buffer = exportData;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="model.${extension}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 400 }
    );
  }
}
