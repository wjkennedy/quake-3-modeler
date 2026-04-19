#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateModel,
  MeshBuilder,
  ProceduralGeometry,
  MD3Exporter,
  MD5Exporter,
  glTFExporter,
  generateAnimationConfig,
  formatAnimationConfigFile,
  createBone,
  createTag,
  Material,
  Model,
  AnimationTrack,
} from '@q3gen/core';

const VERSION = '1.0.0';

// Command: validate
program
  .command('validate <input>')
  .description('Validate a Q3Gen model JSON file')
  .action((input: string) => {
    try {
      const content = fs.readFileSync(input, 'utf-8');
      const data = JSON.parse(content);
      const model = validateModel(data);
      console.log('✓ Model validation passed!');
      console.log(`  Name: ${model.name}`);
      console.log(`  Meshes: ${model.meshes.length}`);
      console.log(`  Bones: ${model.bones.length}`);
      console.log(`  Animations: ${model.animations.length}`);
      console.log(`  Tags: ${model.tags?.length || 0}`);
    } catch (error) {
      console.error('✗ Validation failed:');
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      }
      process.exit(1);
    }
  });

// Command: export
program
  .command('export <input> <output>')
  .description('Export a Q3Gen model to a specific format')
  .option('-f, --format <format>', 'Export format (md3, md5, gltf)', 'md3')
  .action((input: string, output: string, options: any) => {
    try {
      const content = fs.readFileSync(input, 'utf-8');
      const data = JSON.parse(content);
      const model = validateModel(data);

      let exportData: ArrayBuffer | string;

      switch (options.format) {
        case 'md3':
          console.log('Exporting to MD3 format...');
          exportData = MD3Exporter.export(model);
          break;
        case 'md5':
          console.log('Exporting to MD5 format...');
          exportData = MD5Exporter.export(model);
          break;
        case 'gltf':
          console.log('Exporting to glTF format...');
          exportData = glTFExporter.export(model);
          break;
        default:
          throw new Error(`Unsupported format: ${options.format}`);
      }

      // Ensure output directory exists
      const dir = path.dirname(output);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      if (typeof exportData === 'string') {
        fs.writeFileSync(output, exportData, 'utf-8');
      } else {
        fs.writeFileSync(output, new Uint8Array(exportData));
      }

      console.log(`✓ Export complete: ${output}`);
      console.log(`  Format: ${options.format}`);
      console.log(`  Size: ${(exportData instanceof ArrayBuffer ? exportData.byteLength : Buffer.byteLength(exportData))} bytes`);
    } catch (error) {
      console.error('✗ Export failed:');
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      }
      process.exit(1);
    }
  });

// Command: generate
program
  .command('generate <output>')
  .description('Generate a sample procedural character')
  .option('-n, --name <name>', 'Character name', 'Procedural Character')
  .action((output: string, options: any) => {
    try {
      console.log('Generating sample character...');

      const material: Material = {
        id: 'mat_character',
        name: 'Character',
        diffuse: [0.8, 0.7, 0.6],
        shininess: 32,
      };

      const builder = new MeshBuilder('mesh_body', material);
      const bodyMesh = ProceduralGeometry.createCapsule(material, 0.4, 1.2, 16);
      const normalizedMesh = builder.computeNormals(bodyMesh);

      const model: Model = {
        id: `char_${Date.now()}`,
        name: options.name,
        version: '1.0',
        description: 'Procedurally generated character',
        meshes: [normalizedMesh],
        bones: [
          createBone('bone_root', 'Root', null),
          createBone('bone_pelvis', 'Pelvis', 'bone_root', { x: 0, y: 0, z: 0 }),
          createBone('bone_spine', 'Spine', 'bone_pelvis', { x: 0, y: 0.4, z: 0 }),
          createBone('bone_chest', 'Chest', 'bone_spine', { x: 0, y: 0.4, z: 0 }),
          createBone('bone_head', 'Head', 'bone_chest', { x: 0, y: 0.4, z: 0 }),
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
            ],
          },
        ],
        tags: [createTag('tag_weapon', 'Weapon Slot', { x: 0.5, y: 0.3, z: 0 })],
        scale: 1,
      };

      const dir = path.dirname(output);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(output, JSON.stringify(model, null, 2), 'utf-8');
      console.log(`✓ Character generated: ${output}`);
    } catch (error) {
      console.error('✗ Generation failed:');
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      }
      process.exit(1);
    }
  });

// Command: animconfig
program
  .command('animconfig <input> <output>')
  .description('Generate animation.cfg from animations')
  .action((input: string, output: string) => {
    try {
      const content = fs.readFileSync(input, 'utf-8');
      const data = JSON.parse(content);
      const model = validateModel(data);

      const entries = generateAnimationConfig(model.animations);
      const configText = formatAnimationConfigFile(entries);

      const dir = path.dirname(output);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(output, configText, 'utf-8');
      console.log(`✓ Animation config generated: ${output}`);
      console.log(`  Animations: ${entries.length}`);
    } catch (error) {
      console.error('✗ Generation failed:');
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      }
      process.exit(1);
    }
  });

// Global options
program
  .name('q3gen')
  .description('Quake 3 Model Generator - JavaScript-native model generation')
  .version(VERSION)
  .option('-v, --verbose', 'Enable verbose output');

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
