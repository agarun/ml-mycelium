import * as THREE from 'three';
import { Theme } from '$lib/ui';
import { BoundingBox } from '$lib/geometry';
import type { NodeId } from '$lib/network';
import WebGLRect from './rect';
import WebGLText from './text';
import { Text } from 'troika-three-text';
import { SceneManager } from './scene';
import { WebGLManager } from './webgl';

export default class ExpandedModuleManager extends WebGLManager {
  private sceneManager: SceneManager;
  public expandedModules: Map<NodeId, THREE.Group>;
  private material: THREE.MeshBasicMaterial;
  private borderMaterial: THREE.MeshBasicMaterial;
  private hoveredNodeId: NodeId | undefined;

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
    this.expandedModules = new Map();
    this.material = new THREE.MeshBasicMaterial({
      color: 'rgb(250,250,250)',
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    this.borderMaterial = new THREE.MeshBasicMaterial({
      color: 'rgb(134, 134, 139)',
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
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

    const bgGeometry = WebGLRect.render(bb.width, bb.height, 6);
    const bgMesh = new THREE.Mesh(bgGeometry, this.material);
    bgMesh.position.set(bb.center.x, bb.center.y, zIndex);
    group.add(bgMesh);

    const borderGeometry = WebGLRect.render(bb.width, bb.height, 6, 1);
    const border = new THREE.Mesh(borderGeometry, this.borderMaterial);
    border.position.set(bb.center.x, bb.center.y, zIndex + 0.1);
    group.add(border);

    const textMesh = WebGLText.render(name, {
      fontSize: 16,
      font: Theme.font.family,
      fontWeight: Theme.font.weight.regular,
    });
    textMesh.anchorX = 'left';
    textMesh.anchorY = 'top';
    textMesh.position.set(bb.xMin, bb.yMin - 14, zIndex + 0.2);
    this.registerDisposable(textMesh);

    group.add(textMesh);
    return group;
  }

  dispose(): void {
    this.material.dispose();
    this.borderMaterial.dispose();
    for (const module of this.expandedModules.values()) {
      this.sceneManager.scene.remove(module);
      for (const child of module.children) {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          } else if (Array.isArray(child.material)) {
            child.material.forEach((material: THREE.Material) => material.dispose());
          }
        } else if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
        } else if (child instanceof Text) {
          child.dispose();
        }
      }
    }
    this.expandedModules.clear();
    super.dispose();
  }
}
