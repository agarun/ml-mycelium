// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { Theme } from '$lib/ui';
import { BoundingBox } from '$lib/geometry';
import type { NodeId } from '$lib/network';
import { RectManager } from './rect';
import { Text } from 'troika-three-text';
import { TextManager } from './text';
import { SceneManager } from './scene';
import { WebGLManager } from './webgl';

export class ExpandedModuleManager extends WebGLManager {
  private sceneManager: SceneManager;
  private textManager: TextManager;
  private rectManager: RectManager;
  public expandedModules: Map<NodeId, THREE.Group>;
  private material: THREE.MeshBasicMaterial;
  private borderMaterial: THREE.MeshBasicMaterial;
  private hoveredNodeId: NodeId | undefined;

  constructor(sceneManager: SceneManager, textManager: TextManager, rectManager: RectManager) {
    super();
    this.sceneManager = sceneManager;
    this.textManager = textManager;
    this.rectManager = rectManager;
    this.expandedModules = new Map();
    this.material = new THREE.MeshBasicMaterial({
      color: 'rgb(250,250,250)',
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    this.borderMaterial = new THREE.MeshBasicMaterial({
      color: 'rgb(134, 134, 139)',
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
  }

  hoverNode(nodeId: NodeId | undefined): void {
    // Reset previous hover state if it exists
    if (this.hoveredNodeId && this.hoveredNodeId !== nodeId) {
      const prevModule = this.expandedModules.get(this.hoveredNodeId);
      if (prevModule) {
        const border = prevModule.children[1] as THREE.Mesh;
        if (border.material instanceof THREE.MeshBasicMaterial) {
          border.material.color.set('rgb(134, 134, 139)');
        }
        const text = prevModule.children[2];
        if (text instanceof Text) {
          text.color = Theme.colors.foreground.gray;
          text.sync();
        }
      }
    }

    this.hoveredNodeId = nodeId;

    // Apply new hover state if it exists
    if (nodeId) {
      const module = this.expandedModules.get(nodeId);
      if (module) {
        const border = module.children[1] as THREE.Mesh;
        if (border.material instanceof THREE.MeshBasicMaterial) {
          border.material.color.set(Theme.colors.foreground.blue);
        }
        const text = module.children[2];
        if (text instanceof Text) {
          text.color = Theme.colors.foreground.blue;
          text.sync();
        }
      }
    }
  }

  render(name: string, bb: BoundingBox, zIndex: number = 0): THREE.Group {
    const group = new THREE.Group();

    const bgGeometry = this.rectManager.render(bb.width, bb.height, 6);
    const bgMesh = new THREE.Mesh(bgGeometry, this.material);
    bgMesh.position.set(bb.center.x, bb.center.y, zIndex);
    group.add(bgMesh);

    const borderGeometry = this.rectManager.render(bb.width, bb.height, 6, 1);
    const border = new THREE.Mesh(borderGeometry, this.borderMaterial);
    border.position.set(bb.center.x, bb.center.y, zIndex + 0.1);
    group.add(border);

    const textMesh = this.textManager.render(name, {
      fontSize: 16,
      font: Theme.font.family,
      fontWeight: Theme.font.weight.regular,
      foregroundColor: Theme.colors.foreground.gray,
    });
    textMesh.anchorX = 'left';
    textMesh.anchorY = 'top';
    textMesh.position.set(bb.xMin, bb.yMin - 14, zIndex + 0.2);
    textMesh.sync();
    this.registerDisposable(textMesh);
    group.add(textMesh);

    return group;
  }

  clear(): void {
    for (const module of this.expandedModules.values()) {
      this.sceneManager.scene.remove(module);
    }
    this.expandedModules.clear();
    this.hoveredNodeId = undefined;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.borderMaterial.dispose();
    super.dispose();
  }
}
