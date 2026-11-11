// 3D Earth with climate-driven effects (three.js r160)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TEX = './assets/textures/';
const DATA = './assets/data/';
const R = 1;
const DEFAULT_DIST = 4.3;
export const SEA_EXAGGERATION = 20; // the 2100 sea level is drawn 20× bigger on the whole globe

/** lat/lon (degrees) -> position on the sphere, matching SphereGeometry UVs. */
export function latLonToVec3(lat, lon, r = R) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(lo) * Math.cos(la) * r, Math.sin(la) * r, -Math.sin(lo) * Math.cos(la) * r);
}

const FIRE_SPOTS = [ // ordered: most fire-prone first
  [37, -120], [-34, 148], [39, 22], [55, -118], [-10, -60], [62, 125], [40, -8], [-36, -72], [-15, 25], [-2, 113], [64, -150], [-25, 132],
];
const CORAL_SPOTS = [
  [-18, 147], [-3, 125], [18, -77], [22, 38], [3, 73], [24.7, -81], [-21, 165], [17, -87.5], [20, -157], [-4.6, 55.5], [-17, 178], [-12, 132],
];
// Tropical-cyclone basins: N Atlantic, E Pacific, W Pacific, N Indian, S Indian, S Pacific
const STORM_SPOTS = [[21, -62], [15, -112], [19, 136], [15, 88], [-16, 68], [-17, 162]];
// Extra storms that appear in warm seas as the strongest storms become more common
const EXTRA_STORMS = [[25, -88], [13, 127], [16, 64], [-14, 152], [13, -74], [26, 150]];

// Mountain-glacier regions [lat, lon, radius°, sensitivity]. Regions with many small glaciers
// (Alps, Caucasus, W. North America, tropics, Scandinavia, New Zealand) lose ice fastest
// (Rounce et al. 2023). Remaining fraction = 1 − global loss × sensitivity.
export const GLACIER_REGIONS = [
  [61, -146, 5, 1.0], [51, -121, 5, 2.2], [-49, -73.3, 3, 0.9], [-10, -77, 3.5, 2.2], [-16.5, -68, 2, 2.2],
  [46.3, 9, 2.5, 2.2], [43, 43, 2, 2.0], [67, 17, 3, 1.8], [35.8, 76.5, 3, 0.9], [28.5, 86, 4, 1.4],
  [42, 79, 3, 1.5], [30, 95, 3, 1.5], [-43.5, 170.5, 1.5, 2.0], [-3.07, 37.35, 0.7, 2.5],
];
// Regions where IPCC AR6 (Fig. SPM.6) projects more agricultural & ecological drought at 2 °C
// [latS, latN, lonW, lonE]: Mediterranean, W&C Europe, W & C North America, Mexico, Central America,
// Caribbean, Amazon & NE Brazil, SW South America, southern Africa, Madagascar, southern & eastern Australia.
const DRY_BOXES = [
  [30, 46, -10, 40], [45, 55, -5, 25], [30, 50, -125, -105], [30, 50, -105, -90], [15, 30, -115, -90],
  [7, 15, -92, -78], [10, 25, -85, -60], [-20, 8, -75, -35], [-45, -25, -76, -66], [-35, -10, 10, 42],
  [-26, -12, 43, 51], [-40, -28, 112, 154], [-38, -25, 140, 154],
];

