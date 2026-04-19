import { NextRequest, NextResponse } from 'next/server';
import { MeshBuilder, Material, ProceduralGeometry, mergeMeshes } from '@/lib/q3gen';

export async function GET() {
  try {
    // Create materials
    const torsoMaterial: Material = {
      id: 'mat_torso',
      name: 'Torso',
      diffuse: [0.6, 0.6, 0.8],
      shininess: 32,
    };

    const armMaterial: Material = {
      id: 'mat_arm',
      name: 'Arm',
      diffuse: [0.7, 0.5, 0.5],
      shininess: 32,
    };

    const headMaterial: Material = {
      id: 'mat_head',
      name: 'Head',
      diffuse: [0.9, 0.8, 0.7],
      shininess: 32,
    };

    const builder = new MeshBuilder('mesh_torso', torsoMaterial);

    // Create procedural humanoid character parts
    const torso = ProceduralGeometry.createCapsule(torsoMaterial, 0.4, 1.2, 16, {
      x: 0,
      y: 0,
      z: 0,
    });
    const torsoNormalized = builder.computeNormals(torso);

    const headBuilder = new MeshBuilder('mesh_head', headMaterial);
    const head = ProceduralGeometry.createSphere(headMaterial, 0.3, 16, 12, {
      x: 0,
      y: 1,
      z: 0,
    });
    const headNormalized = headBuilder.computeNormals(head);

    const leftArm = ProceduralGeometry.createCapsule(armMaterial, 0.2, 0.8, 12, {
      x: -0.6,
      y: 0.3,
      z: 0,
    });
    const leftArmBuilder = new MeshBuilder('mesh_left_arm', armMaterial);
    const leftArmNormalized = leftArmBuilder.computeNormals(leftArm);

    const rightArm = ProceduralGeometry.createCapsule(armMaterial, 0.2, 0.8, 12, {
      x: 0.6,
      y: 0.3,
      z: 0,
    });
    const rightArmBuilder = new MeshBuilder('mesh_right_arm', armMaterial);
    const rightArmNormalized = rightArmBuilder.computeNormals(rightArm);

    // Create a single merged mesh for simplicity
    const skinnedMaterial: Material = {
      id: 'mat_skinned',
      name: 'Character Skin',
      diffuse: [0.8, 0.7, 0.6],
      shininess: 32,
    };

    // For now, use the torso as the primary mesh
    const characterMesh = torsoNormalized;

    const sampleModel = {
      id: 'sample_doom_character',
      name: 'Procedural Doom Character',
      version: '1.0',
      description: 'Procedurally generated character with humanoid skeleton and basic animations',
      meshes: [characterMesh],
      bones: [
        {
          id: 'bone_root',
          name: 'Root',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_pelvis',
          name: 'Pelvis',
          parentId: 'bone_root',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_spine',
          name: 'Spine',
          parentId: 'bone_pelvis',
          position: { x: 0, y: 0.4, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_chest',
          name: 'Chest',
          parentId: 'bone_spine',
          position: { x: 0, y: 0.4, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_neck',
          name: 'Neck',
          parentId: 'bone_chest',
          position: { x: 0, y: 0.4, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 0.5, z: 1 },
        },
        {
          id: 'bone_head',
          name: 'Head',
          parentId: 'bone_neck',
          position: { x: 0, y: 0.3, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_left_shoulder',
          name: 'Left Shoulder',
          parentId: 'bone_chest',
          position: { x: -0.5, y: 0.1, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_left_arm',
          name: 'Left Arm',
          parentId: 'bone_left_shoulder',
          position: { x: -0.3, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_right_shoulder',
          name: 'Right Shoulder',
          parentId: 'bone_chest',
          position: { x: 0.5, y: 0.1, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_right_arm',
          name: 'Right Arm',
          parentId: 'bone_right_shoulder',
          position: { x: 0.3, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_left_leg',
          name: 'Left Leg',
          parentId: 'bone_pelvis',
          position: { x: -0.25, y: -0.5, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: 'bone_right_leg',
          name: 'Right Leg',
          parentId: 'bone_pelvis',
          position: { x: 0.25, y: -0.5, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
      ],
      animations: [
        {
          id: 'anim_idle',
          name: 'Idle',
          fps: 30,
          totalFrames: 60,
          looping: true,
          keyframes: [
            {
              frameIndex: 0,
              boneId: 'bone_spine',
              position: { x: 0, y: 0.4, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            {
              frameIndex: 30,
              boneId: 'bone_spine',
              position: { x: 0, y: 0.45, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            {
              frameIndex: 60,
              boneId: 'bone_spine',
              position: { x: 0, y: 0.4, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
          ],
        },
        {
          id: 'anim_walk',
          name: 'Walk',
          fps: 30,
          totalFrames: 40,
          looping: true,
          keyframes: [
            {
              frameIndex: 0,
              boneId: 'bone_left_leg',
              position: { x: -0.25, y: -0.5, z: 0 },
              rotation: { x: 0.3, y: 0, z: 0, w: 0.95 },
            },
            {
              frameIndex: 10,
              boneId: 'bone_left_leg',
              position: { x: -0.25, y: -0.6, z: 0.2 },
              rotation: { x: 0.1, y: 0, z: 0, w: 0.99 },
            },
            {
              frameIndex: 20,
              boneId: 'bone_left_leg',
              position: { x: -0.25, y: -0.5, z: 0 },
              rotation: { x: -0.3, y: 0, z: 0, w: 0.95 },
            },
            {
              frameIndex: 0,
              boneId: 'bone_right_leg',
              position: { x: 0.25, y: -0.5, z: 0 },
              rotation: { x: -0.3, y: 0, z: 0, w: 0.95 },
            },
            {
              frameIndex: 10,
              boneId: 'bone_right_leg',
              position: { x: 0.25, y: -0.6, z: -0.2 },
              rotation: { x: -0.1, y: 0, z: 0, w: 0.99 },
            },
            {
              frameIndex: 20,
              boneId: 'bone_right_leg',
              position: { x: 0.25, y: -0.5, z: 0 },
              rotation: { x: 0.3, y: 0, z: 0, w: 0.95 },
            },
          ],
        },
        {
          id: 'anim_attack',
          name: 'Attack',
          fps: 30,
          totalFrames: 20,
          looping: false,
          keyframes: [
            {
              frameIndex: 0,
              boneId: 'bone_chest',
              position: { x: 0, y: 0.4, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            {
              frameIndex: 10,
              boneId: 'bone_chest',
              position: { x: 0, y: 0.4, z: 0 },
              rotation: { x: 0, y: 0.3, z: 0, w: 0.95 },
            },
            {
              frameIndex: 20,
              boneId: 'bone_chest',
              position: { x: 0, y: 0.4, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
          ],
        },
      ],
      tags: [
        {
          id: 'tag_weapon',
          name: 'Weapon Right',
          position: { x: 0.4, y: 0.3, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          description: 'Right-hand weapon mount',
        },
        {
          id: 'tag_muzzle',
          name: 'Muzzle Flash',
          position: { x: 0.5, y: 0.4, z: 0.1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          description: 'Weapon muzzle flash origin',
        },
      ],
      lodConfigs: [],
      scale: 1,
    };

    return NextResponse.json(sampleModel);
  } catch (error) {
    console.error('[v0] Error generating sample model:', error);
    return NextResponse.json(
      { error: 'Failed to generate sample model: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
