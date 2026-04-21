'use client';

import { useState, useCallback, useMemo } from 'react';

interface AnimationEditorProps {
  modelJson: string;
  onModelUpdate: (modelJson: string) => void;
}

export function AnimationEditor({ modelJson, onModelUpdate }: AnimationEditorProps) {
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [selectedBone, setSelectedBone] = useState<string>('');
  const [keyframeFrame, setKeyframeFrame] = useState(0);
  const [showEditor, setShowEditor] = useState(false);

  const model = useMemo(() => {
    try {
      const parsed = JSON.parse(modelJson);
      return {
        ...parsed,
        animations: normalizeAnimations(parsed?.animations),
      };
    } catch {
      return null;
    }
  }, [modelJson]);

  const currentAnimation = useMemo(() => {
    return model?.animations?.find((a: any) => a.id === selectedAnimation);
  }, [model, selectedAnimation]);

  const handleAddKeyframe = useCallback(() => {
    if (!model || !currentAnimation || !selectedBone) return;

    const newKeyframe = {
      frameIndex: keyframeFrame,
      boneId: selectedBone,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    const updatedModel = {
      ...model,
      animations: model.animations.map((anim: any) => {
        if (anim.id === selectedAnimation) {
          return {
            ...anim,
            keyframes: [...(anim.keyframes || []), newKeyframe],
          };
        }
        return anim;
      }),
    };

    onModelUpdate(JSON.stringify(updatedModel, null, 2));
  }, [model, currentAnimation, selectedBone, keyframeFrame, onModelUpdate, selectedAnimation]);

  if (!model) {
    return <div className="text-destructive text-sm">Invalid model</div>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowEditor(!showEditor)}
        className="w-full px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/90 text-left"
      >
        {showEditor ? 'Hide' : 'Show'} Animation Editor
      </button>

      {showEditor && (
        <div className="space-y-3 p-3 border border-border rounded bg-muted">
          <div>
            <label className="block text-xs mb-2">Animation</label>
            <select
              value={selectedAnimation}
              onChange={(e) => setSelectedAnimation(e.target.value)}
              className="w-full px-2 py-1 border border-input rounded bg-background text-foreground text-xs"
            >
              <option value="">Select animation...</option>
              {model.animations?.map((anim: any) => (
                <option key={anim.id} value={anim.id}>
                  {anim.name}
                </option>
              ))}
            </select>
          </div>

          {currentAnimation && (
            <>
              <div>
                <label className="block text-xs mb-2">Bone</label>
                <select
                  value={selectedBone}
                  onChange={(e) => setSelectedBone(e.target.value)}
                  className="w-full px-2 py-1 border border-input rounded bg-background text-foreground text-xs"
                >
                  <option value="">Select bone...</option>
                  {model.bones?.map((bone: any) => (
                    <option key={bone.id} value={bone.id}>
                      {bone.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-2">Frame: {keyframeFrame}</label>
                <input
                  type="range"
                  min="0"
                  max={currentAnimation.totalFrames}
                  value={keyframeFrame}
                  onChange={(e) => setKeyframeFrame(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <button
                onClick={handleAddKeyframe}
                disabled={!selectedBone}
                className="w-full px-2 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50"
              >
                Add Keyframe
              </button>

              <div className="text-xs text-muted-foreground">
                <div>Total Keyframes: {currentAnimation.keyframes?.length || 0}</div>
                <div>
                  Keyframes for {selectedBone ? `selected bone` : `bone`}: {selectedBone ? currentAnimation.keyframes?.filter((k: any) => k.boneId === selectedBone).length || 0 : 0}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function normalizeAnimations(animations: any): any[] {
  const list = Array.isArray(animations)
    ? animations
    : animations && typeof animations === 'object'
      ? Object.entries(animations).map(([key, value]) => ({ id: key, ...(value as Record<string, unknown>) }))
      : [];

  return list.map((animation: any, index: number) => {
    const keyframes = Array.isArray(animation?.keyframes)
      ? animation.keyframes
      : Array.isArray(animation?.frames)
        ? animation.frames
        : [];

    const totalFrames = Number.isFinite(animation?.totalFrames)
      ? animation.totalFrames
      : Number.isFinite(animation?.frameCount)
        ? animation.frameCount
        : keyframes.length > 0
          ? Math.max(...keyframes.map((keyframe: any) => Number(keyframe?.frameIndex) || 0)) + 1
          : 1;

    return {
      ...animation,
      id: animation?.id || animation?.name || `animation_${index}`,
      name: animation?.name || animation?.id || `Animation ${index + 1}`,
      fps: Number.isFinite(animation?.fps) ? animation.fps : 30,
      totalFrames,
      looping: typeof animation?.looping === 'boolean' ? animation.looping : true,
      keyframes,
    };
  });
}