const vert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const frag = /* glsl */`
  precision highp float;
  uniform sampler2D uDay; uniform sampler2D uSpec; uniform sampler2D uGlobal; uniform vec2 uGlobalSize;
  uniform float uIceAngle, uAntIceAngle, uGreenland, uWAIS, uEAIS, uForestLoss, uDry, uHeat;
  uniform float uT, uHeatMap, uSeason, uSnowShift, uSea, uDike, uDataOn, uCold, uTime;
  uniform vec4 uGlac[14];
  uniform vec4 uDryBox[13];
  uniform float uHsOn; uniform vec4 uHsBox; uniform vec3 uHsMerc;
  uniform sampler2D uHsData; uniform sampler2D uHsImg; uniform vec2 uHsSize;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #define PI 3.14159265

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }

  // Data textures: R,G = sea level (m) at which the ocean reaches this pixel; B = elevation / 40 m
  vec2 decodeTexel(sampler2D t, vec2 uv){
    vec3 c = floor(texture2D(t, uv).rgb * 255.0 + 0.5);
    float e = c.b < 63.5 ? -(63.0 - c.b) * 2.0 : (c.b - 64.0) * 40.0; // sea floor in 2 m steps, land in 40 m steps
    return vec2((c.r * 256.0 + c.g) / 100.0 - 100.0, e);
  }
  vec2 sampleData(sampler2D t, vec2 size, vec2 uv){
    vec2 p = uv * size - 0.5; vec2 i = floor(p); vec2 f = p - i;
    vec2 a = decodeTexel(t, (i + vec2(0.5, 0.5)) / size);
    vec2 b = decodeTexel(t, (i + vec2(1.5, 0.5)) / size);
    vec2 c = decodeTexel(t, (i + vec2(0.5, 1.5)) / size);
    vec2 d = decodeTexel(t, (i + vec2(1.5, 1.5)) / size);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float mercY(float lat){ float r = radians(clamp(lat, -85.05, 85.05)); return (1.0 - log(tan(PI / 4.0 + r / 2.0)) / PI) / 2.0; }
  float box(float lat, float lon, vec4 b, float soft){
    return smoothstep(b.x - soft, b.x + soft, lat) * (1.0 - smoothstep(b.y - soft, b.y + soft, lat))
         * smoothstep(b.z - soft, b.z + soft, lon) * (1.0 - smoothstep(b.w - soft, b.w + soft, lon));
  }
  // Pattern of regional warming relative to the global mean (IPCC AR6 SPM.5 / Atlas):
  // land ≈ 1.5×, ocean ≈ 0.8×, Arctic up to ~3×, slower Southern Ocean and N. Atlantic "warming hole".
  float warmFactor(float lat, float lon, bool land){
    float f = land ? 1.45 : 0.82;
    f = mix(f, 3.0, smoothstep(55.0, 85.0, lat));
    if (!land) {
      f *= 1.0 - 0.6 * box(lat, lon, vec4(45.0, 62.0, -50.0, -15.0), 4.0);
      f *= 1.0 - 0.45 * smoothstep(-40.0, -55.0, lat);
    }
    if (lat < -66.0) f = 1.1;
    return f;
  }
  vec3 heatRamp(float d){
    vec3 c = vec3(0.55, 0.75, 0.95);
    c = mix(c, vec3(1.0, 0.95, 0.70), smoothstep(-1.0, 0.0, d));
    c = mix(c, vec3(0.99, 0.78, 0.38), smoothstep(0.5, 1.8, d));
    c = mix(c, vec3(0.95, 0.50, 0.20), smoothstep(1.8, 3.0, d));
    c = mix(c, vec3(0.82, 0.18, 0.12), smoothstep(3.0, 4.8, d));
    c = mix(c, vec3(0.50, 0.04, 0.16), smoothstep(4.8, 8.0, d));
    c = mix(c, vec3(0.28, 0.00, 0.22), smoothstep(8.0, 12.0, d));
    return c;
  }

  // Ice Age ice sheets (21,000 years ago): Laurentide over Canada/northern USA down to ~40°N,
  // Fennoscandian over northern Europe down to ~52°N, Patagonian in the Andes. Siberia and
  // Alaska stayed mostly ice-free (too dry).
  float iceSheet(float lat, float lon, float n1){
    if (uCold < 0.001) return 0.0;
    float wob = (n1 - 0.5) * 7.0 + sin(radians(lon) * 9.0) * 2.0;
    float naEdge = mix(80.0, 40.0, uCold) + wob;
    float na = box(lat, lon, vec4(30.0, 88.0, -140.0, -50.0), 3.0) * smoothstep(naEdge - 0.7, naEdge + 0.7, lat);
    float euEdge = mix(80.0, 51.0, uCold) + wob * 0.8;
    float eu = box(lat, lon, vec4(44.0, 88.0, -12.0, 68.0), 3.0) * smoothstep(euEdge - 0.7, euEdge + 0.7, lat);
    float pat = box(lat, lon, vec4(-56.0, -38.0, -76.0, -69.0), 1.0) * smoothstep(0.3, 0.7, uCold);
    return max(max(na, eu), pat);
  }

  void main(){
    float lat = (vUv.y - 0.5) * 180.0;
    float lon = (vUv.x - 0.5) * 360.0;
    vec3 col = texture2D(uDay, vUv).rgb;
    bool isWater = texture2D(uSpec, vUv).r > 0.5;
    vec3 ocean = vec3(0.05, 0.12, 0.28);
    vec3 sp = vec3(cos(radians(lat))*cos(radians(lon)), sin(radians(lat)), cos(radians(lat))*sin(radians(lon)));
    vec2 nq = sp.xz * 3.0 + sp.y * 2.0;
    float n1 = fbm(nq * 2.0 + 7.0);
    float n2 = fbm(nq * 6.0 + 3.0);

    // ---------- Real elevation + flood levels ----------
    float level = 999.0, elev = 0.0, detail = 0.0;
    if (uDataOn > 0.5) {
      vec2 gd = sampleData(uGlobal, uGlobalSize, vec2((lon + 180.0) / 360.0, 1.0 - mercY(lat)));
      level = gd.x; elev = gd.y;
    }
    // ---------- High-resolution coastal hotspot ----------
    if (uHsOn > 0.5) {
      float hx = (lon - uHsBox.x) / (uHsBox.y - uHsBox.x);
      float hy = (mercY(lat) * uHsMerc.x - uHsMerc.z) / 4.0;
      if (hx > 0.0 && hx < 1.0 && hy > 0.0 && hy < 1.0) {
        float fade = smoothstep(0.0, 0.05, min(hx, 1.0 - hx)) * smoothstep(0.0, 0.05, min(hy, 1.0 - hy));
        vec3 img = texture2D(uHsImg, vec2(hx, (lat - uHsBox.z) / (uHsBox.w - uHsBox.z))).rgb;
        col = mix(col, img, fade);
        if (fade > 0.5) {
          vec2 hd = sampleData(uHsData, uHsSize, vec2(hx, 1.0 - hy));
          level = hd.x; elev = hd.y; detail = 1.0;
          float ilum = dot(img, vec3(0.299, 0.587, 0.114));
          isWater = img.b > img.r * 1.25 && img.b > img.g * 0.95 && ilum < 0.32;
        }
      }
    }
    float lum = dot(col, vec3(0.299,0.587,0.114));
    bool land = !isWater;

    // ---------- Land surface ----------
    if (land) {
      bool iceLand = lum > 0.62 && abs(lat) > 58.0;
      if (!iceLand) {
        float veg = smoothstep(0.01, 0.07, col.g - max(col.r, col.b) * 0.92) * smoothstep(0.55, 0.25, lum);
        float tropics = 1.0 - smoothstep(20.0, 45.0, abs(lat)) * 0.55;
        float loss = max(uForestLoss, 0.0);
        float clear = veg * tropics * smoothstep(loss + 0.05, loss - 0.15, n2 * 0.9 + 0.1 * n1) * step(0.001, loss);
        col = mix(col, vec3(0.60, 0.48, 0.32), clear * 0.95);
        float regrow = max(-uForestLoss, 0.0);
        col = mix(col, col * vec3(0.75, 1.15, 0.75), veg * regrow * 2.0);
        // drought: only in regions where IPCC projects drying
        float dryMask = 0.0;
        for (int i = 0; i < 13; i++) dryMask = max(dryMask, box(lat, lon, uDryBox[i], 2.5));
        float dryness = uDry * dryMask * (0.35 + 0.65 * n1);
        col = mix(col, vec3(0.72, 0.58, 0.38) * (0.8 + 0.4 * n2), clamp(dryness * (0.4 + veg), 0.0, 0.75));
        col = mix(col, col * vec3(1.12, 0.92, 0.85), uHeat * 0.3);

        // mountain glaciers
        float gl = 0.0;
        for (int i = 0; i < 14; i++) {
          vec4 g = uGlac[i];
          float dlon = mod(lon - g.y + 540.0, 360.0) - 180.0;
          float r = length(vec2(lat - g.x, dlon * cos(radians(lat)))) / g.z;
          if (r < 1.0) {
            float w = 1.0 - smoothstep(0.3, 1.0, r);
            vec2 lq = vec2(dlon * cos(radians(lat)), lat - g.x) * 2.2 + float(i) * 7.3;
            float ridge = 1.0 - abs(2.0 * fbm(lq) - 1.0);           // branching, crest-like shapes
            ridge *= 0.75 + 0.25 * (1.0 - abs(2.0 * noise(lq * 6.0) - 1.0));
            float v = ridge * w * (0.6 + 0.4 * clamp(elev / 4500.0, 0.0, 1.0));
            float th = 0.97 - 0.27 * g.w;
            gl = max(gl, smoothstep(th, th + 0.025, v) * step(0.02, g.w));
          }
        }
        col = mix(col, vec3(0.94, 0.97, 1.0), gl);

        // winter (March) snow in the Northern Hemisphere; the snow line moves north as it warms
        if (uSeason > 0.001 && lat > 20.0) {
          float west = box(lat, lon, vec4(35.0, 72.0, -12.0, 25.0), 4.0) * 6.0;
          float edge = 47.0 + uSnowShift + west - clamp(elev / 1000.0 * 3.5, 0.0, 14.0);
          float snow = smoothstep(edge - 1.5, edge + 1.5, lat + (n1 - 0.5) * 5.0);
          col = mix(col, vec3(0.93, 0.95, 0.98) * (0.92 + 0.1 * n2), snow * 0.9 * uSeason);
        }
      }

      col = mix(col, vec3(0.92, 0.95, 0.99) * (0.9 + 0.12 * n2), iceSheet(lat, lon, n1));

      // Greenland ice sheet: melts from the edges inward
      if (lon > -75.0 && lon < -10.0 && lat > 59.0 && lat < 84.0 && lum > 0.5) {
        vec2 d = vec2((lon + 41.0) / 22.0, (lat - 73.5) / 11.0);
        float edgeG = length(d) + (n2 - 0.5) * 0.5;
        float melt = smoothstep(1.1 - uGreenland * 1.3, 1.15 - uGreenland * 1.3, edgeG);
        col = mix(col, vec3(0.42, 0.40, 0.36) * (0.8 + 0.4*n1), melt * step(0.001, uGreenland));
      }
      // Antarctica: West Antarctica (ice resting below sea level) turns into sea when it collapses
      if (lat < -60.0) {
        float waisShape = smoothstep(55.0, 35.0, abs(lon + 105.0)) * smoothstep(-88.0, -74.0, lat + (n1 - 0.5) * 6.0);
        float collapse = waisShape * step(n2 * 0.9 + 0.1, uWAIS * 1.05);
        col = mix(col, ocean * 1.3, collapse * smoothstep(-90.0, -70.0, lat));
        float eais = smoothstep(32.0, 15.0, abs(lon - 125.0)) * smoothstep(-80.0, -68.0, lat);
        col = mix(col, ocean * 1.3, eais * step(n2 * 0.9 + 0.1, uEAIS));
      }

      // ---------- Coastal flooding ----------
      // A pixel floods when the sea rises above the lowest path from the ocean to it.
      // The ~20 km global grid can't resolve < ~1 m, so it only floods land with level >= 1 m;
      // hotspots use ~0.6 km data. Land already below sea level (polders) is assumed protected
      // by dikes until the sea rises more than uDike.
      bool reachable = detail > 0.5 ? (level >= 0.0 || uSea > uDike) : (level >= 1.0 || (level < 0.0 && uSea > uDike));
      float depth = uSea - max(level, 0.0);
      if (reachable && depth > 0.0 && level < 500.0) {
        float a = smoothstep(0.0, detail > 0.5 ? 0.08 : 0.4, depth);
        vec3 fc = mix(vec3(0.20, 0.72, 0.92), vec3(0.06, 0.38, 0.62), clamp(depth / 12.0, 0.0, 1.0)); // bright so new sea stands out
        col = mix(col, fc, a);
        if (a > 0.5) isWater = true;
      }
    } else if (uSea < -0.5 && level < 0.5 && elev > uSea) {
      // ---------- Ice Age: the sea is lower, so shallow sea floor becomes new land ----------
      float tropic = 1.0 - smoothstep(15.0, 40.0, abs(lat));
      col = mix(vec3(0.58, 0.52, 0.40), vec3(0.36, 0.46, 0.28), tropic * 0.7 + 0.15) * (0.85 + 0.3 * n2);
      col = mix(col, vec3(0.92, 0.95, 0.99) * (0.9 + 0.12 * n2), iceSheet(lat, lon, n1));
      land = true; isWater = false;
    } else {
      // ---------- Sea ice ----------
      if (lat > 55.0) col = mix(col, vec3(0.06, 0.16, 0.30), 0.85); // remove ice baked into the photo
      // ice sheets also covered enclosed seas: Hudson Bay, the Baltic and the Barents Sea
      float seas = max(max(box(lat, lon, vec4(50.0, 70.0, -96.0, -74.0), 2.0), box(lat, lon, vec4(53.0, 67.0, 9.0, 31.0), 2.0)), box(lat, lon, vec4(68.0, 82.0, 15.0, 60.0), 2.0));
      col = mix(col, vec3(0.92, 0.95, 0.99), iceSheet(lat, lon, n1) * seas * 0.95);
      float colat = radians(90.0 - lat);
      float edge = uIceAngle * (1.0 + 0.32 * (n1 - 0.5) * 2.0);
      float ice = smoothstep(edge + 0.012, edge - 0.012, colat) * step(0.001, uIceAngle);
      float colatS = radians(90.0 + lat);
      float edgeS = uAntIceAngle * (1.0 + 0.12 * (n1 - 0.5) * 2.0);
      ice = max(ice, smoothstep(edgeS + 0.015, edgeS - 0.015, colatS) * step(lat, -45.0) * 0.92);
      col = mix(col, vec3(0.93, 0.96, 1.0) * (0.92 + 0.12*n2), ice);
      isWater = ice < 0.5;
    }

    // ---------- Whole planet: redder when hotter, icy-blue when colder ----------
    col = mix(col, col * vec3(1.32, 0.74, 0.58) + vec3(0.10, 0.01, 0.0), uHeat * (isWater ? 0.3 : 0.7));
    col += vec3(0.22, 0.04, 0.0) * uHeat * 0.12 * (0.5 + 0.5 * sin(uTime * 2.2 + n2 * 14.0)); // heat shimmer
    col = mix(col, col * vec3(0.80, 0.92, 1.12) + vec3(0.07, 0.09, 0.13), uCold * 0.5);

    // ---------- Heat-map overlay ----------
    if (uHeatMap > 0.001) {
      float dT = uT * warmFactor(lat, lon, land);
      col = mix(col, heatRamp(dT) * (0.75 + 0.35 * lum), 0.8 * uHeatMap);
    }

    // ---------- Lighting ----------
    vec3 N = normalize(vN);
    vec3 L = normalize(vec3(-0.45, 0.35, 0.82));
    vec3 V = normalize(vV);
    float diff = max(dot(N, L), 0.0);
    vec3 lit = col * (0.30 + 0.95 * diff);
    if (isWater && uHeatMap < 0.5) {
      vec3 H = normalize(L + V);
      lit += vec3(0.55, 0.62, 0.7) * pow(max(dot(N, H), 0.0), 40.0) * 0.6;
    }
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += mix(mix(vec3(0.35, 0.6, 1.0), vec3(1.0, 0.45, 0.2), uHeat), vec3(0.85, 0.95, 1.0), uCold) * rim * (0.45 + 0.35 * uHeat);
    gl_FragColor = vec4(lit, 1.0);
  }`;

