import { AnimationTrack, AnimationConfigEntry, Keyframe, Quat, Vec3 } from './schema';

export class AnimationPlayer {
  private currentFrame: number = 0;
  private speed: number = 1;
  private isPlaying: boolean = false;

  constructor(private animation: AnimationTrack) {}

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  stop(): void {
    this.isPlaying = false;
    this.currentFrame = 0;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, speed);
  }

  setFrame(frame: number): void {
    this.currentFrame = Math.max(0, Math.min(frame, this.animation.totalFrames - 1));
  }

  getCurrentFrame(): number {
    return this.currentFrame;
  }

  update(deltaTime: number): void {
    if (!this.isPlaying) return;

    const frameIncrement = (deltaTime * this.animation.fps * this.speed) / 1000;
    this.currentFrame += frameIncrement;

    if (this.currentFrame >= this.animation.totalFrames) {
      if (this.animation.looping) {
        this.currentFrame = this.currentFrame % this.animation.totalFrames;
      } else {
        this.currentFrame = this.animation.totalFrames - 1;
        this.isPlaying = false;
      }
    }
  }

  getKeyframesForFrame(frame: number): Keyframe[] {
    return this.animation.keyframes.filter((kf) => kf.frameIndex <= frame);
  }
}

export function interpolateKeyframes(
  frame: number,
  keyframes: Keyframe[],
  boneId: string,
  totalFrames: number
): { position?: Vec3; rotation?: Quat; scale?: Vec3 } {
  const relevantKeyframes = keyframes.filter((kf) => kf.boneId === boneId && kf.frameIndex <= frame);

  if (relevantKeyframes.length === 0) {
    return {};
  }

  const current = relevantKeyframes[relevantKeyframes.length - 1];
  const nextIndex = keyframes.findIndex(
    (kf) => kf.boneId === boneId && kf.frameIndex > frame
  );
  const next = nextIndex >= 0 ? keyframes[nextIndex] : null;

  if (!next) {
    return {
      position: current.position,
      rotation: current.rotation,
      scale: current.scale,
    };
  }

  const frameRange = next.frameIndex - current.frameIndex;
  const progress = (frame - current.frameIndex) / frameRange;

  const result: { position?: Vec3; rotation?: Quat; scale?: Vec3 } = {};

  if (current.position && next.position) {
    result.position = {
      x: current.position.x + (next.position.x - current.position.x) * progress,
      y: current.position.y + (next.position.y - current.position.y) * progress,
      z: current.position.z + (next.position.z - current.position.z) * progress,
    };
  } else if (current.position) {
    result.position = current.position;
  }

  if (current.rotation && next.rotation) {
    result.rotation = slerpQuat(current.rotation, next.rotation, progress);
  } else if (current.rotation) {
    result.rotation = current.rotation;
  }

  if (current.scale && next.scale) {
    result.scale = {
      x: current.scale.x + (next.scale.x - current.scale.x) * progress,
      y: current.scale.y + (next.scale.y - current.scale.y) * progress,
      z: current.scale.z + (next.scale.z - current.scale.z) * progress,
    };
  } else if (current.scale) {
    result.scale = current.scale;
  }

  return result;
}

export function slerpQuat(q1: Quat, q2: Quat, t: number): Quat {
  let dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
  let q2Copy = { ...q2 };

  if (dot < 0) {
    q2Copy.x = -q2Copy.x;
    q2Copy.y = -q2Copy.y;
    q2Copy.z = -q2Copy.z;
    q2Copy.w = -q2Copy.w;
    dot = -dot;
  }

  dot = Math.max(-1, Math.min(1, dot));
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);

  if (Math.abs(sinTheta) < 0.001) {
    return {
      x: q1.x + t * (q2Copy.x - q1.x),
      y: q1.y + t * (q2Copy.y - q1.y),
      z: q1.z + t * (q2Copy.z - q1.z),
      w: q1.w + t * (q2Copy.w - q1.w),
    };
  }

  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;

  return {
    x: q1.x * a + q2Copy.x * b,
    y: q1.y * a + q2Copy.y * b,
    z: q1.z * a + q2Copy.z * b,
    w: q1.w * a + q2Copy.w * b,
  };
}

export function generateAnimationConfig(animations: AnimationTrack[]): AnimationConfigEntry[] {
  let currentFrame = 0;
  const entries: AnimationConfigEntry[] = [];

  animations.forEach((anim) => {
    entries.push({
      name: anim.name,
      frameStart: currentFrame,
      frameCount: anim.totalFrames,
      fps: anim.fps,
      looping: anim.looping,
    });
    currentFrame += anim.totalFrames;
  });

  return entries;
}

export function formatAnimationConfigFile(entries: AnimationConfigEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${entry.name} ${entry.frameStart} ${entry.frameCount} ${entry.fps} ${entry.looping ? 1 : 0}`
    )
    .join('\n');
}
