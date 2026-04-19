# Quake 3 Model Generator - Q3Gen

A comprehensive, JavaScript-native generator for creating, editing, and exporting Quake 3 models. Build procedural characters, manage skeletal animations, apply LOD systems, and export to multiple formats—all in the browser or from the command line.

## Features

### Core Generation
- **Procedural Mesh Builder**: Generate primitive shapes (box, sphere, cylinder, plane, pyramid, capsule)
- **Mesh Import**: Load OBJ files and convert to internal format
- **Material System**: Full RGB color support with shininess and emissive properties
- **Vertex Attributes**: Position, normal, UV coordinates, bone weights

### Animation System
- **Skeletal Animation**: Full bone hierarchy with quaternion-based rotation
- **Timeline Editor**: Visual frame scrubbing with real-time playback
- **Keyframe Animation**: Interpolation between keyframes with SLERP quaternion blending
- **Animation Config**: Generate `animation.cfg` for Quake 3 compatibility
- **Multiple Animations**: Support unlimited animation tracks per model

### 3D Preview
- **React Three Fiber Viewer**: Real-time 3D preview with interactive controls
- **Bone Visualization**: Debug skeleton hierarchy in 3D space
- **Orbit Controls**: Pan, zoom, and rotate the model
- **Studio Lighting**: Professional lighting setup with environment presets

### LOD System
- **Automatic Simplification**: Generate lower-detail mesh variants
- **Distance-Based Selection**: Switch LOD levels based on camera distance
- **Configurable Thresholds**: Define custom vertex and distance targets

### Export Formats
- **MD3** (Quake 3): Binary format with full animation and tag support
- **MD5** (Doom 3): Text-based joint and mesh format
- **glTF**: Universal 3D format for web and game engines

### Bone System
- **Hierarchical Structure**: Full parent-child bone relationships
- **Bone Inspector**: Visualize skeleton with detailed bone properties
- **Position, Rotation, Scale**: Full transform support per bone

### Tags System
- **Attachment Points**: Define weapon mounts, effect spawns, etc.
- **Named Tags**: Semantic identification of special points
- **Spatial Validation**: Verify tags are within model bounds

## Getting Started

### Web UI

1. **Load Sample Character**
   ```
   Click "Load Sample" to load a procedurally-generated Doom-inspired character
   ```

2. **Explore the Model**
   - Use the left panel to view/edit model JSON
   - Right panel shows 3D preview with orbit controls
   - Timeline editor for animation playback and keyframe management

3. **Export Your Model**
   - Select format (MD3, MD5, or glTF)
   - Click "Download" to export

### CLI Tool

```bash
# Validate a model
q3gen validate model.json

# Export to MD3
q3gen export model.json output.md3 --format md3

# Export to glTF
q3gen export model.json output.gltf --format gltf

# Generate a sample character
q3gen generate character.json --name "My Character"

# Generate animation config
q3gen animconfig model.json animation.cfg
```

## Architecture

### Monorepo Structure

```
packages/
├── core/          # Shared library with all generation logic
│   ├── schema/    # TypeScript types and Zod validation
│   ├── mesh/      # Mesh generation and operations
│   ├── animation/ # Animation system and interpolation
│   ├── bones/     # Skeletal system
│   ├── tags/      # Tag definitions and validation
│   ├── lod/       # LOD generation and selection
│   ├── procedural/# Procedural geometry builder
│   └── exporters/ # MD3, MD5, glTF exporters
└── cli/           # Standalone CLI tool (q3gen executable)

app/              # Next.js web UI
├── api/          # Validation, generation, export endpoints
├── components/   # React components
└── page.tsx      # Main application page
```

### Core Technologies

- **Next.js 16**: Web framework with server routes
- **React Three Fiber**: 3D graphics rendering
- **Three.js**: 3D library
- **Zod**: Schema validation with TypeScript inference
- **Commander.js**: CLI argument parsing
- **TypeScript**: Type-safe code

