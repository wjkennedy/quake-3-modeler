import { Model, AnimationConfigEntry } from './schema';

/**
 * MD3 Exporter for Quake 3
 * Binary format with frames, vertices, triangles, shaders, and tags
 */
export class MD3Exporter {
  static export(model: Model): ArrayBuffer {
    // MD3 header structure
    const magic = 0x33504449; // "IDP3"
    const version = 15;
    const flags = 0;

    // Calculate sizes
    const numFrames = 1; // Simplified: single frame for now
    const numTags = model.tags?.length || 0;
    const numSurfaces = model.meshes.length;

    // Create buffer
    const headerSize = 108;
    const frameSize = 56;
    const tagSize = 112;
    const surfaceHeaderSize = 108;

    let totalSize = headerSize + numFrames * frameSize + numTags * tagSize;

    // Calculate surface sizes
    model.meshes.forEach((mesh) => {
      const numVerts = mesh.vertices.length;
      const numTris = mesh.faces.length;
      totalSize += surfaceHeaderSize;
      totalSize += numTris * 12; // Triangle indices (3 * uint)
      totalSize += numVerts * 4; // Shader references (uint per vertex)
      totalSize += numVerts * 12; // Vertex coordinates (3 * float)
      totalSize += numVerts * 1; // Vertex lightmap coordinates (uint8[2])
      totalSize += numVerts * 1; // Vertex normals (2 bytes for normal encoding)
    });

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint32(offset, magic, true);
    offset += 4;
    view.setUint32(offset, version, true);
    offset += 4;

    // Filename (64 bytes)
    offset += 64;

    view.setUint32(offset, flags, true);
    offset += 4;
    view.setUint32(offset, numFrames, true);
    offset += 4;
    view.setUint32(offset, numTags, true);
    offset += 4;
    view.setUint32(offset, numSurfaces, true);
    offset += 4;
    view.setUint32(offset, numFrames, true); // num skins
    offset += 4;

    // Frame offset, tag offset, surface offset (will be set after)
    const frameOffsetPos = offset;
    offset += 4;
    const tagOffsetPos = offset;
    offset += 4;
    const surfaceOffsetPos = offset;
    offset += 4;
    const eofPos = offset;
    offset += 4;

    // Write frame data
    const frameOffset = offset;
    for (let i = 0; i < numFrames; i++) {
      view.setFloat32(offset, -128, true);
      offset += 4; // min x
      view.setFloat32(offset, -128, true);
      offset += 4; // min y
      view.setFloat32(offset, -128, true);
      offset += 4; // min z
      view.setFloat32(offset, 127, true);
      offset += 4; // max x
      view.setFloat32(offset, 127, true);
      offset += 4; // max y
      view.setFloat32(offset, 127, true);
      offset += 4; // max z
      view.setFloat32(offset, 0, true);
      offset += 4; // origin x
      view.setFloat32(offset, 0, true);
      offset += 4; // origin y
      view.setFloat32(offset, 0, true);
      offset += 4; // origin z
      view.setFloat32(offset, 1, true);
      offset += 4; // scale
      offset += 16; // creator (4 chars)
    }

    // Write tags
    const tagOffset = offset;
    model.tags?.forEach((tag) => {
      // Tag name (64 bytes)
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(tag.name);
      const view8 = new Uint8Array(buffer, offset, 64);
      for (let i = 0; i < Math.min(nameBytes.length, 64); i++) {
        view8[i] = nameBytes[i];
      }
      offset += 64;

      view.setFloat32(offset, tag.position.x, true);
      offset += 4;
      view.setFloat32(offset, tag.position.y, true);
      offset += 4;
      view.setFloat32(offset, tag.position.z, true);
      offset += 4;

      // Rotation matrix (3x3)
      for (let i = 0; i < 9; i++) {
        view.setFloat32(offset, i === 0 || i === 4 || i === 8 ? 1 : 0, true);
        offset += 4;
      }
    });

    // Write surfaces
    const surfaceOffset = offset;
    model.meshes.forEach((mesh) => {
      const surfaceHeaderPos = offset;
      offset += surfaceHeaderSize;

      const numVerts = mesh.vertices.length;
      const numTris = mesh.faces.length;

      // Write triangles
      const triangleOffset = offset;
      mesh.faces.forEach((face) => {
        view.setUint32(offset, face.indices[0], true);
        offset += 4;
        view.setUint32(offset, face.indices[1], true);
        offset += 4;
        view.setUint32(offset, face.indices[2], true);
        offset += 4;
      });

      // Write shader references
      const shaderOffset = offset;
      for (let i = 0; i < numVerts; i++) {
        view.setUint32(offset, 0, true);
        offset += 4;
      }

      // Write vertices
      const vertexOffset = offset;
      mesh.vertices.forEach((vertex) => {
        view.setInt16(offset, Math.round(vertex.position.x * 64), true);
        offset += 2;
        view.setInt16(offset, Math.round(vertex.position.y * 64), true);
        offset += 2;
        view.setInt16(offset, Math.round(vertex.position.z * 64), true);
        offset += 2;
        view.setUint16(offset, 0, true);
        offset += 2;
      });

      // Fill in surface header
      const surfaceView = new DataView(buffer, surfaceHeaderPos);
      let surfaceHeaderOffset = 0;

      const surfaceMagic = 0x33504449; // "IDP3"
      surfaceView.setUint32(surfaceHeaderOffset, surfaceMagic, true);
      surfaceHeaderOffset += 4;

      offset = surfaceHeaderPos + 4;
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(mesh.name || 'Surface');
      const view8 = new Uint8Array(buffer, offset, 64);
      for (let i = 0; i < Math.min(nameBytes.length, 64); i++) {
        view8[i] = nameBytes[i];
      }
      offset = surfaceHeaderPos + 68;

      const surfaceFlags = 0;
      new DataView(buffer, offset).setUint32(0, surfaceFlags, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, numVerts, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, numTris, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, triangleOffset - surfaceHeaderPos, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, 1, true);
      offset += 4; // num shaders
      new DataView(buffer, offset).setUint32(0, shaderOffset - surfaceHeaderPos, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, 0, true);
      offset += 4; // uv offset
      new DataView(buffer, offset).setUint32(0, vertexOffset - surfaceHeaderPos, true);
      offset += 4;
      new DataView(buffer, offset).setUint32(0, surfaceHeaderPos + surfaceHeaderSize, true);
      offset += 4; // next surface
    });

    // Set file offsets in header
    new DataView(buffer, frameOffsetPos).setUint32(0, frameOffset, true);
    new DataView(buffer, tagOffsetPos).setUint32(0, tagOffset, true);
    new DataView(buffer, surfaceOffsetPos).setUint32(0, surfaceOffset, true);
    new DataView(buffer, eofPos).setUint32(0, offset, true);

    return buffer.slice(0, offset);
  }
}

