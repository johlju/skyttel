import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { defaultViewSettings, type ViewSettings } from '../shared/personal-view.js';
import type { BackgroundProjection } from './background-projection.js';
import { cosmicSky } from './cosmic-sky.js';
import { darkOceanBackground } from './dark-ocean-background.js';
import { lightOceanBackground } from './light-ocean-background.js';

/** Decorative graphics only. Extend theme choices here; camera navigation and
 * personal object placement remain owned by spatialScene. No animation loop. */
export function spaceBackground(pixelRatio: number) {
  const group = new Group();
  const cosmic = cosmicSky(pixelRatio);
  group.visible = false;
  let settings = defaultViewSettings;
  const renderCamera = new PerspectiveCamera();
  const stillCamera = new PerspectiveCamera();
  const resumeSource = new PerspectiveCamera();
  const resumeView = new PerspectiveCamera();
  const resumeRotation = new Quaternion();
  let reducedMotion = false;
  let hasFrame = false;
  let frozen = false;
  let rebased = false;
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
    uniforms: { pixelRatio: { value: pixelRatio } },
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
  group.add(stars);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      variant: { value: 0 },
      dark: { value: 0 },
      aspect: { value: 1 },
      tangent: { value: 0.4142 },
      rotation: { value: new Matrix3() },
      offset: { value: new Vector3() },
    },
    vertexShader: `
      varying vec2 screen;
      void main() {
        screen = uv * 2.0 - 1.0;
        gl_Position = vec4(position.xy, 0.999, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 screen;
      uniform float variant;
      uniform float dark;
      uniform float aspect;
      uniform float tangent;
      uniform mat3 rotation;
      uniform vec3 offset;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        return noise(p) * 0.57 + noise(p * 2.03 + 9.2) * 0.28
          + noise(p * 4.09 + 21.7) * 0.15;
      }
      void main() {
        vec3 d = normalize(rotation * vec3(screen.x * aspect * tangent,
          screen.y * tangent, -1.0));
        // View the distant field from the translated camera, including A's
        // broad light fields. Moving only noise coordinates leaves A fixed.
        d = normalize(d + offset);
        vec3 p = d * 2.4 + offset;
        vec3 colour;
        if (variant < 0.5) {
          // A: only broad overlapping atmospheric light, with no fine texture.
          float a = pow(max(0.0, dot(d, normalize(vec3(-0.8,0.5,-0.9)))), 3.0);
          float b = pow(max(0.0, dot(d, normalize(vec3(0.9,-0.4,-0.5)))), 4.0);
          float c = pow(max(0.0, dot(d, normalize(vec3(0.1,0.9,-0.3)))), 5.0);
          vec3 light = mix(vec3(0.91,0.94,0.94), vec3(0.73,0.86,0.85), a * 0.72);
          light = mix(light, vec3(0.98,0.90,0.80), b * 0.65);
          light = mix(light, vec3(0.85,0.86,0.95), c * 0.5);
          vec3 night = vec3(0.035,0.067,0.12) + a * vec3(0.04,0.12,0.14)
            + b * vec3(0.07,0.04,0.12) + c * vec3(0.025,0.045,0.08);
          colour = mix(light, night, dark);
        } else if (variant < 1.5) {
          // B: a volume of cloud banks, with a finer irregular dust ribbon.
          float cloud = fbm(p * 1.25 + vec3(8.0,2.0,5.0));
          float band = 1.0 - smoothstep(0.08,0.72,
            abs(d.y + d.x * 0.52 + 0.12 + (cloud - 0.5) * 0.8));
          float wisps = fbm(p * vec3(3.0,9.0,3.0) + cloud * 2.0);
          float mist = smoothstep(0.22,0.8,cloud) * band;
          vec3 light = mix(vec3(0.93,0.95,0.96), vec3(0.72,0.83,0.88), mist * 0.9);
          light = mix(light, vec3(0.82,0.78,0.92), band * wisps * 0.25);
          light += vec3(0.045,0.043,0.03) * band * smoothstep(0.5,0.75,wisps);
          vec3 night = vec3(0.025,0.045,0.09);
          night += vec3(0.06,0.16,0.19) * mist;
          night += vec3(0.12,0.065,0.19) * band * wisps * 0.65;
          colour = mix(light, night, dark);
        } else if (variant < 2.5) {
          // A-light: luminous pearl with warm edges, independently authored.
          float glow=pow(max(0.0,dot(d,normalize(vec3(-.6,.5,-1.)))),2.);
          float warmth=pow(max(0.0,dot(d,normalize(vec3(.9,-.6,-.7)))),3.);
          colour=mix(vec3(.88,.89,.94),vec3(.995,.99,.96),glow*.95);
          colour=mix(colour,vec3(.96,.81,.73),warmth*.55);
        } else {
          // Daylight through blue and rose cloud banks with bright openings.
          float cloud=fbm(p*1.8+vec3(8.,2.,5.));
          float opening=smoothstep(.30,.65,cloud);
          float band=.5+.5*sin(d.y*3.+d.x*2.+cloud*2.);
          colour=mix(vec3(.72,.83,.93),vec3(.98,.98,.99),opening);
          colour=mix(colour,vec3(.92,.78,.84),band*(1.-opening)*.35);
        }
        // Colours above are authored in display space.
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  });
  const projection: BackgroundProjection = {
    rotation: material.uniforms.rotation.value,
    offset: material.uniforms.offset.value,
    aspect: material.uniforms.aspect.value,
    tangent: material.uniforms.tangent.value,
  };
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.visible = false;
  const ocean = lightOceanBackground();
  const deepOcean = darkOceanBackground();
  group.add(mesh, cosmic.group, ocean.mesh, deepOcean.mesh);

  return {
    group,
    configure(value: ViewSettings, theme: 'light' | 'dark', reduce = false) {
      settings = value;
      reducedMotion = reduce;
      group.visible = value.background;
      ocean.mesh.visible = theme === 'light' && value.lightBackground === 'ocean';
      const universe = theme === 'dark' && value.darkBackground === 'universe';
      deepOcean.mesh.visible = theme === 'dark' && value.darkBackground === 'ocean';
      mesh.visible = !ocean.mesh.visible && !deepOcean.mesh.visible && !universe;
      cosmic.configure(universe);
      stars.visible = theme === 'dark' && value.darkBackground === 'mist';
      material.uniforms.variant.value =
        theme === 'light'
          ? value.lightBackground === 'dawn'
            ? 3
            : 2
          : value.darkBackground === 'mist'
            ? 1
            : 0;
      material.uniforms.dark.value = theme === 'dark' ? 1 : 0;
    },
    update(camera: PerspectiveCamera) {
      // Freeze the displayed pose, including every decorative layer. Resume
      // from that pose with only subsequent camera changes, never paused ones.
      if (reducedMotion && !frozen && hasFrame) stillCamera.copy(renderCamera);
      if (!reducedMotion && frozen) {
        resumeSource.copy(camera);
        resumeView.copy(stillCamera);
        resumeRotation.copy(resumeView.quaternion).multiply(camera.quaternion.clone().invert());
        rebased = true;
      }
      if (!reducedMotion || !hasFrame) {
        renderCamera.copy(camera);
        const panGain = settings.panStrength * settings.layerDistance;
        const zoomGain = settings.zoomStrength * 0.2;
        if (rebased) {
          // Preserve the exact frozen orientation when no new rotation occurs.
          if (camera.quaternion.equals(resumeSource.quaternion))
            renderCamera.quaternion.copy(resumeView.quaternion);
          else renderCamera.quaternion.premultiply(resumeRotation);
          renderCamera.position
            .sub(resumeSource.position)
            .applyQuaternion(resumeRotation)
            .multiplyScalar(panGain)
            .add(resumeView.position);
          renderCamera.fov = resumeView.fov * (camera.fov / resumeSource.fov) ** zoomGain;
        } else {
          renderCamera.position.multiplyScalar(panGain);
          renderCamera.fov = 45 * (camera.fov / 45) ** zoomGain;
        }
        renderCamera.position.clampLength(0, 280);
        renderCamera.fov = Math.max(15, Math.min(110, renderCamera.fov));
        if (reducedMotion) stillCamera.copy(renderCamera);
      } else renderCamera.copy(stillCamera);
      frozen = reducedMotion;
      hasFrame = true;
      renderCamera.aspect = camera.aspect;
      renderCamera.updateProjectionMatrix();
      renderCamera.updateMatrixWorld();
      material.uniforms.rotation.value.setFromMatrix4(renderCamera.matrixWorld);
      material.uniforms.offset.value.copy(renderCamera.position).multiplyScalar(0.0015);
      material.uniforms.aspect.value = renderCamera.aspect;
      material.uniforms.tangent.value = Math.tan((renderCamera.fov * Math.PI) / 360);
      projection.aspect = material.uniforms.aspect.value;
      projection.tangent = material.uniforms.tangent.value;
      ocean.update(projection);
      cosmic.update(renderCamera, material.uniforms.rotation.value, material.uniforms.offset.value);
      deepOcean.update(projection);
      return renderCamera;
    },
    reset() {
      if (!reducedMotion) rebased = false;
    },
    needsReset() {
      return !reducedMotion && rebased;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      ocean.dispose();
      cosmic.dispose();
      deepOcean.dispose();
    },
  };
}
