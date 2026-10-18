import { Matrix3, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { BackgroundProjection } from './background-projection.js';

/** Sunlit water with patterns attached to horizontal sand and surface planes.
 * Its only movement comes from the shared background camera. */
export function lightOceanBackground() {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
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
      uniform float aspect, tangent;
      uniform mat3 rotation;
      uniform vec3 offset;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
          mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
      }
      float caustic(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        float first = 9.0, second = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 neighbour = vec2(float(x), float(y));
          vec2 jitter = vec2(hash(cell + neighbour), hash(cell + neighbour + 19.0));
          float distance = length(neighbour + jitter - f);
          second = min(second, max(first, distance));
          first = min(first, distance);
        }
        return 1.0 - smoothstep(0.025, 0.12, second - first);
      }
      void main() {
        vec3 direction = normalize(rotation * vec3(
          screen.x * aspect * tangent, screen.y * tangent, -1.0));
        // Keep the camera between the planes even after long map pans.
        vec3 origin = vec3(offset.x * 2.0, clamp(offset.y, -0.3, 0.3), offset.z * 2.0);
        vec3 water = mix(vec3(0.61, 0.84, 0.86), vec3(0.78, 0.94, 0.93),
          smoothstep(-0.6, 0.6, direction.y));
        vec3 colour = water;
        if (direction.y < -0.001) {
          float distance = (-1.35 - origin.y) / direction.y;
          vec2 sand = (origin + direction * distance).xz;
          float grain = noise(sand * 95.0);
          float ripple = sin(sand.x * 9.0 + sin(sand.y * 1.7) * 1.5) * 0.5 + 0.5;
          vec3 bed = vec3(0.87, 0.81, 0.65) + (grain - 0.5) * 0.035
            + (ripple - 0.5) * 0.025;
          vec2 wave = sand * 2.2 + vec2(sin(sand.y * 1.5), sin(sand.x * 1.3)) * 0.18;
          bed = mix(bed, vec3(0.99, 0.97, 0.80), caustic(wave) * 0.29);
          colour = mix(water, bed, exp(-distance * 0.065));
        } else if (direction.y > 0.001) {
          float distance = (1.15 - origin.y) / direction.y;
          vec2 surface = (origin + direction * distance).xz;
          float waves = noise(surface * 2.0) * 0.65 + noise(surface * 5.0 + 11.0) * 0.35;
          float lines = caustic(surface * 1.7 + vec2(waves));
          vec3 top = mix(vec3(0.54, 0.82, 0.86), vec3(0.84, 0.97, 0.96), waves);
          top = mix(top, vec3(0.96, 1.0, 0.99), lines * 0.27);
          colour = mix(water, top, exp(-distance * 0.075));
        }
        // Distributed sunlight through the water, with no converging source.
        float shafts = 0.0;
        for (int sampleIndex = 1; sampleIndex <= 3; sampleIndex++) {
          vec3 samplePoint = origin + direction * float(sampleIndex) * 1.6;
          float band = samplePoint.x * 6.0 + sin(samplePoint.z * 2.1) * 0.8;
          shafts += pow(0.5 + 0.5 * cos(band), 10.0) / 3.0;
        }
        float horizontal = 1.0 - smoothstep(0.06, 0.55, abs(direction.y));
        colour = mix(colour, vec3(0.91, 0.99, 0.95), shafts * horizontal * 0.12);
        // These reference colours are authored in display space.
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.visible = false;
  return {
    mesh,
    update({ rotation, offset, aspect, tangent }: BackgroundProjection) {
      material.uniforms.rotation.value = rotation;
      material.uniforms.offset.value = offset;
      material.uniforms.aspect.value = aspect;
      material.uniforms.tangent.value = tangent;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
