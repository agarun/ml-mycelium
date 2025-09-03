// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import type { ITextOptions } from '$lib/ui/text';
import { Theme } from '$lib/ui';
import { DisplayObject, Container } from '$lib/scene';
import { TextDisplayObject } from '$lib/ui/text';
import { RectDisplayObject } from '$lib/ui/rect';
import { Transform } from '$lib/geometry';
import { TextManager } from './text';
import { WebGLManager } from './webgl';
import { SceneManager } from './scene';
import { ExpandedModuleManager } from './expanded-module';
import { RectManager } from './rect';
import { InstancedRectManager, type RoundedRectInstance } from './instanced-rect';

interface DisplayObjectHashResult {
  type: 'text' | 'container' | 'unknown';
  text?: string;
  transform: Transform;
  options?: ITextOptions;
  children?: DisplayObjectHashResult[];
}

export class BadgeManager extends WebGLManager {
  private sceneManager: SceneManager;
  private textManager: TextManager;
  private badges: Map<NodeId, THREE.Group>;
  private materials: Map<string, THREE.MeshBasicMaterial>;

  constructor(sceneManager: SceneManager, textManager: TextManager) {
    super();
    this.sceneManager = sceneManager;
    this.textManager = textManager;
    this.badges = new Map();
    this.materials = new Map();
  }

  render(
    nodeId: NodeId,
    color: string,
    text: string | undefined,
    position: THREE.Vector3,
  ): THREE.Group {
    const group = new THREE.Group();
    const radius = 10;
    const segments = 32;

    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      });
      this.materials.set(color, material);
    }

    const circleGeometry = new THREE.CircleGeometry(radius, segments);
    const circleMaterial = material.clone();
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    group.add(circle);

    const borderGeometry = new THREE.RingGeometry(radius - 2, radius, segments);
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 'white',
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    group.add(border);

    this.registerDisposable(circleGeometry, circleMaterial, borderGeometry, borderMaterial);

    if (text) {
      const textMesh = this.textManager.render(text, {
        fontSize: 12,
        foregroundColor: 'white',
        font: Theme.font.family,
        fontWeight: Theme.font.weight.bold,
      });
      textMesh.position.z = 0.1;
      textMesh.sync();
      this.registerDisposable(textMesh);

      group.add(textMesh);
    }

    group.position.copy(position);
    group.userData.nodeId = nodeId;
    this.badges.set(nodeId, group);
    this.sceneManager.scene.add(group);

    return group;
  }

  clear(): void {
    for (const badge of this.badges.values()) {
      this.sceneManager.scene.remove(badge);
    }
    this.badges.clear();
  }

  dispose(): void {
    this.clear();
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    super.dispose();
  }
}

export class NodeManager extends WebGLManager {
  private sceneManager: SceneManager;
  private textManager: TextManager;
  private rectManager: RectManager;
  private instancedRectManager: InstancedRectManager;
  private expandedModuleManager: ExpandedModuleManager;
  private badgeManager: BadgeManager;

  private contentGroups: Map<NodeId, THREE.Group>;

  private nodeIdToInstanceIndex: Map<NodeId, number>;
  private instanceIndexToNodeId: Map<number, NodeId>;
  private nodeIdToBaseBorderColor: Map<NodeId, string>;
  private nodeIdToBaseBorderWidth: Map<NodeId, number>;

  private hoveredNodeId: NodeId | undefined;
  private selectedNodeIds: Set<NodeId>;
  private lastDrawableHash: string | null = null;
  private lastDecorationsHash: string | null = null;

  private raycaster: THREE.Raycaster;
  private vec2: THREE.Vector2;
  private objects: THREE.Object3D[] = [];

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
    this.textManager = this.sceneManager.textManager;
    this.rectManager = new RectManager();
    this.instancedRectManager = new InstancedRectManager();
    this.expandedModuleManager = new ExpandedModuleManager(
      this.sceneManager,
      this.textManager,
      this.rectManager,
    );
    this.badgeManager = new BadgeManager(this.sceneManager, this.textManager);
    this.contentGroups = new Map();

    this.nodeIdToInstanceIndex = new Map();
    this.instanceIndexToNodeId = new Map();
    this.nodeIdToBaseBorderColor = new Map();
    this.nodeIdToBaseBorderWidth = new Map();

    this.hoveredNodeId = undefined;
    this.selectedNodeIds = new Set();

