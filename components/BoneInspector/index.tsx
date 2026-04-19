'use client';

import { useMemo, useState, useCallback } from 'react';

interface BoneInspectorProps {
  modelJson: string;
  onModelUpdate: (modelJson: string) => void;
}

export function BoneInspector({ modelJson, onModelUpdate }: BoneInspectorProps) {
  const [showInspector, setShowInspector] = useState(false);
  const [selectedBone, setSelectedBone] = useState<string>('');

  const model = useMemo(() => {
    try {
      return JSON.parse(modelJson);
    } catch {
      return null;
    }
  }, [modelJson]);

  const bones = useMemo(() => model?.bones || [], [model]);

  const currentBone = useMemo(() => {
    return bones.find((b: any) => b.id === selectedBone);
  }, [bones, selectedBone]);

  const hierarchy = useMemo(() => {
    const map = new Map<string | null, string[]>();
    bones.forEach((bone: any) => {
      const parent = bone.parentId || null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(bone.id);
    });
    return map;
  }, [bones]);

  const renderBoneTree = useCallback(
    (parentId: string | null = null, level: number = 0): JSX.Element[] => {
      const children = hierarchy.get(parentId) || [];
      return children.flatMap((boneId) => {
        const bone = bones.find((b: any) => b.id === boneId);
        if (!bone) return [];
        return [
          <div
            key={bone.id}
            style={{ paddingLeft: `${level * 12}px` }}
            className="text-xs py-1 px-2 cursor-pointer hover:bg-accent rounded"
            onClick={() => setSelectedBone(bone.id)}
          >
            <button className={selectedBone === bone.id ? 'font-bold text-primary' : ''}>
              {bone.name}
            </button>
            {hierarchy.has(bone.id) && (
              <div className="ml-2 border-l border-border">
                {renderBoneTree(bone.id, level + 1)}
              </div>
            )}
          </div>,
        ];
      });
    },
    [bones, hierarchy, selectedBone]
  );

  if (!model) {
    return <div className="text-destructive text-sm">Invalid model</div>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowInspector(!showInspector)}
        className="w-full px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/90 text-left"
      >
        {showInspector ? 'Hide' : 'Show'} Bone Inspector
      </button>

      {showInspector && (
        <div className="space-y-3 p-3 border border-border rounded bg-muted max-h-64 overflow-y-auto">
          <div className="space-y-2">
            <h4 className="font-semibold text-xs">Skeleton Hierarchy</h4>
            <div className="space-y-0">{renderBoneTree()}</div>
          </div>

          {currentBone && (
            <div className="border-t border-border pt-2">
              <h4 className="font-semibold text-xs mb-2">Bone Details: {currentBone.name}</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-semibold">ID:</span> {currentBone.id}
                </div>
                <div>
                  <span className="font-semibold">Parent:</span> {currentBone.parentId || 'Root'}
                </div>
                <div className="bg-background p-1 rounded">
                  <div className="font-semibold mb-1">Position</div>
                  <div>
                    X: {currentBone.position.x.toFixed(2)}, Y: {currentBone.position.y.toFixed(2)}, Z:{' '}
                    {currentBone.position.z.toFixed(2)}
                  </div>
                </div>
                <div className="bg-background p-1 rounded">
                  <div className="font-semibold mb-1">Rotation</div>
                  <div>
                    X: {currentBone.rotation.x.toFixed(2)}, Y: {currentBone.rotation.y.toFixed(2)}, Z:{' '}
                    {currentBone.rotation.z.toFixed(2)}, W: {currentBone.rotation.w.toFixed(2)}
                  </div>
                </div>
                <div className="bg-background p-1 rounded">
                  <div className="font-semibold mb-1">Scale</div>
                  <div>
                    X: {currentBone.scale.x.toFixed(2)}, Y: {currentBone.scale.y.toFixed(2)}, Z:{' '}
                    {currentBone.scale.z.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
