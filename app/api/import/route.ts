import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();

    // JSON files - parse directly
    if (fileName.endsWith('.json')) {
      const text = new TextDecoder().decode(buffer);
      const model = JSON.parse(text);
      return NextResponse.json(model);
    }

    // MD3 format - parse binary and convert to model JSON
    if (fileName.endsWith('.md3')) {
      const model = parseMD3(buffer);
      return NextResponse.json(model);
    }

    // MD5 format - parse text and convert to model JSON
    if (fileName.endsWith('.md5')) {
      const text = new TextDecoder().decode(buffer);
      const model = parseMD5(text);
      return NextResponse.json(model);
    }

    // glTF format - parse and convert to model JSON
    if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
      const model = parseGLTF(buffer);
      return NextResponse.json(model);
    }

    return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
  } catch (error) {
    console.error('[v0] Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import model: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

function parseMD3(buffer: ArrayBuffer): any {
  // Simplified MD3 parser - extracts basic structure
  const view = new DataView(buffer);
  let offset = 0;

  const magic = view.getUint32(offset, true);
  offset += 4;

  if (magic !== 0x33504449) {
    throw new Error('Invalid MD3 file signature');
  }

  offset += 4; // version
  offset += 64; // filename
  offset += 4; // flags
  const numFrames = view.getUint32(offset, true);
  offset += 4;
  const numTags = view.getUint32(offset, true);
  offset += 4;
  const numSurfaces = view.getUint32(offset, true);
  offset += 4;

  // Return a basic model structure
  return {
    id: 'imported_md3_' + Date.now(),
    name: 'Imported MD3 Model',
    version: '1.0',
    description: 'Model imported from MD3 file',
    meshes: Array.from({ length: numSurfaces }, (_, i) => ({
      id: `mesh_${i}`,
      name: `Surface ${i}`,
      vertices: [],
      faces: [],
      material: {
        id: `mat_${i}`,
        name: `Material ${i}`,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    })),
    bones: [
      {
        id: 'bone_root',
        name: 'Root',
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    ],
    animations: [],
    tags: Array.from({ length: numTags }, (_, i) => ({
      id: `tag_${i}`,
      name: `Tag ${i}`,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      description: 'Imported tag',
    })),
    lodConfigs: [],
    scale: 1,
  };
}

function parseMD5(text: string): any {
  // Simplified MD5 parser - extracts joint and mesh data
  const lines = text.split('\n');
  let numJoints = 0;
  let numMeshes = 0;

  for (const line of lines) {
    if (line.startsWith('numJoints')) {
      numJoints = parseInt(line.split(' ')[1]);
    }
    if (line.startsWith('numMeshes')) {
      numMeshes = parseInt(line.split(' ')[1]);
    }
  }

  return {
    id: 'imported_md5_' + Date.now(),
    name: 'Imported MD5 Model',
    version: '1.0',
    description: 'Model imported from MD5 file',
    meshes: Array.from({ length: numMeshes }, (_, i) => ({
      id: `mesh_${i}`,
      name: `Mesh ${i}`,
      vertices: [],
      faces: [],
      material: {
        id: `mat_${i}`,
        name: `Material ${i}`,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    })),
    bones: Array.from({ length: numJoints }, (_, i) => ({
      id: `bone_${i}`,
      name: `Joint ${i}`,
      parentId: i === 0 ? null : `bone_${i - 1}`,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    })),
    animations: [],
    tags: [],
    lodConfigs: [],
    scale: 1,
  };
}

function parseGLTF(buffer: ArrayBuffer): any {
  // Simplified glTF parser - extracts basic structure
  // For full implementation, would need to parse binary GLB format or JSON glTF
  const text = new TextDecoder().decode(buffer);

  let gltf: any = null;
  try {
    gltf = JSON.parse(text);
  } catch {
    // If not JSON, it's likely binary GLB - would need proper GLB parser
    throw new Error('Binary GLB format requires advanced parsing - please use JSON glTF');
  }

  const meshCount = gltf.meshes?.length || 0;

  return {
    id: 'imported_gltf_' + Date.now(),
    name: 'Imported glTF Model',
    version: '1.0',
    description: 'Model imported from glTF file',
    meshes: Array.from({ length: meshCount }, (_, i) => ({
      id: `mesh_${i}`,
      name: gltf.meshes?.[i]?.name || `Mesh ${i}`,
      vertices: [],
      faces: [],
      material: {
        id: `mat_${i}`,
        name: `Material ${i}`,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    })),
    bones: gltf.nodes
      ? gltf.nodes.map((node: any, i: number) => ({
          id: `bone_${i}`,
          name: node.name || `Node ${i}`,
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        }))
      : [
          {
            id: 'bone_root',
            name: 'Root',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        ],
    animations: [],
    tags: [],
    lodConfigs: [],
    scale: 1,
  };
}
