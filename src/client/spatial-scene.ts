import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PersonalPosition, Position, ViewSettings } from '../shared/personal-view.js';
import { cameraGestures } from './spatial-navigation.js';

export type ProjectedPoint = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  scale: number;
  /** Positive camera distance: paint farther symbols before nearer ones. */
  depth: number;
};

/** Owns only graphics and the camera. Household content stays in the shared editor. */
export function spatialScene(
  canvas: HTMLCanvasElement,
  onProject: (points: ProjectedPoint[]) => void,
  onOrientation: (axes: Position[]) => void = () => {},
  onMotion: () => void = () => {},
  surface: HTMLElement = canvas,
) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const sky = new Scene();
  sky.background = new Color('#132e25');
  const skyCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
  const camera = new PerspectiveCamera(45, 1, 0.1, 500000);
  renderer.autoClear = false;
  const controls = new OrbitControls(camera, canvas);
  // Pointer transitions and independent pan directions belong to our gesture
  // adapter; Three retains camera projection and public orbit mathematics.
  controls.disconnect();
  let settings: Pick<ViewSettings, 'invertX' | 'invertY'> = { invertX: false, invertY: false };
  const gestures = cameraGestures(
    canvas,
    {
      rotate(x, y) {
        controls.rotateLeft(x);
        controls.rotateUp(y);
        controls.update();
        onMotion();
      },
      pan(x, y) {
        controls.pan(x * (settings.invertX ? -1 : 1), y * (settings.invertY ? -1 : 1));
        controls.update();
        onMotion();
      },
      zoom(factor) {
        controls.dollyIn(factor);
        controls.update();
        onMotion();
      },
    },
    surface,
  );
  controls.enableDamping = false;
  controls.minDistance = 2;
  controls.maxDistance = 100000;
  const nodes = new Set<string>();
  const locations = new Map<string, Vector3>();
  const defaults = new Map<string, Vector3>();
  const starGeometry = new BufferGeometry();
  const starVertices = [];
  const starColours = [];
  const starSizes = [];
  const starOpacity = [];
  let seed = 83127;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 3600; index += 1) {
    const height = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - height * height);
    starVertices.push(Math.cos(angle) * radius * 300, height * 300, Math.sin(angle) * radius * 300);
    starSizes.push(0.25 + random() ** 4 * 1.35);
    starOpacity.push(0.2 + random() * 0.65);
    const tint = random();
    const colour = new Color(tint < 0.15 ? '#b6caff' : tint > 0.85 ? '#ead5b7' : '#e1e9f3');
    starColours.push(colour.r, colour.g, colour.b);
  }
  starGeometry.setAttribute('position', new Float32BufferAttribute(starVertices, 3));
  starGeometry.setAttribute('color', new Float32BufferAttribute(starColours, 3));
  starGeometry.setAttribute('radius', new Float32BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('opacity', new Float32BufferAttribute(starOpacity, 1));
  const starMaterial = new ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float radius;
      attribute float opacity;
      uniform float pixelRatio;
      varying vec3 tint;
      varying float brightness;
      varying float extent;
      void main() {
        tint = color;
        brightness = opacity;
        extent = radius > 1.15 ? 3.0 : 1.0;
        gl_PointSize = radius * 2.0 * extent * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      varying float brightness;
      varying float extent;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0 * extent;
        float alpha = 1.0 - smoothstep(0.55, 1.0, radius);
        if (extent > 1.0) alpha += 0.16 * pow(max(0.0, 1.0 - radius / 3.0), 2.0);
        gl_FragColor = vec4(tint, alpha * brightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const stars = new Points(starGeometry, starMaterial);
  stars.visible = false;
  sky.add(stars);
  let lost = false;
  let needsFrame = true;
  let overviewDistance = 30;
  function draw() {
    if (lost) return;
    camera.updateMatrixWorld();
    // The distant sky uses orientation and zoom only, so neither camera
    // translation nor object placement gives it parallax or domain meaning.
    skyCamera.quaternion.copy(camera.quaternion);
    skyCamera.aspect = camera.aspect;
    skyCamera.fov = Math.max(15, Math.min(110, 45 * Math.sqrt(controls.getDistance() / 30)));
    skyCamera.updateProjectionMatrix();
    renderer.clear();
    renderer.render(sky, skyCamera);
    onOrientation(
      [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((axis) =>
        axis.applyQuaternion(camera.quaternion.clone().invert()),
      ),
    );
    onProject(
      [...nodes].map((id) => {
        const position = locations.get(id) as Vector3;
        const point = position.clone().project(camera);
        const depth = -position.clone().applyMatrix4(camera.matrixWorldInverse).z;
        return {
          id,
          x: ((point.x + 1) * canvas.clientWidth) / 2,
          y: ((1 - point.y) * canvas.clientHeight) / 2,
          visible: point.z > -1 && point.z < 1,
          scale: Math.max(0.7, Math.min(1.3, overviewDistance / Math.max(depth, 0.1))),
          depth,
        };
      }),
    );
  }
  function reset() {
    const center = new Vector3();
    for (const id of nodes) center.add(locations.get(id) as Vector3);
    if (nodes.size) center.divideScalar(nodes.size);
    const extent = Math.max(
      5,
      ...[...nodes].map((id) => (locations.get(id) as Vector3).distanceTo(center) + 2),
    );
    controls.target.copy(center);
    overviewDistance = (extent * 2.6) / Math.min(camera.aspect, 1);
    camera.position
      .copy(center)
      .add(
        new Vector3(
          Math.sin(0.35) * Math.cos(0.16),
          Math.sin(0.16),
          Math.cos(0.35) * Math.cos(0.16),
        ).multiplyScalar(overviewDistance),
      );
    controls.update();
    draw();
  }
  controls.addEventListener('change', draw);
  const resize = new ResizeObserver(() => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (needsFrame) {
      needsFrame = false;
      reset();
    } else draw();
  });
  resize.observe(canvas);
  reset();
  return {
    update(
      ids: string[],
      saved: PersonalPosition[] = [],
      relationships: { sourceId: string; targetId: string | null }[] = [],
    ) {
      const first = locations.size === 0;
      const neighbours = new Map<string, Set<string>>();
      for (const { sourceId, targetId } of relationships) {
        if (!targetId || sourceId === targetId) continue;
        for (const [a, b] of [
          [sourceId, targetId],
          [targetId, sourceId],
        ]) {
          if (!neighbours.has(a)) neighbours.set(a, new Set());
          neighbours.get(a)?.add(b);
        }
      }
      // Saved personal placements are anchors, including when a related object
      // is currently filtered out. Existing locations never enter the layout.
      // Refresh also discards optimistic moves that were never saved.
      for (const [id, position] of defaults) locations.set(id, position.clone());
      for (const position of saved) {
        const value = new Vector3(position.x, position.y, position.z);
        locations.set(position.id, value);
        if (!defaults.has(position.id)) defaults.set(position.id, value.clone());
      }
      const pending = ids
        .filter((id) => !locations.has(id))
        .sort(
          (a, b) =>
            (neighbours.get(b)?.size ?? 0) - (neighbours.get(a)?.size ?? 0) || a.localeCompare(b),
        );
      while (pending.length) {
        const connected = pending.findIndex((id) =>
          [...(neighbours.get(id) ?? [])].some((other) => locations.has(other)),
        );
        const [id] = pending.splice(Math.max(0, connected), 1);
        const anchors = [...(neighbours.get(id) ?? [])]
          .sort()
          .flatMap((other) => (locations.has(other) ? [locations.get(other) as Vector3] : []));
        const center = new Vector3();
        for (const anchor of anchors) center.add(anchor);
        if (anchors.length) center.divideScalar(anchors.length);
        if (anchors.length && anchors.every((anchor) => anchor.distanceTo(center) > 7))
          center.copy(
            anchors.reduce((nearest, anchor) =>
              anchor.distanceTo(center) < nearest.distanceTo(center) ? anchor : nearest,
            ),
          );
        let hash = 0;
        for (const letter of id) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
        let candidate = new Vector3();
        let hasSpace = false;
        for (let attempt = 0; attempt < 96; attempt += 1) {
          const angle = ((hash % 360) * Math.PI) / 180 + attempt * 2.399963;
          const radius =
            (anchors.length ? 7 : 7 + Math.sqrt(locations.size) * 5) + Math.floor(attempt / 16) * 3;
          candidate = new Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius * 0.8,
            Math.sin(angle * 1.7 + (hash % 13)) * radius * 0.65,
          ).add(center);
          if (
            [...locations.values()].every(
              (position) =>
                Math.hypot(candidate.x - position.x, candidate.y - position.y) >= 5 &&
                candidate.distanceTo(position) >= 6,
            )
          ) {
            hasSpace = true;
            break;
          }
        }
        if (!hasSpace) {
          const bounds = new Box3().setFromPoints([...locations.values()]).expandByScalar(7);
          candidate = [
            new Vector3(bounds.min.x, center.y, center.z),
            new Vector3(bounds.max.x, center.y, center.z),
            new Vector3(center.x, bounds.min.y, center.z),
            new Vector3(center.x, bounds.max.y, center.z),
          ].reduce((nearest, point) =>
            point.distanceTo(center) < nearest.distanceTo(center) ? point : nearest,
          );
        }
        locations.set(id, candidate);
        defaults.set(id, candidate.clone());
      }
      for (const id of ids) {
        nodes.add(id);
      }
      for (const id of nodes)
        if (!ids.includes(id)) {
          nodes.delete(id);
        }
      if (first) reset();
      else draw();
    },
    reset,
    openLabelView() {
      if (!canvas.clientWidth || !canvas.clientHeight) return false;
      const bounds = new Box3().setFromPoints([...nodes].map((id) => locations.get(id) as Vector3));
      if (bounds.isEmpty()) return false;
      const center = bounds.getCenter(new Vector3());
      const extent = Math.max(
        5,
        ...[...nodes].map((id) => (locations.get(id) as Vector3).distanceTo(center) + 2),
      );
      const panelScale = Math.max(1, 830 / canvas.clientWidth, 540 / canvas.clientHeight);
      const distance = Math.max(2, (extent * 1.6) / Math.min(camera.aspect, 1) / panelScale);
      if (controls.getDistance() <= distance + 0.001) return false;
      controls.dollyIn(distance / controls.getDistance());
      controls.update();
      onMotion();
      return true;
    },
    reveal(ids: string[]) {
      const values = ids.flatMap((id) =>
        nodes.has(id) && locations.has(id) ? [locations.get(id) as Vector3] : [],
      );
      if (!values.length) return false;
      if (!canvas.clientWidth || !canvas.clientHeight) return false;
      needsFrame = false;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      const center = new Box3().setFromPoints(values).getCenter(new Vector3());
      const extent = Math.max(5, ...values.map((point) => point.distanceTo(center) + 2));
      const direction = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(direction.multiplyScalar((extent * 2.6) / Math.min(camera.aspect, 1)));
      controls.update();
      draw();
      onMotion();
      return true;
    },
    configure(value: ViewSettings) {
      settings = value;
      stars.visible = value.stars;
      sky.background = new Color(value.stars ? '#09121f' : '#132e25');
      draw();
    },
    beginCameraGesture: gestures.beginTouch,
    position(id: string): Position | null {
      const value = locations.get(id);
      return value ? { x: value.x, y: value.y, z: value.z } : null;
    },
    place(id: string, position: Position) {
      const value = new Vector3(position.x, position.y, position.z).clampScalar(-10000, 10000);
      locations.set(id, value);
      draw();
      onMotion();
      return { x: value.x, y: value.y, z: value.z };
    },
    displacement(position: Position, dx: number, dy: number, height: boolean): Position {
      const distance = new Vector3(position.x, position.y, position.z).distanceTo(camera.position);
      const scale =
        (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(canvas.clientHeight, 1);
      const movement = height
        ? new Vector3(0, -dy * scale, 0)
        : new Vector3(dx * scale, -dy * scale, 0).applyQuaternion(camera.quaternion);
      return { x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z };
    },
    project(position: Position) {
      const point = new Vector3(position.x, position.y, position.z).project(camera);
      return {
        x: ((point.x + 1) * canvas.clientWidth) / 2,
        y: ((1 - point.y) * canvas.clientHeight) / 2,
      };
    },
    navigate(command: string) {
      if (command === 'left') controls.pan(50 * (settings.invertX ? -1 : 1), 0);
      if (command === 'right') controls.pan(-50 * (settings.invertX ? -1 : 1), 0);
      if (command === 'up') controls.pan(0, 50 * (settings.invertY ? -1 : 1));
      if (command === 'down') controls.pan(0, -50 * (settings.invertY ? -1 : 1));
      if (command === 'rotate-left') controls.rotateLeft(0.15);
      if (command === 'rotate-right') controls.rotateLeft(-0.15);
      if (command === 'tilt-up') controls.rotateUp(0.15);
      if (command === 'tilt-down') controls.rotateUp(-0.15);
      if (command === 'in') controls.dollyIn(0.8);
      if (command === 'out') controls.dollyOut(0.8);
      controls.update();
      draw();
      onMotion();
    },
    contextLost(value: boolean) {
      lost = value;
      gestures.enabled(!value);
      controls.enabled = !value;
      if (!value) draw();
    },
    dispose() {
      resize.disconnect();
      controls.dispose();
      gestures.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
    },
  };
}