/**
 * MD5 Exporter for Doom 3
 * Text-based format with joint hierarchy and mesh data
 */
export class MD5Exporter {
  static export(model: Model): string {
    let output = '';

    // MD5 header
    output += 'MD5Version 10\n';
    output += `commandline "exported from Q3Gen"\n\n`;

    // Joints (bones)
    output += `numJoints ${model.bones.length}\n`;
    output += `numMeshes ${model.meshes.length}\n\n`;

    output += 'joints {\n';
    model.bones.forEach((bone) => {
      const parentName = model.bones.find((b) => b.id === bone.parentId)?.name || 'root';
      output += `\t"${bone.name}"\t${model.bones.indexOf(model.bones.find((b) => b.id === bone.parentId) || { id: 'root' })}\t`;
      output += `( ${bone.position.x} ${bone.position.y} ${bone.position.z} )\t`;
      output += `( ${bone.rotation.x} ${bone.rotation.y} ${bone.rotation.z} )\n`;
    });
    output += '}\n\n';

    // Meshes
    output += 'mesh {\n';
    model.meshes.forEach((mesh, meshIdx) => {
      output += `\tshader "${mesh.material.name}"\n`;
      output += `\tnumverts ${mesh.vertices.length}\n`;

      mesh.vertices.forEach((vert, vertIdx) => {
        output += `\tvert ${vertIdx} ( ${vert.uv.u} ${vert.uv.v} ) 0 1\n`;
      });

      output += `\tnumtris ${mesh.faces.length}\n`;
      mesh.faces.forEach((face, faceIdx) => {
        output += `\ttri ${faceIdx} ${face.indices[0]} ${face.indices[1]} ${face.indices[2]}\n`;
      });

      output += `\tnumweights ${mesh.vertices.length}\n`;
      mesh.vertices.forEach((vert, vertIdx) => {
        const weight = vert.boneWeights?.[0] || { boneId: 0, weight: 1 };
        output += `\tweight ${vertIdx} ${weight.boneId} ${weight.weight} ( ${vert.position.x} ${vert.position.y} ${vert.position.z} )\n`;
      });
    });
    output += '}\n';

    return output;
  }
}

/**
 * glTF Exporter for universal format
 */
export class glTFExporter {
  static export(model: Model): string {
    // Simplified glTF JSON export (binary GLB export would require binary buffer construction)
    const gltf = {
      asset: {
        generator: 'Q3Gen',
        version: '2.0',
      },
      scene: 0,
      scenes: [
        {
          nodes: Array.from({ length: model.meshes.length }, (_, i) => i),
        },
      ],
      nodes: model.meshes.map((mesh, i) => ({
        name: mesh.name,
        mesh: i,
      })),
      meshes: model.meshes.map((mesh) => ({
        name: mesh.name,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            material: 0,
          },
        ],
      })),
      materials: model.meshes.map((mesh) => ({
        name: mesh.material.name,
        pbrMetallicRoughness: {
          baseColorFactor: [...mesh.material.diffuse, 1.0],
        },
      })),
      accessors: model.meshes.flatMap((mesh) => [
        {
          bufferView: 0,
          componentType: 5126,
          count: mesh.vertices.length,
          type: 'VEC3',
          max: [1, 1, 1],
          min: [-1, -1, -1],
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: mesh.vertices.length,
          type: 'VEC3',
        },
        {
          bufferView: 2,
          componentType: 5125,
          count: mesh.faces.length * 3,
          type: 'SCALAR',
        },
      ]),
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteStride: 12, target: 34962 },
        { buffer: 0, byteOffset: 1024000, byteStride: 12, target: 34962 },
        { buffer: 0, byteOffset: 2048000, target: 34963 },
      ],
      buffers: [
        {
          byteLength: 3072000,
          uri: 'data:application/octet-stream;base64,...',
        },
      ],
    };

    return JSON.stringify(gltf, null, 2);
  }
}
