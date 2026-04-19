'use client';

import { useCallback } from 'react';

interface ModelEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ModelEditor({ value, onChange }: ModelEditorProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <textarea
      value={value}
      onChange={handleChange}
      placeholder={`Paste or edit your Quake 3 model JSON here...

Example structure:
{
  "id": "model_1",
  "name": "My Model",
  "meshes": [...],
  "bones": [...],
  "animations": [...]
}`}
      className="w-full h-full p-4 font-mono text-sm bg-background text-foreground resize-none border-none focus:outline-none"
    />
  );
}
