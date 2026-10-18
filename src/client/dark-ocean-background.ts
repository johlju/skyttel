import {
  Euler,
  Matrix3,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import type { BackgroundProjection } from './background-projection.js';

/** The complete approved deep-water illustration. All six forms share the
 * background camera; there is no time uniform or independent movement. */
export function darkOceanBackground() {
  const geometry = new PlaneGeometry(2, 2);
  const initialInverse = new Matrix3()
    .setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(-0.16, 0.35, 0)))
    .transpose();
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      aspect: { value: 1 },
      tangent: { value: 0.4142 },
      rotation: { value: new Matrix3() },
      localOffset: { value: new Vector3() },
      wildlife: {
        value: [
          new Vector4(-0.55, 0.25, 0.07, -0.12),
          new Vector4(0.6, 0.2, 0.065, -0.18),
          new Vector4(-0.57, -0.1, 0.065, -0.12),
          new Vector4(0.58, -0.2, 0.065, 0.16),
          new Vector4(-0.4, -0.29, 0.06, -0.12),
          new Vector4(0.58, 0.0, 0.065, -0.08),
          new Vector4(1.7, 0.15, 0.08, 0.2),
          new Vector4(-2.2, 0.3, 0.08, -0.15),
          new Vector4(2.7, -0.2, 0.08, 0.2),
          new Vector4(-1.5, -0.4, 0.075, -0.1),
          new Vector4(2.1, 0.5, 0.08, 0.2),
          new Vector4(-2.9, -0.1, 0.07, -0.2),
        ],
      },
    },
    vertexShader: `
      varying vec2 screen;
      void main() { screen=uv*2.-1.; gl_Position=vec4(position.xy,.999,1.); }
    `,
    fragmentShader: `
      varying vec2 screen;
      uniform float aspect, tangent;
      uniform mat3 rotation;
      uniform vec3 localOffset;
      uniform vec4 wildlife[12];
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
          mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
      }
      float segment(vec2 p, vec2 a, vec2 b) {
        vec2 v=b-a;
        return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));
      }
      float pointGlow(vec2 p, float size) {
        return exp(-dot(p,p)/(size*size))+.12*exp(-dot(p,p)/(size*size*8.));
      }
      vec3 animalLight(vec2 p, int kind) {
        vec3 blue=vec3(.04,.55,.74), cyan=vec3(.035,.67,.66);
        vec3 light=vec3(0.);
        if(kind==0) {
          // Atolla-inspired alarm crown, frozen as one illustrative instant.
          float angle=atan(p.y,p.x), r=length(p);
          float scallop=.84+.055*cos(angle*12.);
          float crown=exp(-abs(r-scallop)*42.);
          float radial=pow(.5+.5*cos(angle*12.),18.)*exp(-pow((r-.66)*5.,2.));
          float tail=exp(-abs(p.x-.10*sin(p.y*3.))*65.)
            *(1.-smoothstep(-.85,-.65,p.y))*smoothstep(-3.0,-1.6,p.y);
          light=blue*(crown*.38+radial*.17+tail*.055);
        } else if(kind==1) {
          // A colony of separate zooid-like units with selective blue light.
          for(int j=0;j<10;j++) {
            float y=-1.8+float(j)*.40;
            float x=sin(y*1.5)*.30;
            vec2 pod=p-vec2(x,y);
            float body=exp(-dot(pod*vec2(3.8,5.),pod*vec2(3.8,5.)));
            float organ=pointGlow(pod-vec2(.07,.025),.065);
            float thread=exp(-abs(p.x-x-.18*sin(p.y*5.+float(j)))*80.)
              *(1.-smoothstep(y-.3,y,p.y))*smoothstep(y-.8,y-.3,p.y);
            light+=blue*(body*.045+organ*.22+thread*.012);
          }
        } else if(kind==2) {
          // Photophores stay attached to the belly and side of a faint fish.
          float body=exp(-pow(length(p/vec2(1.25,.42)),4.));
          float tail=(1.-smoothstep(.0,.10,abs(p.y)-(-p.x-1.)*.65))
            *smoothstep(-1.9,-1.7,p.x)*(1.-smoothstep(-1.05,-.95,p.x));
          light+=blue*(body*.024+tail*.018);
          for(int j=0;j<7;j++) {
            float x=-.86+float(j)*.28;
            light+=cyan*pointGlow(p-vec2(x,-.25+.07*x*x),.046)*.29;
            light+=blue*pointGlow(p-vec2(x,.03+.035*x*x),.036)*.18;
          }
        } else if(kind==3) {
          // Vampire-squid-like web, glowing arm tips and detached luminous fluid.
          float mantle=exp(-pow(length((p-vec2(0.,.55))/vec2(.48,.70)),4.));
          light+=blue*mantle*.025;
          for(int j=0;j<7;j++) {
            float angle=(float(j)-3.)*.32;
            vec2 tip=vec2(sin(angle)*1.2,-.6-cos(angle)*.7);
            float web=exp(-segment(p,vec2(0.,.20),tip)*65.);
            light+=blue*web*.028+cyan*pointGlow(p-tip,.060)*.32;
          }
          vec2 cloud=p-vec2(-1.55,-1.45);
          float fluid=exp(-dot(cloud/vec2(.55,.70),cloud/vec2(.55,.70))*2.);
          float specks=pow(noise(p*24.+31.),10.);
          light+=cyan*fluid*(.018+specks*.13);
        } else if(kind==4) {
          // Secreted courtship traces: a shallow-water reference, not marine snow.
          for(int row=0;row<3;row++) for(int j=0;j<7;j++) {
            float x=-1.25+float(j)*.39;
            float y=(float(row)-1.)*.47+sin(x*1.6+float(row))*.17;
            y+=(hash(vec2(float(j),float(row)))-.5)*.10;
            float size=.035+hash(vec2(float(row),float(j)))*.014;
            light+=cyan*pointGlow(p-vec2(x,y),size)*(.15+float(j)*.022);
          }
        } else {
          // A bacterial lure attached to a subdued fish, not a floating map dot.
          float body=exp(-pow(length((p-vec2(-.25,-.15))/vec2(.85,.52)),4.));
          light+=blue*body*.023;
          vec2 previous=vec2(.05,.28);
          for(int j=1;j<=10;j++) {
            float t=float(j)/10.;
            vec2 curve=(1.-t)*(1.-t)*vec2(.05,.28)
              +2.*(1.-t)*t*vec2(.40,1.85)+t*t*vec2(1.05,.94);
            light+=blue*exp(-segment(p,previous,curve)*90.)*.025;
            previous=curve;
          }
          light+=cyan*pointGlow(p-vec2(1.05,.94),.075)*.39;
        }
        return light;
      }
      void main() {
        vec3 d=normalize(rotation*vec3(screen.x*aspect*tangent,screen.y*tangent,-1.));
        d=normalize(d+localOffset);
        vec2 q=vec2(atan(d.x,-d.z),asin(clamp(d.y,-1.,1.)));
        float veil=noise(q*3.5)+noise(q*8.+13.)*.25;
        vec3 colour;
        // Deep water has no sunbeams. Local living light supplies the accents.
        colour=vec3(.008,.025,.048)+vec3(.003,.022,.024)*veil;
        float distant=exp(-pow((q.x+.55)*2.,2.)-pow((q.y+.2)*1.4,2.));
        colour+=vec3(.0,.012,.017)*distant;
        for(int i=0;i<12;i++) {
          int kind=i%6;
          vec4 animal=wildlife[i];
          // Keep the new forms visible beside the map on narrow screens too.
          if(i<6) animal.x*=min(1.,aspect/.95);
          vec2 p=q-animal.xy;
          p.x=mod(p.x+3.14159,6.28318)-3.14159;
          float co=cos(animal.w), si=sin(animal.w);
          p=mat2(co,-si,si,co)*p/animal.z;
          if(abs(p.x)>3. || abs(p.y)>3.3) continue;
          colour+=animalLight(p,kind);
        }
        // Sparse suspended matter, deliberately softer than a starfield.
        vec2 cell=floor(q*100.), f=fract(q*100.)-.5;
        float grain=exp(-dot(f,f)*100.)*step(.985,hash(cell));
        float quiet=smoothstep(.15,.65,abs(q.x));
        colour+=vec3(.035,.08,.085)*grain*quiet;
        gl_FragColor=vec4(colour,1.);
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
      material.uniforms.rotation.value.copy(rotation).premultiply(initialInverse);
      material.uniforms.localOffset.value.copy(offset).applyMatrix3(initialInverse);
      material.uniforms.aspect.value = aspect;
      material.uniforms.tangent.value = tangent;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
