/** Decorative universe with a quiet centre and illustrated astronomical motifs.
 * Uses the shared background camera; no animation or independent motion state. */
import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  type PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';

export function cosmicSky(pixelRatio: number) {
  const group = new Group();
  const initialRotation = new Euler(-0.16, 0.35, 0);
  // x/y are directions in the first camera's field, not household coordinates.
  // A quiet central region lets the household map remain the visual subject.
  const placements = [
    [-0.63, 0.39, 0.135, 0.62, 0.5, 0], // spiral
    [0.75, 0.33, 0.117, 0.2, -0.4, 1], // edge-on disk
    [0.69, -0.43, 0.078, 0.82, 0.7, 2], // elliptical
    [-0.75, -0.33, 0.182, 0.85, 0.3, 3], // cloud and dust
    [0.15, 0.6, 0.062, 1.0, 0.0, 4], // compact cluster
    [-0.27, -0.67, 0.072, 0.8, 0.3, 5], // ring/filament accent
    [2.8, -0.1, 0.14, 0.62, 0.9, 0],
    [-2.5, 1.65, 0.13, 0.8, -0.5, 2],
    [0.4, -2.7, 0.12, 0.23, 0.6, 1],
    [-0.5, 2.8, 0.3, 0.9, -0.2, 3],
    [2.0, 2.0, 0.09, 0.8, 0.0, 4],
    [-2.4, -2.2, 0.1, 0.7, -0.7, 5],
  ];
  const directions = placements.map(([x, y]) =>
    new Vector3(x, y, -1).normalize().applyEuler(initialRotation),
  );
  const shapes = placements.map(
    ([, , radius, squash, turn, kind]) => new Vector4(radius, squash, turn, kind),
  );
  // Continue around the back of the sky: rotation must reveal more than a poster.
  for (let index = 0; index < 6; index++) {
    directions.push(
      new Vector3(Math.sin(index * 2.4), Math.cos(index * 1.7) * 0.75, 1).normalize(),
    );
    shapes.push(
      new Vector4(index % 3 === 0 ? 0.22 : 0.12, index % 3 === 1 ? 0.25 : 0.7, index, index % 6),
    );
  }
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      aspect: { value: 1 },
      tangent: { value: 0.4142 },
      rotation: { value: new Matrix3() },
      offset: { value: new Vector3() },
      centres: { value: directions },
      shapes: { value: shapes },
    },
    vertexShader: `
      varying vec2 screen;
      void main() { screen = uv * 2.0 - 1.0; gl_Position = vec4(position.xy, 0.999, 1.0); }
    `,
    fragmentShader: `
      varying vec2 screen;
      uniform float aspect, tangent;
      uniform mat3 rotation;
      uniform vec3 offset;
      uniform vec3 centres[18];
      uniform vec4 shapes[18];
      float hash(vec3 p) {
        p = fract(p * .3183099 + vec3(.1,.2,.3)); p *= 17.;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
      }
      float noise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
          mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
          mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float mist(vec3 p) { return noise(p)*.65 + noise(p*2.1+7.)*.25 + noise(p*4.3+19.)*.1; }
      void main() {
        vec3 d=normalize(rotation*vec3(screen.x*aspect*tangent,screen.y*tangent,-1.));
        d=normalize(d+offset);
        float cloud=mist(d*3.+offset);
        vec3 colour=vec3(.012,.023,.052) + cloud*vec3(.007,.012,.02);
        for(int i=0;i<18;i++) {
          vec3 c=centres[i]; vec4 shape=shapes[i];
          float facing=dot(d,c); if(facing<.7) continue;
          vec3 right=normalize(cross(vec3(0,1,0),c)), up=cross(c,right);
          vec2 q=vec2(dot(d,right),dot(d,up))/max(.1,facing);
          float co=cos(shape.z), si=sin(shape.z);
          q=mat2(co,-si,si,co)*q/shape.x;
          q.y/=shape.y;
          float r=length(q); if(r>3.3) continue;
          float kind=shape.w, strength=i>5 ? .35 : 1.;
          float n=mist(vec3(q*3.,float(i)*7.));
          vec3 hue=vec3(.24,.40,.68); float alpha=0.; float core=0.;
          if(kind<.5) {
            // An inclined spiral disk with a warm bulge and fragmented blue arms.
            float angle=atan(q.y,q.x);
            float arms=pow(.5+.5*cos(angle*2.0-r*7.5+n*1.7),5.);
            float disk=exp(-r*1.7);
            alpha=disk*(.25+arms*.9)*( .65+n*.5);
            core=exp(-r*r*20.);
            hue=mix(vec3(.20,.38,.68),vec3(.92,.71,.40),exp(-r*3.));
          } else if(kind<1.5) {
            float disk=exp(-r*1.8);
            float dust=exp(-q.y*q.y*60.)*smoothstep(.1,.5,abs(q.x));
            alpha=disk*.85*(1.-dust*.8);
            core=exp(-dot(q*vec2(1.,.5),q*vec2(1.,.5))*15.);
            hue=mix(vec3(.36,.46,.65),vec3(.92,.71,.43),exp(-r*2.));
          } else if(kind<2.5) {
            alpha=exp(-r*2.7)*.65;
            core=exp(-r*r*28.)*.65; hue=vec3(.85,.66,.39);
          } else if(kind<3.5) {
            float envelope=exp(-r*r*.65);
            float filament=smoothstep(.35,.70,n);
            alpha=envelope*filament*.65;
            hue=mix(vec3(.16,.46,.57),vec3(.62,.28,.48),smoothstep(-1.,1.,q.x));
            float dust=envelope*smoothstep(.46,.65,mist(vec3(q*vec2(4.,1.4),19.)))*.25;
            colour=mix(colour,vec3(.006,.012,.028),dust*strength);
          } else if(kind<4.5) {
            float dense=exp(-r*r*2.4);
            float grains=pow(noise(vec3(q*65.,31.)),18.);
            alpha=dense*.28+grains*dense*2.;
            core=dense*.2; hue=vec3(.72,.78,.94);
          } else {
            float ring=exp(-pow((r-.72)*12.,2.));
            alpha=ring*(.15+n*.65)*.55;
            hue=mix(vec3(.19,.52,.63),vec3(.7,.35,.34),n); core=exp(-r*r*200.)*.3;
          }
          alpha=clamp(alpha*strength,0.,.85);
          colour=mix(colour,hue,alpha*.68);
          colour=mix(colour,vec3(1.,.88,.64),clamp(core*strength*.8,0.,.85));
        }
        gl_FragColor=vec4(colour,1.);
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  group.add(mesh);

  const positions: number[] = [],
    colours: number[] = [],
    radii: number[] = [],
    opacity: number[] = [];
  let seed = 741937;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 14000; index++) {
    const height = random() * 2 - 1,
      angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - height * height);
    positions.push(Math.cos(angle) * radius * 300, height * 300, Math.sin(angle) * radius * 300);
    radii.push(0.3 + random() ** 7 * 2.0);
    opacity.push(0.12 + random() ** 2 * 0.7);
    const tint = random();
    const colour = new Color(tint < 0.3 ? '#b8d6ff' : tint > 0.8 ? '#ffe2b1' : '#ebf1ff');
    colours.push(colour.r, colour.g, colour.b);
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  starGeometry.setAttribute('radius', new Float32BufferAttribute(radii, 1));
  starGeometry.setAttribute('opacity', new Float32BufferAttribute(opacity, 1));
  const starMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: {
      pixelRatio: { value: pixelRatio },
      dustDirection: { value: directions[3] },
      dustRadius: { value: shapes[3].x },
    },
    vertexShader: `
      attribute float radius, opacity;
      uniform float pixelRatio;
      uniform vec3 dustDirection;
      uniform float dustRadius;
      varying vec3 tint;
      varying float brightness, extent;
      void main(){tint=color;
        float dust=smoothstep(cos(dustRadius*1.7),1.,dot(normalize(position),dustDirection));
        brightness=opacity*(1.-dust*.65); extent=radius>1.4?3.:1.;
        gl_PointSize=radius*2.*extent*pixelRatio;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader: `
      varying vec3 tint;
      varying float brightness, extent;
      void main(){float r=length(gl_PointCoord-.5)*2.*extent;
        float core=1.-smoothstep(.4,1.,r);
        float halo=extent>1.? .18*pow(max(0.,1.-r/3.),2.):0.;
        gl_FragColor=vec4(tint,(core+halo)*brightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const stars = new Points(starGeometry, starMaterial);
  group.add(stars);
  group.visible = false;
  return {
    group,
    configure(active: boolean) {
      group.visible = active;
    },
    update(camera: PerspectiveCamera, rotation: Matrix3, offset: Vector3) {
      material.uniforms.rotation.value.copy(rotation);
      material.uniforms.offset.value.copy(offset);
      material.uniforms.aspect.value = camera.aspect;
      material.uniforms.tangent.value = Math.tan((camera.fov * Math.PI) / 360);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
