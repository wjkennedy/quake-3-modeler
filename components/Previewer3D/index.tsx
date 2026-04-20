'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';

interface Previewer3DProps {
  modelJson: string;
  selectedAnimation: string;
  textures?: Record<string, TextureAsset>;
}

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  previewUrl?: string;
}

function ModelMesh({ model, textures }: { model: any; textures: Record<string, TextureAsset> }) {
  const meshRef = useRef<THREE.Group>(null);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    if (!model.meshes || model.meshes.length === 0) return;
    if (!meshRef.current) return;

    meshRef.current.clear();
    const createdMaterials: THREE.Material[] = [];
    const createdTextures: THREE.Texture[] = [];

    model.meshes.forEach((meshData: any) => {
      if (!Array.isArray(meshData.vertices) || !Array.isArray(meshData.faces) || meshData.vertices.length === 0 || meshData.faces.length === 0) {
        return;
      }

      const geometry = new THREE.BufferGeometry();

      const positions = meshData.vertices.flatMap((v: any) => [v.position.x, v.position.y, v.position.z]);
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

      const normals = meshData.vertices.flatMap((v: any) => [v.normal.x, v.normal.y, v.normal.z]);
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));

      const uvs = meshData.vertices.flatMap((v: any) => [v.uv?.u ?? 0, v.uv?.v ?? 0]);
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));

      const indices = buildDisplayIndices(meshData);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

      const material = meshData.material;
      const diffuse = Array.isArray(material.diffuse) ? material.diffuse : [0.8, 0.8, 0.8];
      const texture = findTexture(material, textures);
      const meshMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color(diffuse[0], diffuse[1], diffuse[2]),
        emissive: material.emissive ? new THREE.Color(material.emissive[0], material.emissive[1], material.emissive[2]) : 0x000000,
        shininess: material.shininess || 32,
        wireframe,
      });
      createdMaterials.push(meshMaterial);

      if (texture) {
        loadTexture(texture, loadedTexture => {
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          loadedTexture.flipY = false;
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          meshMaterial.map = loadedTexture;
          meshMaterial.color.set(0xffffff);
          meshMaterial.needsUpdate = true;
          createdTextures.push(loadedTexture);
        });
      }

      const threeMesh = new THREE.Mesh(geometry, meshMaterial);
      meshRef.current?.add(threeMesh);
    });

    return () => {
      if (meshRef.current) {
        meshRef.current.clear();
      }
      createdMaterials.forEach(material => material.dispose());
      createdTextures.forEach(texture => texture.dispose());
    };
  }, [model, textures, wireframe]);

  return <group ref={meshRef} />;
}

function BoneSkeleton({ model }: { model: any }) {
  const skeletonRef = useRef<THREE.Group>(null);

  useMemo(() => {
    if (!model.bones || model.bones.length === 0) return;

    const boneMap = new Map<string, THREE.Bone>();

    // Create bones
    model.bones.forEach((boneData: any) => {
      const bone = new THREE.Bone();
      bone.position.set(boneData.position.x, boneData.position.y, boneData.position.z);
      bone.quaternion.set(boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w);
      bone.scale.set(boneData.scale?.x || 1, boneData.scale?.y || 1, boneData.scale?.z || 1);
      boneMap.set(boneData.id, bone);
    });

    // Build hierarchy
    model.bones.forEach((boneData: any) => {
      const bone = boneMap.get(boneData.id);
      if (bone && boneData.parentId) {
        const parent = boneMap.get(boneData.parentId);
        if (parent) {
          parent.add(bone);
        }
      } else if (bone && skeletonRef.current) {
        skeletonRef.current.add(bone);
      }
    });

    return () => {
      if (skeletonRef.current) {
        skeletonRef.current.clear();
      }
    };
  }, [model]);

  return (
    <group ref={skeletonRef}>
      {model.bones?.map((bone: any) => (
        <BoneVisualization key={bone.id} bone={bone} />
      ))}
    </group>
  );
}

function BoneVisualization({ bone }: { bone: any }) {
  return (
    <group position={[bone.position.x, bone.position.y, bone.position.z]}>
      <mesh>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={0xff6b00} />
      </mesh>
    </group>
  );
}

