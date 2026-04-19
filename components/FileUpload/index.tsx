'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadProps {
  onModelLoad: (modelJson: string) => void;
}

export function FileUpload({ onModelLoad }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      // Check file type
      const fileName = file.name.toLowerCase();
      const isJson = fileName.endsWith('.json');
      const isMD3 = fileName.endsWith('.md3');
      const isMD5 = fileName.endsWith('.md5');
      const isGLTF = fileName.endsWith('.gltf') || fileName.endsWith('.glb');

      if (isJson) {
        // Load JSON directly
        const text = await file.text();
        const model = JSON.parse(text);
        onModelLoad(JSON.stringify(model, null, 2));
      } else if (isMD3 || isMD5 || isGLTF) {
        // Send to conversion API
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to import model');
        }

        const data = await response.json();
        onModelLoad(JSON.stringify(data, null, 2));
      } else {
        setError('Unsupported file format. Use JSON, MD3, MD5, or glTF');
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
        accept=".json,.md3,.md5,.gltf,.glb"
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
