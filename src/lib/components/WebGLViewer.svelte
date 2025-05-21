<!--
  For licensing see accompanying LICENSE file.
  Copyright (C) 2025 Apple Inc. All Rights Reserved.
-->

<script lang="ts">
  import TooltipLayer from './TooltipLayer.svelte';
  import { Viewport } from '$lib/viewport';
  import { BoundingBox, type IPoint } from '$lib/geometry';
  import { createEventDispatcher, onMount, getContext } from 'svelte';
  import type { IEventDispatchBrush, IEventDispatchModule, IEventDispatchNode } from '$lib/events';
  import type { NodeId } from '$lib/network';
  import type { IDrawableNetwork } from '$lib/layout';
  import type { IRectOptions } from '$lib/ui';
  import * as THREE from 'three';
  import { CameraManager } from '$lib/webgl/camera';
  import { RendererManager } from '$lib/webgl/renderer';
  import { SceneManager } from '$lib/webgl/scene';
  import { viewerKey, type IViewerContext } from './stores';
  import { ZoomBehavior } from '$lib/zoom';
  import { tweened } from 'svelte/motion';
  import { cubicInOut } from 'svelte/easing';

  export let decorations: Map<NodeId, Partial<IRectOptions>>;
  export let drawable: IDrawableNetwork;
  export let viewport: Viewport;
  export let multiSelection: boolean;

  let canvas: HTMLCanvasElement;
  let cameraManager: CameraManager | undefined;
  let rendererManager: RendererManager;
  let sceneManager: SceneManager;
  let animationFrameId: number;

  type InitialState = { kind: 'initial' };
  type PanningState = { kind: 'panning'; start: IPoint; last: IPoint };
  type BrushingState = { kind: 'brushing'; start: IPoint; end: IPoint };
  type Interaction = InitialState | PanningState | BrushingState;

  let state: Interaction = { kind: 'initial' };
  let mouse = new THREE.Vector2();
  let isDragging = false;
  let hoveredNodeId: NodeId | undefined;
  let lastClickTime = 0;
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  const dispatch = createEventDispatcher<
    IEventDispatchNode & IEventDispatchModule & IEventDispatchBrush
  >();

  const { selections } = getContext<IViewerContext>(viewerKey);

  $: if (sceneManager) {
    sceneManager.selectNodes(new Set($selections.keys()));
  }

  $: viewportWorld = viewport.world();
  const zoom = new ZoomBehavior(viewport);

  $: zoom
    .setScaleExtent({
      min:
        Math.min(
          viewport.screenWidth() / drawable.boundingBox.width,
          viewport.screenHeight() / drawable.boundingBox.height,
        ) * 0.667,
      max: 1,
    })
    .setTranslationExtent(
      drawable.boundingBox.padded({
        l: viewportWorld.width * 0.4,
        r: viewportWorld.width * 0.4,
        t: viewportWorld.height * 0.4,
        b: viewportWorld.height * 0.4,
      }),
    );

  $: transform = viewport.worldToScreen();

  function deriveCursor(state: Interaction, isOverNode: boolean): string {
    if (isOverNode) return 'pointer';
    switch (state.kind) {
      case 'initial':
        return 'grab';
      case 'panning':
        return 'grabbing';
      case 'brushing':
        return 'default';
    }
  }

  $: cursor = deriveCursor(state, !!hoveredNodeId);

  function screenToWorld(x: number, y: number): IPoint {
    if (!cameraManager) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const normalizedX = ((x - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((y - rect.top) / rect.height) * 2 + 1;
    const worldPoint = new THREE.Vector3(normalizedX, normalizedY, 0);
    worldPoint.unproject(cameraManager.camera);
    return { x: worldPoint.x, y: worldPoint.y };
  }

  function handleMouseMove(event: MouseEvent) {
    if (!cameraManager) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Find if a node is currently being hovered
    const nodeId = sceneManager.getNodeAtPoint(mouse, cameraManager.camera);

    // Only update the hover state if it's a different node being hovered
    if (nodeId !== hoveredNodeId) {
      if (hoveredNodeId) {
        dispatch('nodeLeave', { nodeId: hoveredNodeId });
        sceneManager.hoverNode(undefined);
      }

      if (nodeId) {
        dispatch('nodeEnter', { nodeId });
        sceneManager.hoverNode(nodeId);
      }

      hoveredNodeId = nodeId;
    }

    if (!isDragging) return;

    switch (state.kind) {
      case 'initial':
        break;

      case 'panning': {
        const currentScreenX = event.clientX - rect.left;
        const currentScreenY = event.clientY - rect.top;

        const screenDeltaX = currentScreenX - state.last.x;
        const screenDeltaY = currentScreenY - state.last.y;

        const worldDeltaX = -screenDeltaX / viewport.scale();
        const worldDeltaY = screenDeltaY / viewport.scale();

        zoom.moveBy(worldDeltaX, worldDeltaY);

        state.last = { x: currentScreenX, y: currentScreenY };

        cameraManager.update();
        viewport = viewport; // Trigger Svelte reactivity
        transform = viewport.worldToScreen();
        break;
      }

      case 'brushing': {
        // Get end point for brushing in world coordinates
        const { x: endX, y: endY } = screenToWorld(event.clientX, event.clientY);
        state.end = { x: endX, y: endY };
        break;
      }
    }
  }

  function handleMouseDown(event: MouseEvent) {
    event.preventDefault();
    if (!('targetTouches' in event) && event.button !== 0) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (cameraManager) {
      // Check if we're clicking on a node first
      const nodeId = sceneManager.getNodeAtPoint(mouse, cameraManager.camera);
      if (nodeId) {
        const now = Date.now();
        const isDoubleClick = now - lastClickTime < DOUBLE_CLICK_THRESHOLD;
        lastClickTime = now;

        if (isDoubleClick) {
          const isExpanded = drawable.expanded.has(nodeId);
          if (isExpanded) {
            dispatch('collapse', { nodeId });
          } else {
            dispatch('expand', { nodeId });
          }
        } else {
          dispatch('nodeClick', { nodeId, original: event });
        }
      }
    }

    // If not clicking a node, handle as panning or brushing
    const screenXOnCanvas = event.clientX - rect.left;
    const screenYOnCanvas = event.clientY - rect.top;
    isDragging = true;

    if (event.shiftKey && multiSelection) {
      const { x, y } = screenToWorld(event.clientX, event.clientY);
      state = { kind: 'brushing', start: { x, y }, end: { x, y } };
    } else {
      state = {
        kind: 'panning',
        start: screenToWorld(event.clientX, event.clientY),
        last: { x: screenXOnCanvas, y: screenYOnCanvas },
      };
    }
  }

  function handleMouseUp(event: MouseEvent) {
    if (!isDragging) return;
    isDragging = false;

    switch (state.kind) {
      case 'brushing': {
        const bb = BoundingBox.fromPoints(state.start, state.end);
        const contained = [...drawable.nodes.entries()]
          .filter(([_, node]) => bb.encloses(node.boundingBox()))
          .map(([nodeId]) => nodeId);
        dispatch('brush', { nodes: contained });
        break;
      }

      case 'panning': {
        // If we didn't move much, treat it as a click
        const { x, y } = screenToWorld(event.clientX, event.clientY);
        const point = { x, y };
        const distance = Math.sqrt(
          Math.pow(point.x - state.start.x, 2) + Math.pow(point.y - state.start.y, 2),
        );

        if (distance < 5 && cameraManager) {
          // Small threshold for click detection
          const nodeId = sceneManager.getNodeAtPoint(mouse, cameraManager.camera);
          if (nodeId) {
            dispatch('nodeClick', { nodeId, original: event });
          }
        }
        break;
      }
    }
    state = { kind: 'initial' };
  }

  function handleMouseLeave() {
    // Clear hover state immediately when mouse leaves the canvas
    if (hoveredNodeId) {
      dispatch('nodeLeave', { nodeId: hoveredNodeId });
      sceneManager.hoverNode(undefined);
      hoveredNodeId = undefined;
    }

    isDragging = false;
    state = { kind: 'initial' };
  }

  function handleWheel(event: WheelEvent) {
    if (!cameraManager) return;

    event.preventDefault();

    // The following constants are taken from d3-zoom:
    // https://github.com/d3/d3-zoom/blob/95cd670cf2322b455eb6b04e95a5fb1fc963f269/src/zoom.js#L35
    const k = -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
    const scale = Math.pow(2, k);
    const oldScale = viewport.scale();
    zoom.scaleBy(scale);

    if (oldScale === viewport.scale()) {
      return; // Clamped
    }

    cameraManager.update();

    const mouse_world_under_cursor_after_scale = screenToWorld(event.clientX, event.clientY);
    const center_before_translate = viewport.center();

    zoom.moveBy(
      -(center_before_translate.x - mouse_world_under_cursor_after_scale.x) * k,
      -(center_before_translate.y - mouse_world_under_cursor_after_scale.y) * k,
    );

    cameraManager.update();

    viewport = viewport; // Trigger Svelte reactivity
    transform = viewport.worldToScreen();
  }

  function animate() {
    if (!cameraManager) return;
    animationFrameId = requestAnimationFrame(animate);
    rendererManager.render(sceneManager.scene, cameraManager.camera);
  }

  function setupNonPassiveEvents(element: HTMLElement) {
    const options: AddEventListenerOptions = { passive: false };

    const wheelHandler = (e: WheelEvent) => handleWheel(e);
    const touchHandler = (e: TouchEvent) => e.preventDefault();
    const dragStartHandler = (e: DragEvent) => e.preventDefault();

    element.addEventListener('wheel', wheelHandler as EventListener, options);
    element.addEventListener('touchstart', touchHandler as EventListener, options);
    element.addEventListener('touchmove', touchHandler as EventListener, options);
    element.addEventListener('dragstart', dragStartHandler as EventListener, options);

    return {
      destroy() {
        element.removeEventListener('wheel', wheelHandler as EventListener, options);
        element.removeEventListener('touchstart', touchHandler as EventListener, options);
        element.removeEventListener('touchmove', touchHandler as EventListener, options);
        element.removeEventListener('dragstart', dragStartHandler as EventListener, options);
      },
    };
  }

  onMount(() => {
    cameraManager = new CameraManager(viewport);
    rendererManager = new RendererManager(canvas, viewport);
    sceneManager = new SceneManager();

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (cameraManager) {
        cameraManager = undefined;
      }
      rendererManager.dispose();
      sceneManager.dispose();
    };
  });

  $: if (drawable && sceneManager) {
    sceneManager.updateNetwork(drawable, decorations);
  }

  $: if (viewport && cameraManager) {
    cameraManager.update();
  }

  export async function setFocus(boundingBox: Readonly<BoundingBox>, transition?: boolean) {
    if (!cameraManager) return;

    const bb = BoundingBox.fromCenterAndDimension(
      boundingBox.center,
      Math.max(viewport.screenWidth(), boundingBox.width),
      Math.max(viewport.screenHeight(), boundingBox.height),
    );

    const { x, y } = bb.center;
    const k =
      Math.min(
        viewport.screenWidth() / boundingBox.width,
        viewport.screenHeight() / boundingBox.height,
      ) || 1; // Scale of 0 is invalid

    if (transition !== undefined && transition) {
      const progress = tweened(
        { x: viewport.center().x, y: viewport.center().y, k: viewport.scale() },
        { duration: 1000, easing: cubicInOut },
      );
      progress.subscribe((c: { x: number; y: number; k: number }) => {
        zoom.moveTo(c.x, c.y);
        zoom.scaleTo(c.k);
        cameraManager?.update();
        viewport = viewport; // Ensure reactivity
        transform = viewport.worldToScreen();
      });
      await progress.set({ x, y, k });
    } else {
      zoom.moveTo(x, y);
      zoom.scaleTo(k);
      cameraManager.update();
      viewport = viewport; // Ensure reactivity
      transform = viewport.worldToScreen();
    }
  }
</script>

<svelte:window
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
/>

<canvas
  class="myc-webgl-canvas"
  bind:this={canvas}
  width={viewport.screenWidth()}
  height={viewport.screenHeight()}
  on:mousedown={handleMouseDown}
  use:setupNonPassiveEvents
  draggable="false"
  style="cursor: {cursor};"
/>

<svg
  class="myc-webgl-tooltip-layer"
  width={viewport.screenWidth()}
  height={viewport.screenHeight()}
>
  <g transform={transform.toString()}>
    <TooltipLayer nodeLayouts={drawable.nodes} on:nodeEnter on:nodeLeave />
  </g>
</svg>

<style>
  .myc-webgl-canvas {
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
    user-select: none;
  }

  .myc-webgl-tooltip-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 10;
  }

  .myc-webgl-tooltip-layer :global(.myc-tooltip) {
    pointer-events: auto;
  }
</style>
