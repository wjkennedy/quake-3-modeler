'use client';

import { useCallback } from 'react';

interface ExportPanelProps {
  format: 'md3' | 'md5' | 'gltf' | 'pk3';
  onFormatChange: (format: 'md3' | 'md5' | 'gltf' | 'pk3') => void;
  onExport: () => void;
}

export function ExportPanel({ format, onFormatChange, onExport }: ExportPanelProps) {
  const handleFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFormatChange(e.target.value as 'md3' | 'md5' | 'gltf' | 'pk3');
    },
    [onFormatChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Export Model</h3>
      <div>
        <label className="block text-xs mb-2">Format</label>
        <select
          value={format}
          onChange={handleFormatChange}
          className="w-full px-3 py-2 border border-input rounded bg-background text-foreground text-sm"
        >
          <option value="md3">MD3 (Quake 3)</option>
          <option value="pk3">PK3 (MD3 + textures)</option>
          <option value="md5">MD5 (Doom 3)</option>
          <option value="gltf">glTF (Universal)</option>
        </select>
      </div>
      <button
        onClick={onExport}
        className="w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 font-medium"
      >
        Download {format.toUpperCase()}
      </button>
    </div>
  );
}
