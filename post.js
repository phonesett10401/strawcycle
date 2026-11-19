// Film post-processing, loaded only on High and Ultra after the first plain frame (see film.js).
// Pipeline: scene -> bloom (emissive only) -> sun light rays -> warm grade + haze -> ACES output -> FXAA (ultra/video).
// Every uniform is set from u each frame and nothing reads the previous frame, so a fixed (p, t) renders identically.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Radial blur toward the sun: only bright pixels (sky glow, sun) stream, so ridges and the hut cut shafts into it.
const RAYS = {
  name: 'RaysShader',
  uniforms: { tDiffuse: { value: null }, uSun: { value: [0.5, 0.5] }, uAmt: { value: 0 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
  #define N SAMPLES
  uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec2 step = (uSun - vUv) * (0.9 / float(N));
    vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < N; i++) {
      uv += step;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      acc += c * smoothstep(0.6, 1.1, dot(c, vec3(0.3, 0.55, 0.15))) * w;
      w *= 0.955;
    }
    gl_FragColor = vec4(base.rgb + acc / float(N) * uAmt * vec3(1.0, 0.72, 0.42), base.a);
  }`,
};

// Warm lift in the shadows and a grey-warm haze that thickens with smoke (linear, before tone mapping).
const GRADE = {
  name: 'GradeShader',
  uniforms: { tDiffuse: { value: null }, uSmoke: { value: 0 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
  uniform sampler2D tDiffuse; uniform float uSmoke; varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.3, 0.55, 0.15));
    c.rgb += vec3(0.022, 0.012, 0.004) * (1.0 - smoothstep(0.0, 0.5, l));          // warm lift
    float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
    float keep = (1.0 - smoothstep(0.35, 1.2, l)) * (1.0 - smoothstep(0.6, 0.85, sat));  // flames, embers and lit smoke keep their colour
    c.rgb = mix(c.rgb, vec3(l) * vec3(1.04, 0.98, 0.9), 0.6 * uSmoke * keep);    // fire and smoke drain the colour to grey
    c.rgb = mix(c.rgb, vec3(0.46, 0.4, 0.36), 0.22 * uSmoke * keep);              // haze
    gl_FragColor = c;
  }`,
};

const withSamples = (shader, n) => ({ ...shader, fragmentShader: shader.fragmentShader.replace('SAMPLES', n) });

export function createPost(THREE, renderer, scene, camera, tier) {
  const ultra = tier.name === 'ultra';
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier.msaa ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);                                   // sizes below are drawing-buffer pixels
  composer.setSize(size.x, size.y);

  const bloomBase = ultra ? 0.42 : 0.28;
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloomBase, 0.55, 1.0);  // threshold: only emissive/sun
  const rays = new ShaderPass(withSamples(RAYS, ultra ? 48 : 24));
  const grade = new ShaderPass(GRADE);
  const output = new OutputPass();                              // reads renderer.toneMapping (ACES) and its exposure
  const passes = [new RenderPass(scene, camera), bloom, rays, grade, output];
  let fxaa = null;
  if (!tier.msaa && tier.post) { fxaa = new ShaderPass(FXAAShader); passes.push(fxaa); }
  passes.forEach((p) => composer.addPass(p));
  const fxaaRes = () => fxaa?.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
  fxaaRes();

  return {
    render(u) {
      bloom.strength = bloomBase * (0.7 + 0.3 * u.glow);
      bloom.radius = 0.55 - 0.4 * (u.fire ?? 0);                 // tight around the flames, so they keep their edges
      rays.uniforms.uSun.value = u.sunScreen;
      rays.uniforms.uAmt.value = 0.35 * u.sun * (u.facing ?? 1);
      grade.uniforms.uSmoke.value = u.smoke;
      composer.render(0);
    },
    resize() {
      renderer.getDrawingBufferSize(size);                       // exact buffer size: a 1 px mismatch makes OutputPass resample (noisy, blurry)
      composer.setSize(size.x, size.y);
      fxaaRes();
    },
    dispose() { passes.forEach((p) => p.dispose?.()); composer.dispose(); target.dispose(); },
  };
}
