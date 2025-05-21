import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import type { INodeOptions } from '$lib/ui/node';
import { Theme } from '$lib/ui';
import WebGLRect from './rect';
import WebGLText from './text';
import WebGLExpandedModule from './expanded-module';
import { DisplayObject, Container } from '$lib/scene';
import { TextDisplayObject } from '$lib/ui/text';
import { SceneManager } from './scene';
import ExpandedModuleManager from './expanded-module';
import { WebGLManager } from './webgl';

export class BadgeManager extends WebGLManager {
  private sceneManager: SceneManager;
  private badges: Map<NodeId, THREE.Group>;
  private materials: Map<string, THREE.MeshBasicMaterial>;

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
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
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    group.add(border);

    this.registerDisposable(circleGeometry, circleMaterial, borderGeometry, borderMaterial);

    if (text) {
      const textMesh = WebGLText.render(text, {
        fontSize: 12,
        foregroundColor: 'white',
        font: Theme.font.family,
        fontWeight: Theme.font.weight.bold,
      });
      textMesh.position.z = 0.1;
      this.registerDisposable(textMesh);

      group.add(textMesh);
    }

    group.position.copy(position);
    group.userData.nodeId = nodeId;
    this.badges.set(nodeId, group);
    this.sceneManager.scene.add(group);

    return group;
  }

  dispose(): void {
    for (const badge of this.badges.values()) {
      this.sceneManager.scene.remove(badge);
      badge.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });
    }
    this.badges.clear();

    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    super.dispose();
  }
}

export class NodeManager extends WebGLManager {
  private sceneManager: SceneManager;
  private expandedModuleManager: ExpandedModuleManager;
  private badgeManager: BadgeManager;
  private materials: Map<string, THREE.MeshBasicMaterial>;
  private meshes: Map<NodeId, THREE.Mesh>;
  private borders: Map<NodeId, THREE.Mesh>;
  private contentGroups: Map<NodeId, THREE.Group>;
  private hoveredNodeId: NodeId | undefined;
  private selectedNodeIds: Set<NodeId>;

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
    this.expandedModuleManager = new ExpandedModuleManager(this.sceneManager);
    this.badgeManager = new BadgeManager(this.sceneManager);

    this.materials = new Map();
    this.meshes = new Map();
    this.borders = new Map();
    this.contentGroups = new Map();