function SceneContent({ model, textures }: { model: any; textures: Record<string, TextureAsset> }) {
  const { camera } = useThree();

  // Auto-fit camera to model bounds
  useMemo(() => {
    if (!model.meshes || model.meshes.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    model.meshes.forEach((mesh: any) => {
      if (!Array.isArray(mesh.vertices)) return;

      mesh.vertices.forEach((v: any) => {
        minX = Math.min(minX, v.position.x);
        minY = Math.min(minY, v.position.y);
        minZ = Math.min(minZ, v.position.z);
        maxX = Math.max(maxX, v.position.x);
        maxY = Math.max(maxY, v.position.y);
        maxZ = Math.max(maxZ, v.position.z);
      });
    });

    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 1);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const distance = maxSize / Math.tan((fov * Math.PI) / 360);

    camera.position.set(centerX + distance * 0.7, centerY + distance * 0.5, centerZ + distance * 0.7);
    camera.lookAt(centerX, centerY, centerZ);
  }, [model, camera]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 3]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      
      <ModelMesh model={model} textures={textures} />
      <BoneSkeleton model={model} />
      <Environment preset="studio" />
      <OrbitControls />
    </>
  );
}

export function Previewer3D({ modelJson, selectedAnimation, textures = {} }: Previewer3DProps) {
  const model = useMemo(() => {
    try {
      return JSON.parse(modelJson);
    } catch {
      return null;
    }
  }, [modelJson]);
  const resolvedTextures = useMemo(() => ({ ...(model?.embeddedTextures || {}), ...textures }), [model, textures]);

  if (!model) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Invalid model JSON
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading 3D viewer...
          </div>
        }
      >
        <Canvas>
          <SceneContent model={model} textures={resolvedTextures} />
        </Canvas>
      </Suspense>
    </div>
  );
}

function findTexture(material: any, textures: Record<string, TextureAsset>): TextureAsset | null {
  const candidates = [material?.texturePath, material?.texture, material?.diffuseMap, material?.name]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .flatMap(getTextureCandidates);

  for (const key of candidates) {
    const texture = textures[key];
    if (texture) return texture;
  }

  return null;
}

function getTextureCandidates(value: string): string[] {
  const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const hasDirectory = normalized.includes('/');
  const candidates = [normalized, withoutExtension];

  if (!/\.[^/.]+$/.test(normalized)) {
    ['.png', '.jpg', '.jpeg', '.tga', '.webp'].forEach(extension => {
      candidates.push(`${normalized}${extension}`);
    });
  }

  if (!hasDirectory) {
    candidates.push(fileName, baseName);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function loadTexture(texture: TextureAsset, onLoad: (texture: THREE.Texture) => void) {
  const isTga = texture.type === 'image/x-tga' || texture.name.toLowerCase().endsWith('.tga');
  const loader = isTga ? new TGALoader() : new THREE.TextureLoader();
  loader.load(texture.url, onLoad, undefined, error => {
    console.error('[v0] Texture load error:', error);
  });
}

function buildDisplayIndices(meshData: any): number[] {
  const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
  const shouldReverse = hasReversedWinding(meshData);

  return faces.flatMap((face: any) => {
    const indices = Array.isArray(face.indices) ? face.indices : [];
    if (indices.length < 3) return [];

    return shouldReverse
      ? [indices[0], indices[2], indices[1]]
      : [indices[0], indices[1], indices[2]];
  });
}

function hasReversedWinding(meshData: any): boolean {
  const vertices = Array.isArray(meshData.vertices) ? meshData.vertices : [];
  const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
  let vote = 0;
  let samples = 0;

  for (const face of faces) {
    const [i0, i1, i2] = Array.isArray(face.indices) ? face.indices : [];
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    if (!v0?.position || !v1?.position || !v2?.position || !v0?.normal || !v1?.normal || !v2?.normal) {
      continue;
    }

    const edge1 = {
      x: v1.position.x - v0.position.x,
      y: v1.position.y - v0.position.y,
      z: v1.position.z - v0.position.z,
    };
    const edge2 = {
      x: v2.position.x - v0.position.x,
      y: v2.position.y - v0.position.y,
      z: v2.position.z - v0.position.z,
    };
    const faceNormal = {
      x: edge1.y * edge2.z - edge1.z * edge2.y,
      y: edge1.z * edge2.x - edge1.x * edge2.z,
      z: edge1.x * edge2.y - edge1.y * edge2.x,
    };
    const vertexNormal = {
      x: v0.normal.x + v1.normal.x + v2.normal.x,
      y: v0.normal.y + v1.normal.y + v2.normal.y,
      z: v0.normal.z + v1.normal.z + v2.normal.z,
    };
    const dot = faceNormal.x * vertexNormal.x + faceNormal.y * vertexNormal.y + faceNormal.z * vertexNormal.z;

    if (Math.abs(dot) < 1e-6) {
      continue;
    }

    vote += dot < 0 ? 1 : -1;
    samples++;
  }

  return samples > 0 && vote > 0;
}
