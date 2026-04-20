'use client';

import { useMemo, useState } from 'react';

interface BotEditorProps {
  modelJson: string;
  onModelUpdate: (modelJson: string) => void;
}

export function BotEditor({ modelJson, onModelUpdate }: BotEditorProps) {
  const model = useMemo(() => parseModel(modelJson), [modelJson]);
  const botFiles = (model?.metadata?.botFiles || {}) as Record<string, string>;
  const names = Object.keys(botFiles);
  const [selectedName, setSelectedName] = useState('');
  const activeName = names.includes(selectedName) ? selectedName : names[0] || '';
  const activeText = activeName ? botFiles[activeName] || '' : '';
  const characteristics = useMemo(() => parseBotCharacteristics(activeText), [activeText]);

  const updateBot = (name: string, text: string) => {
    if (!model) return;

    const next = {
      ...model,
      metadata: {
        ...(model.metadata || {}),
        botFiles: {
          ...botFiles,
          [name]: text,
        },
      },
    };

    onModelUpdate(JSON.stringify(next, null, 2));
  };

  if (!model) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Bot Behavior</h3>
        {names.length > 0 && (
          <select
            value={activeName}
            onChange={event => setSelectedName(event.target.value)}
            className="px-2 py-1 bg-background border border-border rounded text-sm"
          >
            {names.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {activeName ? (
        <>
          {characteristics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {characteristics.slice(0, 8).map(([key, value]) => (
                <div key={key} className="border border-border rounded p-2 bg-background">
                  <div className="font-medium">{key}</div>
                  <div className="text-muted-foreground truncate">{value}</div>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={activeText}
            onChange={event => updateBot(activeName, event.target.value)}
            className="w-full min-h-48 p-3 font-mono text-xs bg-background border border-border rounded resize-y"
            spellCheck={false}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Upload a `.bot` file or a PK3 containing bot files.</p>
      )}
    </div>
  );
}

function parseModel(modelJson: string): any | null {
  try {
    return modelJson ? JSON.parse(modelJson) : null;
  } catch {
    return null;
  }
}

function parseBotCharacteristics(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const matches = text.matchAll(/^\s*([A-Za-z0-9_]+)\s+"?([^"\r\n{}]+)"?/gm);

  for (const match of matches) {
    const key = match[1];
    const value = match[2]?.trim();
    if (key && value && !['bot', 'character'].includes(key.toLowerCase())) {
      result.push([key, value]);
    }
  }

  return result;
}
