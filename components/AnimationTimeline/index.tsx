'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';

interface AnimationTimelineProps {
  modelJson: string;
  onAnimationSelect: (animationId: string) => void;
}

export function AnimationTimeline({ modelJson, onAnimationSelect }: AnimationTimelineProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const animations = useMemo(() => {
    try {
      const model = JSON.parse(modelJson);
      return model.animations || [];
    } catch {
      return [];
    }
  }, [modelJson]);

  const selectedAnimation = useMemo(() => {
    return animations[0] || null;
  }, [animations]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !selectedAnimation) return;

    let frameTime = 0;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (frameTime === 0) frameTime = timestamp;
      const elapsed = timestamp - frameTime;
      const frameIncrement = (elapsed * selectedAnimation.fps * speed) / 1000;

      setCurrentFrame((prev) => {
        let next = prev + frameIncrement;
        if (next >= selectedAnimation.totalFrames) {
          if (selectedAnimation.looping) {
            next = next % selectedAnimation.totalFrames;
          } else {
            next = selectedAnimation.totalFrames - 1;
            setIsPlaying(false);
            return next;
          }
        }
        return next;
      });

      frameTime = timestamp;
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, selectedAnimation, speed]);

  const handleAnimationSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = animations.find((a: any) => a.id === e.target.value);
      if (selected) {
        setCurrentFrame(0);
        setIsPlaying(false);
        onAnimationSelect(selected.id);
      }
    },
    [animations, onAnimationSelect]
  );

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame(0);
  }, []);

  const handleFrameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFrame(parseFloat(e.target.value));
    setIsPlaying(false);
  }, []);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSpeed(parseFloat(e.target.value));
  }, []);

  if (animations.length === 0) {
    return <div className="text-muted-foreground text-sm">No animations in model</div>;
  }

  const progress = selectedAnimation ? (currentFrame / selectedAnimation.totalFrames) * 100 : 0;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Animation Timeline</h3>

      <select
        onChange={handleAnimationSelect}
        defaultValue={selectedAnimation?.id || ''}
        className="w-full px-3 py-2 border border-input rounded bg-background text-foreground text-sm"
      >
        {animations.map((anim: any) => (
          <option key={anim.id} value={anim.id}>
            {anim.name} ({anim.totalFrames} frames @ {anim.fps} fps)
          </option>
        ))}
      </select>

      {selectedAnimation && (
        <>
          {/* Timeline scrubber */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {Math.floor(currentFrame)} / {selectedAnimation.totalFrames}
              </span>
            </div>
            <div className="relative h-6 bg-secondary rounded overflow-hidden">
              <input
                type="range"
                min="0"
                max={selectedAnimation.totalFrames}
                value={currentFrame}
                onChange={handleFrameChange}
                className="absolute w-full h-full opacity-0 cursor-pointer"
                step="0.1"
              />
              <div
                className="absolute h-full bg-primary pointer-events-none transition-all"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute h-full w-0.5 bg-destructive pointer-events-none" style={{ left: `${progress}%` }} />
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex gap-2">
            <button
              onClick={handlePlayPause}
              className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs hover:bg-secondary/90 flex-1"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleStop}
              className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs hover:bg-secondary/90 flex-1"
            >
              Stop
            </button>
          </div>

          {/* Speed control */}
          <div>
            <label className="block text-xs mb-1">Speed: {speed.toFixed(1)}x</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={speed}
              onChange={handleSpeedChange}
              className="w-full"
            />
          </div>

          {/* Animation info */}
          <div className="text-xs text-muted-foreground space-y-1 bg-muted p-2 rounded">
            <div>
              <span className="font-semibold">FPS:</span> {selectedAnimation.fps}
            </div>
            <div>
              <span className="font-semibold">Duration:</span> {(selectedAnimation.totalFrames / selectedAnimation.fps).toFixed(2)}s
            </div>
            <div>
              <span className="font-semibold">Loop:</span> {selectedAnimation.looping ? 'Yes' : 'No'}
            </div>
            <div>
              <span className="font-semibold">Keyframes:</span> {selectedAnimation.keyframes?.length || 0}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