    this.raycaster = new THREE.Raycaster();
    this.vec2 = new THREE.Vector2();
  }

  get interactiveNodes(): THREE.Object3D[] {
    const items: THREE.Object3D[] = [...this.expandedModuleManager.expandedModules.values()];
    if (this.instancedRectManager.mesh) items.push(this.instancedRectManager.mesh);
    return items;
  }

  private drawableHash(drawable: IDrawableNetwork): string {
    return JSON.stringify({
      nodes: Array.from(drawable.nodes.entries()).map(([id, node]) => ({
        id,
        bb: node.boundingBox(),
        options: node.options,
        content: this.displayObjectHash(node.content),
      })),
      collapsed: Array.from(drawable.collapsed.entries()).map(([id, node]) => ({
        id,
        bb: node.boundingBox(),
        options: node.options,
        content: this.displayObjectHash(node.content),
      })),
      expanded: Array.from(drawable.expanded.entries()).map(([id, module]) => ({
        id,
        name: module.name,
        bb: module.boundingBox,
      })),
    });
  }

  private displayObjectHash(obj: DisplayObject): DisplayObjectHashResult {
    if (obj instanceof TextDisplayObject) {
      return {
        type: 'text',
        text: obj.text,
        transform: obj.transform,
        options: obj.options,
      };
    } else if (obj instanceof Container) {
      return {
        type: 'container',
        transform: obj.transform,
        children: obj.children.map((child: DisplayObject) => this.displayObjectHash(child)),
      };
    }
    return { type: 'unknown', transform: obj.transform };
  }

  private decorationsHash(decorations: Map<NodeId, Partial<IRectOptions>>): string {
    return JSON.stringify(Array.from(decorations.entries()));
  }

  needsUpdate(
    drawable: IDrawableNetwork,
    decorations: Map<NodeId, Partial<IRectOptions>>,
  ): boolean {
    const drawableHash = this.drawableHash(drawable);
    const decorationsHash = this.decorationsHash(decorations);

    const didDrawableUpdate = this.lastDrawableHash !== drawableHash;
    const didDecorationsUpdate = this.lastDecorationsHash !== decorationsHash;

    if (didDrawableUpdate) this.lastDrawableHash = drawableHash;
    if (didDecorationsUpdate) this.lastDecorationsHash = decorationsHash;

    return didDrawableUpdate || didDecorationsUpdate;
  }

  private clearNodes(): void {
    if (this.instancedRectManager.mesh) {
      this.sceneManager.scene.remove(this.instancedRectManager.mesh);
    }
    this.nodeIdToInstanceIndex.clear();
    this.instanceIndexToNodeId.clear();
    this.nodeIdToBaseBorderColor.clear();
    this.nodeIdToBaseBorderWidth.clear();

    for (const group of this.contentGroups.values()) {
      this.sceneManager.scene.remove(group);
      group.traverse((object) => {
        if (object.userData.isText) return;
        if ('geometry' in object && object.geometry) {
          const geometry = object.geometry as THREE.BufferGeometry & {
            userData: { __sharedCache?: boolean };
          };
          if (geometry.userData.__sharedCache !== true) {
            geometry.dispose();
          }
        }

        if ('material' in object && object.material) {
          const material = object.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) {
            material.forEach((mat: THREE.Material) => {
              mat.dispose();
            });
          } else {
            material.dispose();
          }
        }
      });
    }
    this.contentGroups.clear();
    this.expandedModuleManager.clear();
    this.badgeManager.clear();
    this.textManager.clear();
  }

  renderNodes(drawable: IDrawableNetwork, decorations: Map<NodeId, Partial<IRectOptions>>): void {
    if (this.needsUpdate(drawable, decorations)) {
      this.clearNodes();
      this.render(drawable, decorations);
    }
  }

  render(drawable: IDrawableNetwork, decorations: Map<NodeId, Partial<IRectOptions>>): void {
    // Store current selection and hover states before re-rendering
    const currentSelectedIds = new Set(this.selectedNodeIds);
    const currentHoveredId = this.hoveredNodeId;

    const moduleNestingLevels: Map<NodeId, number> = new Map();
    const moduleParents = new Map<NodeId, NodeId>();

    for (const [nodeId, module] of drawable.expanded) {
      const moduleBB = module.boundingBox;
      for (const [otherId, otherModule] of drawable.expanded) {
        if (nodeId !== otherId && moduleBB.encloses(otherModule.boundingBox)) {
          moduleParents.set(otherId, nodeId);
        }
      }
    }

    const computeNestingLevel = (nodeId: NodeId): number => {
      if (moduleNestingLevels.has(nodeId)) {
        const level = moduleNestingLevels.get(nodeId);
        return level !== undefined ? level : 0;
      }
      const parentId = moduleParents.get(nodeId);
      if (!parentId) {
        moduleNestingLevels.set(nodeId, 0);
        return 0;
      }
      const parentLevel = computeNestingLevel(parentId);
      const level = parentLevel + 1;
      moduleNestingLevels.set(nodeId, level);
      return level;
    };

    for (const [nodeId] of drawable.expanded) {
      computeNestingLevel(nodeId);
    }

    for (const [nodeId, module] of drawable.expanded) {
      const originalBB = module.boundingBox;
      const nestingLevel = moduleNestingLevels.get(nodeId) || 0;
      const zIndex = -0.5 + nestingLevel * 0.1; // Start at -0.5 and increment by 0.1 per level
      const moduleGroup = this.expandedModuleManager.render(module.name, originalBB, zIndex);
      moduleGroup.position.set(0, 0, 0);
      moduleGroup.userData.nodeId = nodeId;
      this.expandedModuleManager.expandedModules.set(nodeId, moduleGroup);
      this.sceneManager.scene.add(moduleGroup);
    }

    // Update both expanded and collapsed nodes
    const allNodes = [...drawable.nodes.entries(), ...drawable.collapsed.entries()];

    // Build instanced bg+border batch
    this.instancedRectManager.begin(allNodes.length);
    if (
      this.instancedRectManager.mesh &&
      !this.sceneManager.scene.children.includes(this.instancedRectManager.mesh)
    ) {
      this.sceneManager.scene.add(this.instancedRectManager.mesh);
    }

    let instanceIndex = 0;
    for (const [nodeId, entity] of allNodes) {
      const originalBB = entity.boundingBox();
      const decoration = decorations.get(nodeId);

      // Frame defaults mirror SVG Node.svelte, merged with decoration
      const frame = {
        backgroundColor: decoration?.backgroundColor || entity.options.backgroundColor,
        borderColor: decoration?.borderColor || entity.options.borderColor,
        borderWidth: decoration?.borderWidth ?? 1,
        radius: decoration?.radius ?? 6,
        borderDash: decoration?.borderDash || entity.options.borderDash,
      } as const;

      this.nodeIdToInstanceIndex.set(nodeId, instanceIndex);
      this.nodeIdToBaseBorderColor.set(nodeId, frame.borderColor);
      this.nodeIdToBaseBorderWidth.set(nodeId, frame.borderWidth);

      // Parse colors; honor 'none' by using alpha 0
      const fill = new THREE.Color(0x000000);
      let fillA = 1;
      if (frame.backgroundColor === 'none') {
        fillA = 0;
      } else {
        try {
          fill.setStyle(frame.backgroundColor);
        } catch {
          fill.set(0x000000);
          fillA = 0; // fail closed transparent
        }
      }

      const border = new THREE.Color(0x000000);
      let borderA = 1;
      if (frame.borderColor === 'none' || frame.borderWidth <= 0) {
        borderA = 0;
      } else {
        try {
          border.setStyle(frame.borderColor);
        } catch {
          border.set(0x000000);
          borderA = 0;
        }
      }

      const instance: RoundedRectInstance = {
        centerX: originalBB.center.x,
        centerY: originalBB.center.y,
        z: 0,
        width: originalBB.width,
        height: originalBB.height,
        radius: frame.radius,
        borderWidth: frame.borderWidth,
        dashLength: frame.borderDash,
        fillR: fill.r,
        fillG: fill.g,
        fillB: fill.b,
        fillA: fillA,
        borderR: border.r,
        borderG: border.g,
        borderB: border.b,
        borderA: borderA,
      };
      this.instancedRectManager.setInstance(instanceIndex, instance);
      // Set userData on the instanced mesh once for picking clarity
      if (this.instancedRectManager.mesh && !this.instancedRectManager.mesh.userData.kind) {
        this.instancedRectManager.mesh.userData.kind = 'nodeRect';
      }
      // Reverse lookup for picking
      this.instanceIndexToNodeId.set(instanceIndex, nodeId);
      instanceIndex++;

      const contentGroup = new THREE.Group();
      contentGroup.position.set(
        originalBB.center.x - originalBB.width / 2,
        originalBB.center.y - originalBB.height / 2,
        0.2,
      );
      this.sceneManager.scene.add(contentGroup);
      this.contentGroups.set(nodeId, contentGroup);

      this.renderDisplayObject(entity.content, contentGroup, nodeId, 0);

      if (entity.options.badge) {
        const badgePosition = new THREE.Vector3(originalBB.xMax + 1, originalBB.yMin - 1, 1.0);
        this.badgeManager.render(
          nodeId,
          entity.options.badge.color,
          entity.options.badge.text,
          badgePosition,
        );
      }
    }
    this.instancedRectManager.end();

    // Reapply interaction states (hover/selection)
    this.selectedNodeIds = currentSelectedIds;
    this.hoveredNodeId = currentHoveredId;
    for (const [nodeId] of this.nodeIdToInstanceIndex) {
      this.setState(nodeId, {
        isHovered: nodeId === currentHoveredId,
        isSelected: currentSelectedIds.has(nodeId),
      });
    }
  }

  renderDisplayObject(
    displayObject: DisplayObject,
    parent: THREE.Group,
    nodeId: NodeId,
    currentRelativeZ: number,
  ): void {
    const displayObjectPosX = displayObject.transform.x;
    const displayObjectPosY = displayObject.transform.y;
    const displayObjectBB = displayObject.boundingBox();

    if (displayObject instanceof TextDisplayObject) {
      const text = this.textManager.render(displayObject.text, displayObject.options);
      text.position.set(
        displayObjectPosX + displayObjectBB.width / 2,
        displayObjectPosY + displayObjectBB.height / 2,
        currentRelativeZ,
      );
      text.sync();
      parent.add(text);
    } else if (displayObject instanceof RectDisplayObject) {
      // RectDisplayObject can be used by `ui.Node` builders to render `Separator`s\
      // as 1px-high rects interspersed between contents.
      const { width, height } = displayObjectBB;
      const { backgroundColor, borderColor, borderWidth, radius } = displayObject.options;

      // Fill
      if (backgroundColor !== 'none') {
        const fillGeom = this.rectManager.render(width, height, radius ?? 0);
        const fillMat = new THREE.MeshBasicMaterial({
          color: backgroundColor,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        });
        const fillMesh = new THREE.Mesh(fillGeom, fillMat);
        fillMesh.position.set(
          displayObjectPosX + width / 2,
          displayObjectPosY + height / 2,
          currentRelativeZ,
        );
        parent.add(fillMesh);
      }

      // Border
      if (borderWidth > 0 && borderColor !== 'none') {
        const borderGeom = this.rectManager.render(width, height, radius ?? 0, borderWidth);
        const borderMat = new THREE.MeshBasicMaterial({
          color: borderColor,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        });
        const borderMesh = new THREE.Mesh(borderGeom, borderMat);
        borderMesh.position.set(
          displayObjectPosX + width / 2,
          displayObjectPosY + height / 2,
          currentRelativeZ + 0.0001, // nudge to avoid z-fighting with fill
        );
        parent.add(borderMesh);
      }
    } else if (displayObject instanceof Container) {
      const containerGroup = new THREE.Group();
      containerGroup.position.set(displayObjectPosX, displayObjectPosY, currentRelativeZ);
      parent.add(containerGroup);

      for (const child of displayObject.children as DisplayObject[]) {
        this.renderDisplayObject(child, containerGroup, nodeId, currentRelativeZ + 0.001);
      }
    }
  }

  getNodeAtPoint(point: THREE.Vector2, camera: THREE.Camera): NodeId | undefined {
    // Flip the y coordinate since the camera is flipped
    this.vec2.set(point.x, -point.y);
    this.raycaster.setFromCamera(this.vec2, camera);

    // Get all interactive objects
    const objects = this.interactiveNodes;
    if (objects.length === 0) return undefined;

    // raycast candidates:
    // - instanced mesh
    // - prefiltered expanded modules by axis-align bounding box (AABB) containment of the mouse world point
    this.objects.length = 0;
    if (this.instancedRectManager.mesh) {
      this.objects.push(this.instancedRectManager.mesh);
    }

    // Convert NDC to world at z=0 for AABB test
    const ndc = new THREE.Vector3(this.vec2.x, this.vec2.y, 0);
    ndc.unproject(camera);
    for (const obj of objects) {
      if (this.instancedRectManager.mesh && obj === this.instancedRectManager.mesh) continue;
      const bb = obj.userData.bb as
        | { xMin: number; xMax: number; yMin: number; yMax: number }
        | undefined;
      if (!bb) {
        // No BB: include conservatively
        this.objects.push(obj);
        continue;
      }
      const x = ndc.x;
      const y = ndc.y;
      if (x >= bb.xMin && x <= bb.xMax && y >= bb.yMin && y <= bb.yMax) {
        this.objects.push(obj);
      }
    }

    const intersects = this.raycaster.intersectObjects(this.objects, true);

    if (intersects.length > 0) {
      // First handle instanced rect hit (has instanceId)
      for (const hit of intersects) {
        if (
          typeof hit.instanceId === 'number' &&
          this.instancedRectManager.mesh &&
          hit.object === this.instancedRectManager.mesh
        ) {
          const idx = hit.instanceId;
          const nodeId = this.instanceIndexToNodeId.get(idx);
          if (nodeId) return nodeId;
        }
      }

      // Otherwise, find first object with a nodeId in userData (expanded modules, etc.)
      for (const hit of intersects) {
        let current: THREE.Object3D | null = hit.object;
        while (current) {
          if (current.userData.nodeId) {
            return current.userData.nodeId as NodeId;
          }
          current = current.parent;
        }
      }
    }
    return undefined;
  }

  hoverNode(nodeId: NodeId | undefined): void {
    // Reset previous hover state if it exists
    if (this.hoveredNodeId) {
      this.setState(this.hoveredNodeId, {
        isSelected: this.selectedNodeIds.has(this.hoveredNodeId),
      });
    }

    this.hoveredNodeId = nodeId;

    // Apply new hover state if it exists
    if (nodeId) {
      this.setState(nodeId, {
        isHovered: true,
        isSelected: this.selectedNodeIds.has(nodeId),
      });
    }

    this.expandedModuleManager.hoverNode(nodeId);
  }

  selectNodes(nodeIds: Set<NodeId>): void {
    // Update all nodes that were previously selected but aren't anymore
    this.selectedNodeIds.forEach((nodeId) => {
      if (!nodeIds.has(nodeId)) {
        this.setState(nodeId, {
          isHovered: nodeId === this.hoveredNodeId,
          isSelected: false,
        });
      }
    });

    // Update all newly selected nodes
    nodeIds.forEach((nodeId) => {
      this.setState(nodeId, {
        isHovered: nodeId === this.hoveredNodeId,
        isSelected: true,
      });
    });

    this.selectedNodeIds = new Set(nodeIds);
  }

  setState(
    nodeId: NodeId,
    options: { isHovered?: boolean; isSelected?: boolean } = {
      isHovered: false,
      isSelected: false,
    },
  ): void {
    const instanceIndex = this.nodeIdToInstanceIndex.get(nodeId);
    if (instanceIndex === undefined) return;

    // Defaults
    // Source base values from what we recorded during render()
    const baseBorderColor: string =
      this.nodeIdToBaseBorderColor.get(nodeId) ?? Theme.colors.foreground.grayTertiary;
    const baseBorderWidth = this.nodeIdToBaseBorderWidth.get(nodeId) ?? 1;

    const { isHovered = false, isSelected = false } = options;

    let finalBorderColor: string = baseBorderColor;
    let finalBorderWidth = baseBorderWidth;

    if (isSelected) {
      finalBorderColor = Theme.colors.foreground.blue;
      finalBorderWidth = 3;
    } else if (isHovered) {
      finalBorderColor = Theme.colors.foreground.blue;
      // finalBorderWidth remains baseBorderWidth for hover
    }

    const border = new THREE.Color().setStyle(finalBorderColor);
    // If hover/selected, push border color only; else restore base
    this.instancedRectManager.updateBorder(instanceIndex, finalBorderWidth, {
      r: border.r,
      g: border.g,
      b: border.b,
      a: 1,
    });
  }

  dispose(): void {
    this.clearNodes();

    this.textManager.dispose();
    this.rectManager.dispose();
    this.instancedRectManager.dispose();
    this.expandedModuleManager.dispose();
    this.badgeManager.dispose();
    super.dispose();
  }
}
