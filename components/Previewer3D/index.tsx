'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';

interface Previewer3DProps {
  modelJson: string;
  selectedAnimation: string;
}

function ModelMesh({ model }: { model: any }) {
  const meshRef = useRef<THREE.Group>(null);
  const [wireframe, setWireframe] = useState(false);

  useMemo(() => {
    if (!model.meshes || model.meshes.length === 0) return;

    // For each mesh in the model
    model.meshes.forEach((meshData: any) => {
      const geometry = new THREE.BufferGeometry();

      // Create position array
      const positions = meshData.vertices.flatMap((v: any) => [v.position.x, v.position.y, v.position.z]);
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

      // Create normal array
      const normals = meshData.vertices.flatMap((v: any) => [v.normal.x, v.normal.y, v.normal.z]);
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));

      // Create indices from faces
      const indices = meshData.faces.flatMap((f: any) => f.indices);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

      // Create material
      const material = meshData.material;
      const meshMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color(material.diffuse[0], material.diffuse[1], material.diffuse[2]),
        emissive: material.emissive ? new THREE.Color(material.emissive[0], material.emissive[1], material.emissive[2]) : 0x000000,
        shininess: material.shininess || 32,
        wireframe,
      });

      const threeMesh = new THREE.Mesh(geometry, meshMaterial);
      if (meshRef.current) {
        meshRef.current.add(threeMesh);
      }
    });

    return () => {
      if (meshRef.current) {
        meshRef.current.clear();
      }
    };
  }, [model, wireframe]);

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

function SceneContent({ model }: { model: any }) {
  const { camera } = useThree();

  // Auto-fit camera to model bounds
  useMemo(() => {
    if (!model.meshes || model.meshes.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    model.meshes.forEach((mesh: any) => {
      mesh.vertices.forEach((v: any) => {
        minX = Math.min(minX, v.position.x);
        minY = Math.min(minY, v.position.y);
        minZ = Math.min(minZ, v.position.z);
        maxX = Math.max(maxX, v.position.x);
        maxY = Math.max(maxY, v.position.y);
        maxZ = Math.max(maxZ, v.position.z);
      });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);
    const distance = maxSize / Math.tan((camera.fov * Math.PI) / 360);

    camera.position.set(centerX + distance * 0.7, centerY + distance * 0.5, centerZ + distance * 0.7);
    camera.lookAt(centerX, centerY, centerZ);
  }, [model, camera]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 3]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      
      <ModelMesh model={model} />
      <BoneSkeleton model={model} />
      <Grid args={[20, 20]} />
      <Environment preset="studio" />
      <OrbitControls />
    </>
  );
}

export function Previewer3D({ modelJson, selectedAnimation }: Previewer3DProps) {
  const model = useMemo(() => {
    try {
      return JSON.parse(modelJson);
    } catch {
      return null;
    }
  }, [modelJson]);

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
          <SceneContent model={model} />
        </Canvas>
      </Suspense>
    </div>
  );
}