## Model Structure

### Basic Model Schema

```typescript
{
  id: string;
  name: string;
  version: string;
  meshes: Mesh[];
  bones: Bone[];
  animations: AnimationTrack[];
  tags?: Tag[];
  lodConfigs?: LODConfig[];
  scale: number;
}
```

### Mesh Structure

```typescript
{
  id: string;
  name: string;
  vertices: Vertex[];
  faces: Face[];
  material: Material;
}
```

### Bone Structure

```typescript
{
  id: string;
  name: string;
  parentId: string | null;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}
```

### Animation Structure

```typescript
{
  id: string;
  name: string;
  fps: number;
  totalFrames: number;
  looping: boolean;
  keyframes: Keyframe[];
}
```

## Development

### Building the Project

```bash
# Install dependencies
pnpm install

# Build core library
pnpm -C packages/core build

# Build CLI
pnpm -C packages/cli build

# Start development server
pnpm dev
```

### Creating a Custom Model

1. **Create Model JSON**
   ```json
   {
     "id": "my_model",
     "name": "My Model",
     "version": "1.0",
     "meshes": [...],
     "bones": [...],
     "animations": [...]
   }
   ```

2. **Validate Schema**
   Use the web UI validation or CLI:
   ```bash
   q3gen validate model.json
   ```

3. **Export to Target Format**
   ```bash
   q3gen export model.json output.md3 --format md3
   ```

## API Reference

### Core Library Exports

#### Mesh Generation
```typescript
import { MeshBuilder, ProceduralGeometry } from '@q3gen/core';

const mesh = ProceduralGeometry.createSphere(material, radius, segments);
const normalized = builder.computeNormals(mesh);
```

#### Animation
```typescript
import { AnimationPlayer, interpolateKeyframes } from '@q3gen/core';

const player = new AnimationPlayer(animation);
player.play();
```

#### Export
```typescript
import { MD3Exporter, MD5Exporter, glTFExporter } from '@q3gen/core';

const buffer = MD3Exporter.export(model);
const text = MD5Exporter.export(model);
```

## Examples

### Procedural Character

```typescript
const material: Material = {
  id: 'mat_char',
  name: 'Character',
  diffuse: [0.8, 0.7, 0.6],
  shininess: 32,
};

const bodyMesh = ProceduralGeometry.createCapsule(material, 0.4, 1.2);
const headMesh = ProceduralGeometry.createSphere(material, 0.3);

// Combine meshes
const character = mergeMeshes([bodyMesh, headMesh], material);
```

### Skeletal Animation

```typescript
const bones = [
  createBone('bone_root', 'Root', null),
  createBone('bone_spine', 'Spine', 'bone_root', { x: 0, y: 1, z: 0 }),
  createBone('bone_head', 'Head', 'bone_spine', { x: 0, y: 1.5, z: 0 }),
];

const animation: AnimationTrack = {
  id: 'anim_idle',
  name: 'Idle',
  fps: 30,
  totalFrames: 60,
  looping: true,
  keyframes: [
    { frameIndex: 0, boneId: 'bone_spine', position: { x: 0, y: 1, z: 0 } },
    { frameIndex: 30, boneId: 'bone_spine', position: { x: 0, y: 1.1, z: 0 } },
  ],
};
```

## License

MIT - Feel free to use this in any project!

## Contributing

Contributions welcome! Please submit pull requests or open issues on GitHub.

## Roadmap

- [x] Core schema and validation
- [x] Procedural mesh generation
- [x] Skeletal animation system
- [x] React Three Fiber 3D preview
- [x] LOD generation
- [x] MD3, MD5, glTF exporters
- [x] CLI tool
- [ ] Real-time mesh simplification algorithms
- [ ] Texture UV editing
- [ ] Skeleton IK solver
- [ ] Animation blending and transitions
- [ ] Vertex weight painting UI
- [ ] Binary GLB export with embedded textures
- [ ] Animation state machine editor