export class Globe {
  constructor(container, tagLayer) {
    this.container = container;
    this.tagLayer = tagLayer;
    this.tags = new Map();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    this.camera.position.copy(latLonToVec3(18, 20, DEFAULT_DIST));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, minDistance: 2.6, maxDistance: 6, autoRotate: true, autoRotateSpeed: 0.35, enableZoom: false, rotateSpeed: 0.6 });

    const loader = new THREE.TextureLoader();
    const day = loader.load(TEX + 'earth_atmos_2048.jpg');
    day.colorSpace = THREE.NoColorSpace; // the shader works directly on the photo's sRGB values
    day.anisotropy = 8;
    const spec = loader.load(TEX + 'earth_specular_2048.jpg');
    const dataTex = (tex) => { tex.colorSpace = THREE.NoColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; return tex; };
    const global = dataTex(loader.load(DATA + 'global.png', () => { this.uniforms.uDataOn.value = 1; }));
    global.wrapS = THREE.RepeatWrapping;
    this._dataTex = dataTex;

    this.uniforms = {
      uDay: { value: day }, uSpec: { value: spec }, uGlobal: { value: global }, uGlobalSize: { value: new THREE.Vector2(2048, 2048) }, uDataOn: { value: 0 },
      uIceAngle: { value: 0.25 }, uAntIceAngle: { value: 0.5 }, uGreenland: { value: 0 }, uWAIS: { value: 0 }, uEAIS: { value: 0 },
      uForestLoss: { value: 0 }, uDry: { value: 0 }, uHeat: { value: 0 }, uT: { value: 1.3 }, uHeatMap: { value: 0 },
      uSeason: { value: 0 }, uSnowShift: { value: 0 }, uSea: { value: 0 }, uDike: { value: 2.0 }, uCold: { value: 0 }, uTime: { value: 0 },
      uGlac: { value: GLACIER_REGIONS.map(g => new THREE.Vector4(g[0], g[1], g[2], 1)) },
      uDryBox: { value: DRY_BOXES.map(b => new THREE.Vector4(...b)) },
      uHsOn: { value: 0 }, uHsBox: { value: new THREE.Vector4() }, uHsMerc: { value: new THREE.Vector3() },
      uHsData: { value: global }, uHsImg: { value: day }, uHsSize: { value: new THREE.Vector2(1024, 1024) },
    };
    this.animated = ['uIceAngle', 'uAntIceAngle', 'uGreenland', 'uWAIS', 'uEAIS', 'uForestLoss', 'uDry', 'uHeat', 'uT', 'uHeatMap', 'uSeason', 'uSnowShift', 'uSea', 'uCold'];
    this.target = Object.fromEntries(this.animated.map(k => [k, this.uniforms[k].value]));
    this.glacTarget = GLACIER_REGIONS.map(() => 1);

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 128), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag }));
    this.scene.add(this.earth);

    // Clouds
    const clouds = loader.load(TEX + 'earth_clouds_1024.png');
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: clouds }, uOpacity: { value: 0.75 } }, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; varying vec3 vN;
        void main(){ vec4 c = texture2D(uMap, vUv); float a = c.a * dot(c.rgb, vec3(0.333));
          float d = 0.35 + 0.75 * max(dot(normalize(vN), normalize(vec3(-0.45,0.35,0.82))), 0.0);
          gl_FragColor = vec4(vec3(d), a * uOpacity); }`,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 64), this.cloudMat);
    this.earth.add(this.clouds);

    // Atmosphere glow
    this.atmoUniform = { uHeat: { value: 0 }, uCold: { value: 0 }, uTime: { value: 0 } };
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 64, 48), new THREE.ShaderMaterial({
      uniforms: this.atmoUniform, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uHeat; uniform float uCold; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float i = pow(clamp(0.62 - dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.0); vec3 c = mix(mix(vec3(0.35,0.62,1.0), vec3(1.0,0.38,0.12), uHeat), vec3(0.85,0.95,1.0), uCold); float pulse = 1.0 + 0.3 * uHeat * sin(uTime * 2.5); gl_FragColor = vec4(c * i * (2.2 + 1.6 * uHeat) * pulse, 1.0); }`,
    }));
    this.scene.add(this.atmo);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    this.scene.add(this.camera);

    // Markers
    this.fires = this._makeSprites(FIRE_SPOTS, this._flameTexture(), 0.085, 1.015);
    this.corals = this._makeSprites(CORAL_SPOTS, this._coralTexture(), 0.06, 1.006);
    this.storms = this._makeStorms();

    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    new ResizeObserver(this._resize).observe(container);
    this.resize();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; clearTimeout(this._rt); });
    this.controls.addEventListener('end', () => { if (!this.hotspot) this._rt = setTimeout(() => (this.controls.autoRotate = true), 4000); });
  }

  // ---------------- markers ----------------
  _makeSprites(spots, tex, size, lift) {
    return spots.map(([lat, lon]) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      m.position.copy(latLonToVec3(lat, lon, R * lift));
      m.scale.setScalar(size);
      m.userData.base = size;
      this.earth.add(m);
      return m;
    });
  }
  _makeStorms() {
    const tex = this._spiralTexture();
    return [...STORM_SPOTS, ...EXTRA_STORMS].map(([lat, lon], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
      const p = latLonToVec3(lat, lon, R * 1.016);
      m.position.copy(p);
      m.lookAt(p.clone().multiplyScalar(2));
      m.userData.dir = lat >= 0 ? 1 : -1; // counter-clockwise in the north, clockwise in the south
      if (lat < 0) m.scale.x = -1;
      m.userData.base = 0.2;
      m.userData.extra = i >= STORM_SPOTS.length ? i - STORM_SPOTS.length + 1 : 0;
      m.material.opacity = m.userData.extra ? 0 : 0.9;
      this.earth.add(m);
      return m;
    });
  }
  _canvas(draw, s = 128) {
    const c = document.createElement('canvas'); c.width = c.height = s;
    draw(c.getContext('2d'), s);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _flameTexture() {
    return this._canvas((g, s) => {
      const grd = g.createRadialGradient(s / 2, s * 0.62, 2, s / 2, s * 0.6, s * 0.48);
      grd.addColorStop(0, 'rgba(255,240,150,1)'); grd.addColorStop(0.35, 'rgba(255,140,30,0.95)');
      grd.addColorStop(0.7, 'rgba(220,40,20,0.6)'); grd.addColorStop(1, 'rgba(200,30,10,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.06);
      g.bezierCurveTo(s * 0.85, s * 0.4, s * 0.86, s * 0.66, s * 0.72, s * 0.84);
      g.quadraticCurveTo(s * 0.5, s * 1.0, s * 0.28, s * 0.84);
      g.bezierCurveTo(s * 0.14, s * 0.66, s * 0.2, s * 0.44, s * 0.38, s * 0.3);
      g.quadraticCurveTo(s * 0.42, s * 0.5, s * 0.5, s * 0.06);
      g.fill();
    });
  }
  _coralTexture() {
    return this._canvas((g, s) => {
      g.fillStyle = 'rgba(10,30,50,0.85)'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, 0, 7); g.fill();
      g.fillStyle = '#ffffff';
      for (let a = 0; a < 6; a++) { g.beginPath(); g.arc(s / 2 + Math.cos(a) * s * 0.17, s / 2 + Math.sin(a) * s * 0.17, s * 0.13, 0, 7); g.fill(); }
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.18, 0, 7); g.fill();
    });
  }
  _spiralTexture() {
    return this._canvas((g, s) => {
      const c = s / 2;
      g.translate(c, c);
      // soft cloud arms of a cyclone, spiralling inwards (logarithmic spiral)
      for (let arm = 0; arm < 4; arm++) {
        for (let k = 0; k < 300; k++) {
          const t = k / 300, ang = arm * (Math.PI / 2) + t * 5.6;
          const r = s * 0.06 + t * s * 0.42;
          const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
          const a = 0.2 * (1 - t) + 0.05;
          const grd = g.createRadialGradient(x, y, 0, x, y, s * 0.07 * (1 - t * 0.5));
          grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, s * 0.07, 0, 7); g.fill();
        }
      }
      const core = g.createRadialGradient(0, 0, s * 0.02, 0, 0, s * 0.16);
      core.addColorStop(0, 'rgba(40,60,80,0.9)'); core.addColorStop(0.3, 'rgba(255,255,255,0.95)'); core.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = core; g.beginPath(); g.arc(0, 0, s * 0.16, 0, 7); g.fill();
    }, 256);
  }

  // ---------------- HTML tags pinned to places ----------------
  setTag(id, { lat, lon, html, cls = '', onClick }) {
    let t = this.tags.get(id);
    if (!t) {
      const el = document.createElement('button');
      el.className = 'gtag';
      el.type = 'button';
      el.addEventListener('click', (e) => { e.stopPropagation(); t.onClick ? t.onClick() : el.classList.toggle('open'); });
      this.tagLayer.appendChild(el);
      t = { el, pos: latLonToVec3(lat, lon, R), html: null };
      this.tags.set(id, t);
    }
    t.onClick = onClick;
    t.pos = latLonToVec3(lat, lon, R);
    const c = 'gtag ' + cls + (t.el.classList.contains('open') ? ' open' : '');
    if (t.el.className !== c) t.el.className = c;
    if (t.html !== html) { t.el.innerHTML = html; t.html = html; t.w = 0; }
  }
  _measure(t) {
    const mini = t.el.classList.contains('mini');
    if (mini) t.el.classList.remove('mini');
    t.w = t.el.offsetWidth; t.h = t.el.offsetHeight;
    if (mini) t.el.classList.add('mini');
  }
  setTagsVisible(v) { this.tagLayer.classList.toggle('hidden', !v); }
  _placeTags() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const camDir = this.camera.position.clone().normalize();
    const v = new THREE.Vector3();
    const dist = this.camera.position.length();
    if (this.tagLayer.classList.contains('hidden')) return;
    const rtl = document.documentElement.dir === 'rtl';
    const horizon = 1 / dist + 0.12; // only the near side of the globe
    const vis = [];
    for (const t of this.tags.values()) {
      const facing = t.pos.dot(camDir);
      if (facing < horizon || t.el.classList.contains('off')) { t.el.style.visibility = 'hidden'; continue; }
      v.copy(t.pos).project(this.camera);
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      if (x < 0 || x > w || y < 0 || y > h) { t.el.style.visibility = 'hidden'; continue; }
      if (!t.w) this._measure(t);
      const open = t.el.classList.contains('open') || t.el.matches(':hover');
      vis.push({ t, x, y, facing, pri: (open ? 10 : 0) + facing });
    }
    // Labels nearest the centre of view get room first; others that would overlap become small icons.
    vis.sort((a, b) => b.pri - a.pri);
    const placed = [];
    const hit = (r) => placed.some(p => r[0] < p[2] + 3 && r[2] > p[0] - 3 && r[1] < p[3] + 3 && r[3] > p[1] - 3);
    for (const o of vis) {
      const { t, x, y } = o;
      const full = rtl ? [x - t.w + 14, y - t.h / 2, x + 14, y + t.h / 2] : [x - 14, y - t.h / 2, x - 14 + t.w, y + t.h / 2];
      const mini = [x - 14, y - 14, x + 14, y + 14];
      const useMini = hit(full) && !(o.pri >= 10);
      placed.push(useMini ? mini : full);
      t.el.classList.toggle('mini', useMini);
      t.el.style.visibility = 'visible';
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      t.el.style.opacity = Math.min(1, (o.facing - horizon) * 6).toFixed(2);
      t.el.style.zIndex = useMini ? 1 : 2;
    }
  }

  // ---------------- camera ----------------
  flyTo(lat, lon, dist, ms = 1400) {
    this.controls.autoRotate = false;
    clearTimeout(this._rt);
    const from = this.camera.position.clone();
    const to = latLonToVec3(lat, lon, 1).multiplyScalar(dist);
    this.fly = { from, to, t0: performance.now(), ms };
  }
  async openHotspot(h) {
    this.hotspot = h;
    this.controls.minDistance = 1.08;
    this.controls.enableZoom = true;
    this.flyTo(h.lat, h.lon, 1.13);
    const loader = new THREE.TextureLoader();
    const data = this._dataTex(await loader.loadAsync(DATA + `hs_${h.id}.png`));
    // compose NASA Blue Marble tiles into one equirectangular image of the hotspot
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const b = h.bbox;
    await Promise.all(h.tiles.map(t => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const x = (t.w - b.w) / (b.e - b.w) * S, y = (b.n - t.n) / (b.n - b.s) * S;
        g.drawImage(img, x, y, t.deg / (b.e - b.w) * S, t.deg / (b.n - b.s) * S);
        res();
      };
      img.onerror = res;
      img.src = DATA + `img_${t.row}_${t.col}.jpg`;
    })));
    if (this.hotspot !== h) return;
    // Colour-match the NASA close-up to the globe photo so no box is visible
    try {
      const day = this.uniforms.uDay.value.image;
      const sc = document.createElement('canvas'); sc.width = sc.height = 32;
      const sg = sc.getContext('2d', { willReadFrequently: true });
      const sx = (b.w + 180) / 360 * day.width, sy = (90 - b.n) / 180 * day.height;
      sg.drawImage(day, sx, sy, (b.e - b.w) / 360 * day.width, (b.n - b.s) / 180 * day.height, 0, 0, 32, 32);
      const A = sg.getImageData(0, 0, 32, 32).data;
      sg.drawImage(cv, 0, 0, 32, 32);
      const B = sg.getImageData(0, 0, 32, 32).data;
      const m = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < A.length; i += 4) for (let k = 0; k < 3; k++) { m[k] += A[i + k]; m[k + 3] += B[i + k]; }
      const gain = [0, 1, 2].map(k => Math.min(1.8, Math.max(0.6, m[k] / Math.max(1, m[k + 3]))));
      const img = g.getImageData(0, 0, S, S), d = img.data;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, d[i + k] * gain[k]);
      g.putImageData(img, 0, 0);
    } catch { /* keep original colours */ }
    const imgTex = new THREE.CanvasTexture(cv); imgTex.colorSpace = THREE.NoColorSpace; imgTex.anisotropy = 8;
    const u = this.uniforms;
    u.uHsData.value = data; u.uHsImg.value = imgTex;
    u.uHsBox.value.set(b.w, b.e, b.s, b.n);
    u.uHsMerc.value.set(2 ** h.merc.z, h.merc.x0, h.merc.y0);
    u.uHsOn.value = 1;
    this.cloudMat.uniforms.uOpacity.value = 0.15;
  }
  closeHotspot() {
    if (!this.hotspot) return;
    const h = this.hotspot;
    this.hotspot = null;
    this.uniforms.uHsOn.value = 0;
    this.cloudMat.uniforms.uOpacity.value = 0.75;
    this.controls.minDistance = 2.6;
    this.controls.enableZoom = false;
    this.zoom = 1;
    this.flyTo(h.lat * 0.6, h.lon, this._fitDist());
    this._rt = setTimeout(() => (this.controls.autoRotate = true), 5000);
  }

  _fitDist() { return 1.2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1, this.camera.aspect); }
  /** Zoom with the magnifier buttons: factor < 1 zooms in, > 1 zooms out. */
  zoomBy(factor) {
    if (this.hotspot) { // in a coast close-up, zoom between very close and the whole Earth
      const d = THREE.MathUtils.clamp(this.camera.position.length() * factor, 1.06, this._fitDist());
      this._zoomTo(d);
      return;
    }
    this.zoom = THREE.MathUtils.clamp((this.zoom || 1) * factor, 0.36, 1.25);
    this.controls.minDistance = Math.min(2.6, this._fitDist() * 0.36);
    this.controls.maxDistance = Math.max(6, this._fitDist() * 1.25);
    this._zoomTo(this._fitDist() * this.zoom);
  }
  _zoomTo(dist) {
    this.controls.autoRotate = false;
    clearTimeout(this._rt);
    const from = this.camera.position.clone();
    this.fly = { from, to: from.clone().setLength(dist), t0: performance.now(), ms: 450 };
    if (!this.hotspot) this._rt = setTimeout(() => (this.controls.autoRotate = this.zoom >= 0.99), 4000);
  }
  /** Fly to a place at a zoom level (1 = whole Earth). home = true lets it start spinning again. */
  showView(lat, lon, zoom, home) {
    this.zoom = zoom;
    this.controls.minDistance = Math.min(2.6, this._fitDist() * 0.36);
    this.controls.maxDistance = Math.max(6, this._fitDist() * 1.25);
    this.flyTo(lat, lon, this._fitDist() * zoom, 1300);
    if (home) this._rt = setTimeout(() => (this.controls.autoRotate = true), 3500);
  }
  get zoomLevel() { return this.hotspot ? null : (this.zoom || 1); }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (!this.hotspot && !this.fly) this.camera.position.setLength(this._fitDist() * (this.zoom || 1));
    this.camera.updateProjectionMatrix();
  }

  /** Apply climate results. */
  update(c, opts) {
    const { far, season, heatMap } = opts;
    const ice = far ? c.iceFar : c.ice2100;
    const capAngle = (areaMkm2) => Math.acos(Math.max(-1, 1 - areaMkm2 * 1e6 / (2 * Math.PI * 6371 * 6371)));
    const arctic = season ? c.arcticIceMarch : c.arcticIce;
    const antarctic = 14.2 + (season ? c.antarcticIceFeb : c.antarcticIceSept); // continent + sea ice
    Object.assign(this.target, {
      uIceAngle: arctic < 0.05 ? 0 : capAngle(arctic),
      uAntIceAngle: capAngle(antarctic),
      uGreenland: ice.greenland, uWAIS: ice.wais, uEAIS: ice.eais,
      uForestLoss: c.deforest,
      uDry: Math.min(1, Math.max(0, (c.droughtX - 1.3) / 2.4)),
      uHeat: Math.min(1, Math.max(0, (c.T - 0.8) / 3.2)),
      uCold: c.iceAge,
      uT: c.T, uHeatMap: heatMap ? 1 : 0, uSeason: season ? 1 : 0, uSnowShift: c.snowShift,
      // On the whole globe the 2100 sea level is drawn 20× bigger (SEA_EXAGGERATION) so it can be seen;
      // the long-term (2000-year) and Ice-Age levels are real. Close-ups always use real values.
      uSea: this.seaOverride != null ? this.seaOverride
        : c.T < 0 ? c.seaLevelIceAge
        : far ? c.seaLevel2000y
        : this.hotspot ? c.seaLevel2100 : c.seaLevel2100 * SEA_EXAGGERATION,
    });
    const loss = (far ? Math.min(100, c.glacierMassLoss * 1.8) : c.glacierMassLoss) / 100;
    this.glacTarget = c.T < 0
      ? GLACIER_REGIONS.map(() => 1 + Math.min(1, -c.T / 4)) // glaciers grow when it cools
      : GLACIER_REGIONS.map(g => Math.max(0, 1 - loss * g[3]));
    this.atmoTarget = this.target.uHeat;
    this.markerState = {
      fires: Math.round(c.fire * FIRE_SPOTS.length),
      coral: c.coral / 100,
      storm: c.stormShare / 30,
      extraStorms: Math.round(Math.min(6, c.stormShare / 5)),
      cold: c.iceAge,
    };
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 5);
    for (const key of this.animated) {
      const u = this.uniforms[key];
      u.value += (this.target[key] - u.value) * k;
    }
    this.uniforms.uGlac.value.forEach((v, i) => { v.w += (this.glacTarget[i] - v.w) * k; });
    this.atmoUniform.uHeat.value += ((this.atmoTarget || 0) - this.atmoUniform.uHeat.value) * k;
    this.atmoUniform.uCold.value = this.uniforms.uCold.value;
    this.atmoUniform.uTime.value = this.uniforms.uTime.value = this.clock.elapsedTime;
    this.clouds.rotation.y += dt * 0.01;

    const t = this.clock.elapsedTime;
    const ms = this.markerState || { fires: 0, coral: 1, storm: 0 };
    const hm = this.uniforms.uHeatMap.value;
    this.fires.forEach((m, i) => {
      m.material.opacity += ((i < ms.fires ? 1 : 0) - m.material.opacity) * k;
      m.scale.setScalar(m.userData.base * (0.85 + 0.2 * Math.sin(t * 6 + i * 1.7)));
    });
    const healthy = new THREE.Color('#ff6f61'), bleached = new THREE.Color('#ffffff');
    const aliveCount = Math.round(ms.coral * this.corals.length);
    this.corals.forEach((m, i) => {
      m.material.opacity += (1 - m.material.opacity) * k;
      m.material.color.lerp(i < aliveCount ? healthy : bleached, k);
    });
    this.storms.forEach((m, i) => {
      // stronger storms: bigger and faster-spinning; a few extra appear in warm seas; fewer in an Ice Age
      const shown = m.userData.extra ? m.userData.extra <= (ms.extraStorms || 0) : !(ms.cold > 0.5 && i % 2);
      m.userData.vis = (m.userData.vis || 0) + ((shown ? 1 : 0) - (m.userData.vis || 0)) * k;
      m.rotateZ(dt * 0.9 * m.userData.dir * (1 + 2 * ms.storm));
      const wobble = 1 + 0.04 * Math.sin(t * 1.3 + i);
      const s = m.userData.base * (0.75 + ms.storm * 1.1) * (1 - 0.35 * (ms.cold || 0)) * wobble * (0.4 + 0.6 * m.userData.vis);
      m.scale.set(Math.sign(m.scale.x) * s, s, 1);
      m.material.opacity = 0.92 * m.userData.vis * (1 - hm * 0.7);
      m.visible = m.userData.vis > 0.02;
    });

    if (this.fly) {
      const f = Math.min(1, (performance.now() - this.fly.t0) / this.fly.ms);
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      const a = this.fly.from.clone().normalize(), b = this.fly.to.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(a, b);
      const qe = new THREE.Quaternion().slerp(q, e);
      const len = THREE.MathUtils.lerp(this.fly.from.length(), this.fly.to.length(), e);
      this.camera.position.copy(a.applyQuaternion(qe).multiplyScalar(len));
      this.camera.lookAt(0, 0, 0);
      if (f >= 1) this.fly = null;
    } else {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
    this._placeTags();
  }
}
