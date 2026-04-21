'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadProps {
  onModelLoad: (modelJson: string) => void;
  onTextureLoad?: (name: string, url: string, type: string, sourceName?: string, previewUrl?: string) => void;
  onBotLoad?: (name: string, text: string) => void;
}

const textureExtensions = ['.jpg', '.jpeg', '.png', '.tga', '.webp'];

export function FileUpload({ onModelLoad, onTextureLoad, onBotLoad }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const textureFiles = files.filter(file => isTextureFile(file.name));
      textureFiles.forEach(file => {
        onTextureLoad?.(file.name, URL.createObjectURL(file), file.type);
      });

      const botFiles = files.filter(file => file.name.toLowerCase().endsWith('.bot'));
      const uploadedBotFiles = Object.fromEntries(await Promise.all(botFiles.map(async file => (
        [file.name, await file.text()] as const
      ))));

      const file = files.find(file => !isTextureFile(file.name) && !file.name.toLowerCase().endsWith('.bot'));
      if (!file) {
        Object.entries(uploadedBotFiles).forEach(([name, text]) => {
          onBotLoad?.(name, text);
        });
        return;
      }

      const fileName = file.name.toLowerCase();
      const isJson = fileName.endsWith('.json');
      const isPK3 = fileName.endsWith('.pk3');
      const isMD3 = fileName.endsWith('.md3');
      const isMD5 = fileName.endsWith('.md5');
      const isGLTF = fileName.endsWith('.gltf') || fileName.endsWith('.glb');

      if (isJson) {
        // Load JSON directly
        const text = await file.text();
        const model = JSON.parse(text);
        onModelLoad(JSON.stringify(mergeBotFiles(model, uploadedBotFiles), null, 2));
      } else if (isPK3 || isMD3 || isMD5 || isGLTF) {
        // Send to conversion API
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await getImportErrorMessage(response));
        }

        const data = await response.json();
        onModelLoad(JSON.stringify(mergeBotFiles(data, uploadedBotFiles), null, 2));
      } else {
        setError('Unsupported file format. Use JSON, PK3, MD3, MD5, glTF, bot files, or image textures');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
      console.error('[v0] File upload error:', err);
    } finally {
      setIsLoading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        ref={inputRef}
        type="file"
        onChange={handleFileSelect}
        accept=".json,.pk3,.md3,.md5,.gltf,.glb,.bot,.jpg,.jpeg,.png,.tga,.webp"
        multiple
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        <Upload size={16} />
        {isLoading ? 'Loading...' : 'Upload Model'}
      </button>
      {error && <span className="text-destructive text-sm">{error}</span>}
    </div>
  );
}

function mergeBotFiles(model: any, botFiles: Record<string, string>): any {
  if (!Object.keys(botFiles).length) {
    return model;
  }

  return {
    ...model,
    metadata: {
      ...(model?.metadata || {}),
      botFiles: {
        ...(model?.metadata?.botFiles || {}),
        ...botFiles,
      },
    },
  };
}

function isTextureFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return textureExtensions.some(extension => lowerName.endsWith(extension));
}

async function getImportErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const errorBody = await response.json().catch(() => null);
    if (errorBody?.error) {
      return errorBody.error;
    }
  }

  const text = await response.text().catch(() => '');
  const message = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  if (message) {
    return `Import failed (${response.status}): ${message.slice(0, 240)}`;
  }

  return `Import failed with HTTP ${response.status}`;
}
