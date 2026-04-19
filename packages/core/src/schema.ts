import { z } from 'zod';

// Vector types
export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const Vec2Schema = z.object({
  u: z.number(),
  v: z.number(),
});

export const QuatSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number(),
});

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Vec2 = z.infer<typeof Vec2Schema>;
export type Quat = z.infer<typeof QuatSchema>;

// Material
export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  diffuse: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
  emissive: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  shininess: z.number().min(0).max(128).optional().default(32),
});

export type Material = z.infer<typeof MaterialSchema>;

// Vertex with bone weights
export const VertexSchema = z.object({
  position: Vec3Schema,
  normal: Vec3Schema,
  uv: Vec2Schema,
  boneWeights: z.array(
    z.object({
      boneId: z.number(),
      weight: z.number().min(0).max(1),
    })
  ).optional().default([]),
});

export type Vertex = z.infer<typeof VertexSchema>;

// Face/Triangle
export const FaceSchema = z.object({
  indices: z.tuple([z.number(), z.number(), z.number()]),
  materialId: z.string().optional(),
});

export type Face = z.infer<typeof FaceSchema>;

// Mesh
export const MeshSchema = z.object({
  id: z.string(),
  name: z.string(),
  vertices: z.array(VertexSchema),
  faces: z.array(FaceSchema),
  material: MaterialSchema,
});

export type Mesh = z.infer<typeof MeshSchema>;

// Bone/Joint
export const BoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  position: Vec3Schema,
  rotation: QuatSchema,
  scale: Vec3Schema.optional().default({ x: 1, y: 1, z: 1 }),
});

export type Bone = z.infer<typeof BoneSchema>;

// Tag (attachment point)
export const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: Vec3Schema,
  rotation: QuatSchema,
  description: z.string().optional(),
});

export type Tag = z.infer<typeof TagSchema>;

// Keyframe for animation
export const KeyframeSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  boneId: z.string(),
  position: Vec3Schema.optional(),
  rotation: QuatSchema.optional(),
  scale: Vec3Schema.optional(),
});

export type Keyframe = z.infer<typeof KeyframeSchema>;

// Animation Track
export const AnimationTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  fps: z.number().positive().default(30),
  totalFrames: z.number().int().positive(),
  looping: z.boolean().default(true),
  keyframes: z.array(KeyframeSchema),
});

export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;

// LOD Level
export const LODLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  distance: z.number().nonnegative(),
  targetVertexCount: z.number().int().positive().optional(),
  targetTriangleCount: z.number().int().positive().optional(),
});

export type LODLevel = z.infer<typeof LODLevelSchema>;

// LOD Configuration
export const LODConfigSchema = z.object({
  id: z.string(),
  meshId: z.string(),
  levels: z.array(LODLevelSchema),
  enabled: z.boolean().default(false),
});

export type LODConfig = z.infer<typeof LODConfigSchema>;

// Complete Model Schema
export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().default('1.0'),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  meshes: z.array(MeshSchema),
  bones: z.array(BoneSchema),
  animations: z.array(AnimationTrackSchema),
  tags: z.array(TagSchema).optional().default([]),
  lodConfigs: z.array(LODConfigSchema).optional().default([]),
  scale: z.number().positive().default(1),
});

export type Model = z.infer<typeof ModelSchema>;

// Animation Config for output (animation.cfg format)
export const AnimationConfigEntrySchema = z.object({
  name: z.string(),
  frameStart: z.number().int().nonnegative(),
  frameCount: z.number().int().positive(),
  fps: z.number().positive(),
  looping: z.boolean(),
});

export type AnimationConfigEntry = z.infer<typeof AnimationConfigEntrySchema>;

export const AnimationConfigSchema = z.object({
  entries: z.array(AnimationConfigEntrySchema),
});

export type AnimationConfig = z.infer<typeof AnimationConfigSchema>;

// Export result
export const ExportResultSchema = z.object({
  success: z.boolean(),
  format: z.enum(['md3', 'md5', 'gltf']),
  data: z.any(),
  warnings: z.array(z.string()).optional(),
});

export type ExportResult = z.infer<typeof ExportResultSchema>;
