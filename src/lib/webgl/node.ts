// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import type { INodeOptions } from '$lib/ui/node';
import type { ITextOptions } from '$lib/ui/text';
import { Theme } from '$lib/ui';
import { DisplayObject, Container } from '$lib/scene';
import { TextDisplayObject } from '$lib/ui/text';
import { Transform } from '$lib/geometry';
import { TextManager } from './text';
import { WebGLManager } from './webgl';
import { SceneManager } from './scene';
import { ExpandedModuleManager } from './expanded-module';
import { RectManager } from './rect';

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

    // if (text) {
    //   const textMesh = this.textManager.render(text, {
    //     fontSize: 12,
    //     foregroundColor: 'white',
    //     font: Theme.font.family,
    //     fontWeight: Theme.font.weight.bold,
    //   });
    //   textMesh.position.z = 0.1;
    //   textMesh.sync();
    //   this.registerDisposable(textMesh);

    //   group.add(textMesh);
    // }

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
  private expandedModuleManager: ExpandedModuleManager;
  private badgeManager: BadgeManager;

  private materials: Map<string, THREE.MeshBasicMaterial>;
  private geometries: Map<string, THREE.BufferGeometry>;
  private meshes: Map<NodeId, THREE.Mesh>;
  private borders: Map<NodeId, THREE.Mesh>;
  private contentGroups: Map<NodeId, THREE.Group>;

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
    this.textManager = new TextManager();
    this.rectManager = new RectManager();
    this.expandedModuleManager = new ExpandedModuleManager(
      this.sceneManager,
      this.textManager,
      this.rectManager,
    );
    this.badgeManager = new BadgeManager(this.sceneManager, this.textManager);

    this.materials = new Map();
    this.geometries = new Map();
    this.meshes = new Map();
    this.borders = new Map();
    this.contentGroups = new Map();

    this.hoveredNodeId = undefined;
    this.selectedNodeIds = new Set();

    this.raycaster = new THREE.Raycaster();
    this.vec2 = new THREE.Vector2();
  }

  get interactiveNodes(): THREE.Object3D[] {
    return [...this.meshes.values(), ...this.expandedModuleManager.expandedModules.values()];
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

    const didDrawableUpdate = this.lastDrawableHash !== this.drawableHash(drawable);
    const didDecorationsUpdate = this.lastDecorationsHash !== this.decorationsHash(decorations);

    if (didDrawableUpdate) this.lastDrawableHash = drawableHash;
    if (didDecorationsUpdate) this.lastDecorationsHash = decorationsHash;

    return didDrawableUpdate || didDecorationsUpdate;
  }

  private clearNodes(): void {
    for (const mesh of this.meshes.values()) {
      this.sceneManager.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material: THREE.Material) => {
          material.dispose();
        });
      } else {
        mesh.material.dispose();
      }
    }
    this.meshes.clear();

    for (const border of this.borders.values()) {
      this.sceneManager.scene.remove(border);
      border.geometry.dispose();
      if (Array.isArray(border.material)) {
        border.material.forEach((material: THREE.Material) => {
          material.dispose();
        });
      } else {
        border.material.dispose();
      }
    }
    this.borders.clear();

    for (const group of this.contentGroups.values()) {
      this.sceneManager.scene.remove(group);
      group.traverse((object) => {
        // Don't dispose Text objects - TextManager handles that
        if ('geometry' in object && object.geometry) {
          const geometry = object.geometry as THREE.BufferGeometry;
          geometry.dispose();
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

    const moduleNestingLevels = new Map<NodeId, number>();
    const moduleParents = new Map<NodeId, NodeId>();

    // Find all parent-child relationships between modules
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

    // Calculate nesting levels for all modules
    for (const [nodeId] of drawable.expanded) {
      computeNestingLevel(nodeId);
    }

    // Update expanded modules first (they should be behind nodes)
    for (const [nodeId, module] of drawable.expanded) {
      const originalBB = module.boundingBox;
      const nestingLevel = moduleNestingLevels.get(nodeId) || 0;
      // Create expanded module with z-index based on nesting level
      // Higher nesting level = higher z-index (closer to camera)
      const zIndex = -0.5 + nestingLevel * 0.1; // Start at -0.5 and increment by 0.1 for each level
      const moduleGroup = this.expandedModuleManager.render(module.name, originalBB, zIndex);
      moduleGroup.position.set(0, 0, 0);
      moduleGroup.userData.nodeId = nodeId;
      this.expandedModuleManager.expandedModules.set(nodeId, moduleGroup);
      this.sceneManager.scene.add(moduleGroup);
    }

    // Update both expanded and collapsed nodes
    const allNodes = [...drawable.nodes.entries(), ...drawable.collapsed.entries()];
    for (const [nodeId, entity] of allNodes) {
      const originalBB = entity.boundingBox();
      const decoration = decorations.get(nodeId);

      // Create node background
      let initialBgColor = entity.options.backgroundColor || Theme.colors.white;
      if (decoration?.backgroundColor) {
        initialBgColor = decoration.backgroundColor;
      }
      const materialKey = initialBgColor;
      let material = this.materials.get(materialKey);

      if (!material) {
        material = new THREE.MeshBasicMaterial({
          color: initialBgColor,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        });
        this.materials.set(materialKey, material);
      }
      const bgGeometry = this.rectManager.render(originalBB.width, originalBB.height, 6);
      const bgMesh = new THREE.Mesh(bgGeometry, material);
      bgMesh.position.set(originalBB.center.x, originalBB.center.y, 0);
      bgMesh.userData.nodeId = nodeId;

      // Create node border
      let initialBorderColor = entity.options.borderColor || Theme.colors.foreground.grayTertiary;
      let initialBorderWidth = 1;

      if (decoration?.borderColor) {
        initialBorderColor = decoration.borderColor;
      }
      if (decoration?.borderWidth !== undefined) {
        initialBorderWidth = decoration.borderWidth;
      }

      const borderGeometry = this.rectManager.render(
        originalBB.width,
        originalBB.height,
        6,
        initialBorderWidth,
      );
      const borderMaterial = new THREE.MeshBasicMaterial({
        color: initialBorderColor,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
      borderMesh.position.set(originalBB.center.x, originalBB.center.y, 0.1);
      borderMesh.userData.nodeId = nodeId;
      borderMesh.userData.nodeOptions = entity.options;
      borderMesh.userData.decorationOptions = decoration;
      borderMesh.userData.nodeWidth = originalBB.width;
      borderMesh.userData.nodeHeight = originalBB.height;
      borderMesh.userData.currentBorderWidth = initialBorderWidth;

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

      this.meshes.set(nodeId, bgMesh);
      this.borders.set(nodeId, borderMesh);
      this.sceneManager.scene.add(bgMesh);
      this.sceneManager.scene.add(borderMesh);
    }

    // Reapply states
    this.selectedNodeIds = currentSelectedIds;
    this.hoveredNodeId = currentHoveredId;
    for (const [nodeId] of this.borders) {
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
      // const text = this.textManager.render(displayObject.text, displayObject.options);
      // text.position.set(
      //   displayObjectPosX + displayObjectBB.width / 2,
      //   displayObjectPosY + displayObjectBB.height / 2,
      //   currentRelativeZ,
      // );
      // text.sync(); // Sync after modifying position
      // parent.add(text);
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

    // Pre-filter objects by distance to reduce raycasting workload
    const maxDistance = 1000;

    this.objects.length = 0;
    let count = 0;
    const maxObjectsToTest = 50;

    for (let i = 0; i < objects.length && count < maxObjectsToTest; i++) {
      const obj = objects[i];
      const distance = obj.position.distanceTo(camera.position);
      if (distance < maxDistance) {
        this.objects[count] = obj;
        count++;
      }
    }

    // Only do precise raycasting on the filtered subset
    const intersects = this.raycaster.intersectObjects(this.objects, true);

    if (intersects.length > 0) {
      // Find the first object with a nodeId in its userData
      const object = intersects[0].object;
      let current: THREE.Object3D | null = object;
      while (current) {
        if (current.userData.nodeId) {
          return current.userData.nodeId as NodeId;
        }
        current = current.parent;
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
    const borderMesh = this.borders.get(nodeId);
    if (!borderMesh) return;

    const nodeOpts = borderMesh.userData.nodeOptions as INodeOptions | undefined;
    const decorOpts = borderMesh.userData.decorationOptions as Partial<IRectOptions> | undefined;
    const nodeWidth = borderMesh.userData.nodeWidth as number;
    const nodeHeight = borderMesh.userData.nodeHeight as number;

    // Defaults
    let baseBorderColor: string = Theme.colors.foreground.grayTertiary; // Explicitly typed as string
    let baseBorderWidth = 1; // Default border width

    // 1. Apply NodeOptions
    if (nodeOpts) {
      baseBorderColor = nodeOpts.borderColor || baseBorderColor;
      // INodeOptions does not have borderWidth, so we don't source it from nodeOpts directly for width.
      // Border width default is 1, overridden by decoration, then by selection state.
    }

    // 2. Apply Decorations (override NodeOptions for color, set width if defined)
    if (decorOpts) {
      if (decorOpts.borderColor) {
        baseBorderColor = decorOpts.borderColor;
      }
      if (decorOpts.borderWidth !== undefined) {
        baseBorderWidth = decorOpts.borderWidth;
      }
    }

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

    const materialKey = `${finalBorderColor}_border`;
    let material = this.materials.get(materialKey);

    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: finalBorderColor,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      this.materials.set(materialKey, material);
    }

    if (borderMesh.material !== material) {
      if (borderMesh.material instanceof THREE.MeshBasicMaterial) {
        const currentColor = borderMesh.material.color.getHexString();
        if (!this.materials.has(`#${currentColor}_border`)) {
          borderMesh.material.dispose();
        }
      } else if (borderMesh.material instanceof THREE.Material) {
        borderMesh.material.dispose();
      }
      borderMesh.material = material;
    }

    const oldBorderWidth = borderMesh.userData.currentBorderWidth as number;
    if (finalBorderWidth !== oldBorderWidth) {
      // Use geometry pool to avoid creating new geometries
      const geometryKey = `${nodeWidth}_${nodeHeight}_6_${finalBorderWidth}`;
      let geometry = this.geometries.get(geometryKey);

      if (!geometry) {
        geometry = this.rectManager.render(nodeWidth, nodeHeight, 6, finalBorderWidth);
        this.geometries.set(geometryKey, geometry);
      }

      const oldGeometryKey = `${nodeWidth}_${nodeHeight}_6_${oldBorderWidth}`;
      if (!this.geometries.has(oldGeometryKey)) {
        borderMesh.geometry.dispose();
      }

      borderMesh.geometry = geometry;
      borderMesh.userData.currentBorderWidth = finalBorderWidth;
    }
  }

  dispose(): void {
    this.materials.clear();
    for (const material of this.materials.values()) {
      material.dispose();
    }

    for (const geometry of this.geometries.values()) {
      geometry.dispose();
    }
    this.geometries.clear();

    this.clearNodes();

    this.textManager.dispose();
    this.rectManager.dispose();
    super.dispose();
  }
}