    this.hoveredNodeId = undefined;
    this.selectedNodeIds = new Set();
  }

  get interactiveNodes(): THREE.Object3D[] {
    return [...this.meshes.values(), ...this.expandedModuleManager.expandedModules.values()];
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
        return moduleNestingLevels.get(nodeId)!;
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
      const moduleGroup = new WebGLExpandedModule(this.sceneManager).render(
        module.name,
        originalBB,
        zIndex,
      );
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

      const transformedCenterY = this.sceneManager.transformY(originalBB.center.y);

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
          transparent: true,
          opacity: 1,
        });
        this.materials.set(materialKey, material);
      }
      const bgGeometry = WebGLRect.render(originalBB.width, originalBB.height, 6);
      const bgMesh = new THREE.Mesh(bgGeometry, material);
      bgMesh.position.set(originalBB.center.x, transformedCenterY, 0);
      bgMesh.userData.nodeId = nodeId;

      // Create node border
      let initialBorderColor = entity.options.borderColor || Theme.colors.foreground.grayTertiary;
      let initialBorderWidth = 1; // Default border width

      if (decoration?.borderColor) {
        initialBorderColor = decoration.borderColor;
      }
      if (decoration?.borderWidth !== undefined) {
        initialBorderWidth = decoration.borderWidth;
      }

      const borderGeometry = WebGLRect.render(
        originalBB.width,
        originalBB.height,
        6,
        initialBorderWidth,
      );
      // For borders, we don't cache materials as they change with hover/selection frequently
      const borderMaterial = new THREE.MeshBasicMaterial({
        color: initialBorderColor,
        transparent: true,
        opacity: 1,
      });
      const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
      borderMesh.position.set(originalBB.center.x, transformedCenterY, 0.1);
      borderMesh.userData.nodeId = nodeId;
      borderMesh.userData.nodeOptions = entity.options;
      borderMesh.userData.decorationOptions = decoration;
      borderMesh.userData.nodeWidth = originalBB.width;
      borderMesh.userData.nodeHeight = originalBB.height;
      borderMesh.userData.currentBorderWidth = initialBorderWidth;

      // Create and position the group for all node content
      const contentGroup = new THREE.Group();
      // Position content group relative to node center, with proper Y transformation
      contentGroup.position.set(
        originalBB.center.x - originalBB.width / 2, // Start from left edge
        transformedCenterY + originalBB.height / 2, // Start from top edge
        0.2,
      );
      this.sceneManager.scene.add(contentGroup);
      this.contentGroups.set(nodeId, contentGroup);

      if (entity.content) {
        // Pass 0 as the relative Z since we're already positioned correctly
        this.renderDisplayObject(entity.content, contentGroup, nodeId, 0);
      }

      if (entity.options.badge) {
        const badgePosition = new THREE.Vector3(
          originalBB.xMax + 1,
          this.sceneManager.transformY(originalBB.yMin - 1),
          0.2,
        );
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
      const text = WebGLText.render(displayObject.text, displayObject.options);
      text.position.set(
        displayObjectPosX + displayObjectBB.width / 2,
        -displayObjectPosY - displayObjectBB.height / 2,
        currentRelativeZ,
      );
      parent.add(text);
    } else if (displayObject instanceof Container) {
      const containerGroup = new THREE.Group();
      containerGroup.position.set(displayObjectPosX, -displayObjectPosY, currentRelativeZ);
      parent.add(containerGroup);

      for (const child of displayObject.children) {
        this.renderDisplayObject(child, containerGroup, nodeId, currentRelativeZ + 0.001);
      }
    }
  }

  getNodeAtPoint(point: THREE.Vector2, camera: THREE.Camera): NodeId | undefined {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(point, camera);

    // Get all interactive objects
    const objects = this.interactiveNodes;

    // First do a bounding box check to filter objects
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    const visibleObjects = objects.filter((obj) => {
      const box = new THREE.Box3().setFromObject(obj);
      return frustum.intersectsBox(box);
    });

    // Then do precise raycasting only on visible objects
    const intersects = raycaster.intersectObjects(visibleObjects, true);
    if (intersects.length > 0) {
      // Find the first object with a nodeId in its userData
      const object = intersects[0].object;
      let current: THREE.Object3D | null = object;
      while (current) {
        if (current.userData.nodeId) {
          return current.userData.nodeId;
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

    let finalBorderColor: string = baseBorderColor; // Explicitly typed as string
    let finalBorderWidth = baseBorderWidth;

    if (isSelected) {
      finalBorderColor = Theme.colors.foreground.blue;
      finalBorderWidth = 3;
    } else if (isHovered) {
      finalBorderColor = Theme.colors.foreground.blue;
      // finalBorderWidth remains baseBorderWidth for hover
    }

    // Update material color
    if (borderMesh.material instanceof THREE.MeshBasicMaterial) {
      borderMesh.material.color.set(finalBorderColor);
    } else {
      // Fallback or create new material if type is wrong, though it should be MeshBasicMaterial
      const newMaterial = new THREE.MeshBasicMaterial({
        color: finalBorderColor,
        transparent: true,
        opacity: 1,
      });
      if (borderMesh.material instanceof THREE.Material) {
        borderMesh.material.dispose();
      }
      borderMesh.material = newMaterial;
    }

    // Update geometry if borderWidth has changed
    const oldGeomBorderWidth = borderMesh.userData.currentBorderWidth as number;
    if (finalBorderWidth !== oldGeomBorderWidth) {
      borderMesh.geometry.dispose();
      borderMesh.geometry = WebGLRect.render(nodeWidth, nodeHeight, 6, finalBorderWidth);
      borderMesh.userData.currentBorderWidth = finalBorderWidth;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.sceneManager.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material: THREE.Material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this.meshes.clear();

    for (const border of this.borders.values()) {
      this.sceneManager.scene.remove(border);
      border.geometry.dispose();
      if (Array.isArray(border.material)) {
        border.material.forEach((material: THREE.Material) => material.dispose());
      } else {
        border.material.dispose();
      }
    }
    this.borders.clear();

    for (const group of this.contentGroups.values()) {
      this.sceneManager.scene.remove(group);
      group.traverse((object) => {
        if (object instanceof Text) {
          object.dispose();
        } else if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach((material: THREE.Material) => material.dispose());
          }
        }
      });
    }
    this.contentGroups.clear();

    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    this.expandedModuleManager.dispose();
    this.badgeManager.dispose();
    super.dispose();
  }
}
