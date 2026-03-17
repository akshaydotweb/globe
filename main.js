import * as THREE from 'three';

/* ─── Scene Setup ─────────────────────────────────────────── */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xeeecea, 1);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();

/* ─── Camera ──────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 2.6);
camera.lookAt(0, 0, 0);

/* ─── Lighting — balanced for atlas-style visibility ─────── */
/* High ambient keeps the dark side readable (atlas maps are evenly lit).
   Moderate sun gives just enough depth to feel 3D without washing out. */
const ambient = new THREE.AmbientLight(0xffffff, 0.72);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff6ee, 0.90);
sun.position.set(5, 4, 5);
scene.add(sun);

const fill = new THREE.DirectionalLight(0xd8eeff, 0.22);
fill.position.set(-4, -2, -3);
scene.add(fill);

/* ─── Atlas-style Earth Texture ───────────────────────────── */
/* Strategy:
   1. Try loading the Three.js "land_ocean_ice_cloud" texture — it's the
      closest freely-available atlas texture (no clouds layer needed).
   2. Post-process it on a canvas to desaturate clouds, boost ocean blue,
      and lift land saturation → atlas feel, not satellite.
   3. Full procedural fallback if all CDN URLs fail.                    */

const GLOBE_R = 1.0;
const geo     = new THREE.SphereGeometry(GLOBE_R, 128, 128);

const mat = new THREE.MeshPhongMaterial({
  specular:  new THREE.Color(0x1a2a38),
  shininess: 10,
});
const globe = new THREE.Mesh(geo, mat);
scene.add(globe);

/* ── Color-correct a loaded image to atlas style ── */
function toAtlasTexture(img) {
  const S  = 2048;
  const oc = document.createElement('canvas');
  oc.width = S; oc.height = S;
  const g  = oc.getContext('2d');

  /* Draw source image */
  g.drawImage(img, 0, 0, S, S);

  /* Read pixels and apply per-pixel color grading */
  const id  = g.getImageData(0, 0, S, S);
  const d   = id.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, gv = d[i+1] / 255, b = d[i+2] / 255;

    /* Convert to HSL */
    const max = Math.max(r, gv, b), min = Math.min(r, gv, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const diff = max - min;
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      switch (max) {
        case r:  h = ((gv - b) / diff + (gv < b ? 6 : 0)) / 6; break;
        case gv: h = ((b  - r) / diff + 2) / 6; break;
        default: h = ((r  - gv) / diff + 4) / 6;
      }
    }

    /* ── Grading rules ──
       Ocean (blue-ish hues, 0.5–0.72): boost saturation, deepen slightly
       Land greens (0.2–0.42): boost saturation, lighten a touch
       Desert/sand (0.06–0.18): keep warm, add slight warmth
       Ice/white (low sat, high l): push to clean off-white
       Cloud-gray (low sat, mid l): re-map to ocean blue (removes cloud layer)  */

    const hDeg = h * 360;

    if (s < 0.12 && l > 0.55) {
      /* White/light gray → could be cloud or ice.
         Latitude-based: top/bottom 20% of texture = ice, middle = ocean */
      const row = Math.floor((i / 4) / S) / S; /* 0=north, 1=south */
      if (row < 0.18 || row > 0.82) {
        /* Ice caps: keep near-white but slightly blue-tinted */
        r = 0.88 + l * 0.10; gv = 0.92 + l * 0.06; b = 0.95 + l * 0.04;
      } else {
        /* Mid-latitude gray (cloud): remap to ocean blue */
        r = 0.42 + l * 0.08; gv = 0.62 + l * 0.10; b = 0.75 + l * 0.12;
        r = Math.min(r, 0.62); gv = Math.min(gv, 0.76); b = Math.min(b, 0.88);
      }
    } else if (hDeg >= 185 && hDeg <= 260 && s > 0.1) {
      /* Ocean blues: boost saturation +25%, deepen lightness −8% */
      s = Math.min(s * 1.25, 1.0);
      l = Math.max(l * 0.92, 0.25);
      /* Clamp to a pleasant mid-blue range */
      const [nr, ng, nb] = hslToRgb(h, s, l);
      r = Math.max(nr, 0.28); gv = Math.max(ng, 0.52); b = Math.max(nb, 0.70);
      d[i] = r*255; d[i+1] = gv*255; d[i+2] = b*255; continue;
    } else if (hDeg >= 60 && hDeg <= 160 && s > 0.08) {
      /* Land greens: boost saturation +20%, slight lightness lift */
      s = Math.min(s * 1.20, 0.75);
      l = Math.min(l * 1.06, 0.72);
      const [nr, ng, nb] = hslToRgb(h, s, l);
      r = nr; gv = ng; b = nb;
    } else if (hDeg >= 18 && hDeg < 60 && s > 0.06) {
      /* Desert/sand: slight warmth boost */
      s = Math.min(s * 1.10, 0.60);
      const [nr, ng, nb] = hslToRgb(h, s, l);
      r = nr; gv = ng; b = nb;
    }

    d[i] = r*255; d[i+1] = gv*255; d[i+2] = b*255;
  }

  g.putImageData(id, 0, 0);

  /* Overlay subtle country borders on top */
  drawBorders(g, S);

  const tex = new THREE.CanvasTexture(oc);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q-p)*6*t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q-p)*(2/3-t)*6;
  return p;
}

/* ── Draw border lines onto finished texture canvas ── */
function drawBorders(g, S) {
  function px(lon, lat) { return [(lon+180)/360*S, (90-lat)/180*S]; }
  function line(pts, col, w) {
    g.beginPath();
    pts.forEach(([lo,la],i) => { const [x,y]=px(lo,la); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.strokeStyle=col; g.lineWidth=w; g.stroke();
  }
  const B = 'rgba(200,100,105,0.55)';
  g.lineCap='round'; g.lineJoin='round';
  /* US/Canada */
  line([[-124,49],[-110,49],[-100,49],[-90,49],[-76,45],[-68,47]], B, 3);
  line([[-117,32],[-106,32],[-97,26]], B, 3);
  /* Europe */
  line([[2,43],[2,50],[0,52]], B, 2.5);
  line([[6,51],[14,51],[18,50],[22,50],[26,48],[26,44],[22,42]], B, 2.5);
  line([[14,48],[14,54]], B, 2.5);
  line([[22,50],[22,58]], B, 2.5);
  line([[28,56],[28,50],[30,48],[26,46],[24,44],[22,42],[20,40]], B, 2.5);
  /* Russia/China */
  line([[60,54],[80,54],[100,52],[110,48],[118,48],[122,52]], B, 2.5);
  line([[100,52],[108,40],[112,36],[118,32],[118,24],[108,20]], B, 2.5);
  /* Africa */
  line([[-18,14],[0,14],[12,14],[24,14],[36,14],[42,12]], B, 2.5);
  line([[0,14],[0,6],[0,-2]], B, 2.5);
  line([[12,14],[12,6],[12,-2],[14,-8]], B, 2.5);
  line([[24,14],[24,6],[24,-2],[24,-10],[24,-20]], B, 2.5);
  line([[36,14],[36,6],[36,-2],[36,-10]], B, 2.5);
  line([[14,-8],[24,-8],[36,-8]], B, 2.5);
  line([[18,-20],[26,-20],[34,-22],[34,-28]], B, 2.5);
  /* South America */
  line([[-68,0],[-60,-4],[-52,-33]], B, 2.5);
  line([[-68,0],[-68,12]], B, 2.5);
  /* India */
  line([[68,36],[72,28],[76,18],[80,10]], B, 2.5);
}

/* ── Full procedural fallback (if CDN fails) ── */
function buildProceduralTexture() {
  const S  = 2048;
  const oc = document.createElement('canvas');
  oc.width = S; oc.height = S;
  const g  = oc.getContext('2d');

  /* Richer ocean — actual blue, not gray */
  const og = g.createLinearGradient(0, 0, 0, S);
  og.addColorStop(0,   '#5a9dbf');
  og.addColorStop(0.3, '#6aafd4');
  og.addColorStop(0.5, '#7abde0');
  og.addColorStop(0.8, '#5e9ec0');
  og.addColorStop(1,   '#4a8aaa');
  g.fillStyle = og; g.fillRect(0, 0, S, S);

  function px(lon, lat) { return [(lon+180)/360*S, (90-lat)/180*S]; }
  function poly(pts, fill, sc, sw) {
    g.beginPath();
    pts.forEach(([lo,la],i) => { const [x,y]=px(lo,la); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.closePath();
    if (fill) { g.fillStyle=fill; g.fill(); }
    if (sc)   { g.strokeStyle=sc; g.lineWidth=sw||1.5; g.stroke(); }
  }

  const L1='#a8be8c', L2='#b5c99a', L3='#c8b878', I='#ddeef5';
  const CS='rgba(80,110,80,0.5)';

  /* Continents with slightly varied land tones */
  poly([[-168,71],[-60,72],[-52,47],[-66,44],[-70,42],[-74,40],[-80,32],[-90,15],[-83,10],[-77,8],[-68,11],[-78,12],[-80,24],[-87,16],[-90,15],[-97,22],[-105,20],[-117,32],[-124,37],[-125,48],[-130,55],[-168,71]], L2, CS);
  poly([[-44,83],[-20,83],[-18,76],[-25,65],[-45,60],[-58,70],[-52,78],[-44,83]], I, CS);
  poly([[-9,43],[-2,44],[2,43],[7,44],[12,44],[14,45],[18,40],[26,38],[26,42],[30,44],[27,48],[18,50],[14,54],[8,58],[0,56],[-5,54],[-8,52],[-5,47],[-2,46],[-4,43],[-8,40],[-9,38],[-5,36],[5,36],[12,37],[20,38],[28,36],[30,38],[30,34],[14,32],[0,35],[-10,35],[-9,43]], L2, CS);
  poly([[5,58],[20,58],[24,60],[28,64],[28,70],[16,70],[12,65],[8,62],[5,58]], L2, CS);
  poly([[-5,50],[-2,52],[0,54],[-2,56],[-4,58],[-6,56],[-5,52],[-5,50]], L2, CS);
  poly([[-18,14],[-8,22],[0,24],[8,22],[16,22],[28,20],[36,18],[42,12],[44,10],[42,6],[40,-10],[36,-20],[30,-32],[26,-34],[24,-32],[18,-20],[14,-8],[8,2],[0,6],[-8,5],[-16,10],[-18,12],[-18,14]], L1, CS);
  poly([[44,-13],[48,-14],[50,-20],[46,-24],[44,-22],[44,-13]], L1, CS);
  poly([[26,42],[40,38],[50,40],[60,36],[68,36],[76,34],[84,28],[92,24],[100,18],[108,26],[112,38],[120,40],[128,44],[136,54],[144,60],[152,68],[140,72],[110,70],[80,68],[50,68],[38,68],[30,62],[26,54],[26,42]], L2, CS);
  poly([[68,36],[72,34],[76,20],[80,10],[78,8],[72,8],[68,22],[66,28],[68,36]], L3, CS);
  poly([[36,30],[44,28],[50,26],[56,24],[58,22],[52,16],[44,12],[40,14],[38,18],[36,22],[36,26],[36,30]], L3, CS);
  poly([[100,4],[106,0],[116,-8],[120,-8],[116,-2],[108,2],[104,2],[100,4]], L2, CS);
  poly([[114,-22],[126,-14],[136,-12],[144,-18],[152,-22],[154,-26],[150,-34],[146,-38],[140,-34],[128,-30],[120,-26],[116,-24],[114,-22]], L3, CS);
  poly([[-180,72],[180,72],[180,90],[-180,90]], I);
  poly([[-180,-66],[180,-66],[180,-90],[-180,-90]], I);

  drawBorders(g, S);

  /* Subtle graticule */
  g.strokeStyle='rgba(255,255,255,0.10)'; g.lineWidth=0.8;
  for (let lo=-180; lo<=180; lo+=30) { const x=(lo+180)/360*S; g.beginPath(); g.moveTo(x,0); g.lineTo(x,S); g.stroke(); }
  for (let la=-90; la<=90; la+=30)   { const y=(90-la)/180*S;  g.beginPath(); g.moveTo(0,y); g.lineTo(S,y); g.stroke(); }

  const tex = new THREE.CanvasTexture(oc);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* ── Texture loading: CDN first, procedural fallback ── */
function applyTexture(tex) {
  mat.map = tex; mat.needsUpdate = true;
}

const TEXTURE_URLS = [
  'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg',
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r164/examples/textures/land_ocean_ice_cloud_2048.jpg',
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/land_ocean_ice_cloud_2048.jpg',
];

/* Apply procedural immediately so globe is never blank */
applyTexture(buildProceduralTexture());

/* Then try CDN — if it loads, post-process and swap in */
(function tryLoad(urls, i) {
  if (i >= urls.length) return; /* already have procedural, nothing to do */
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { applyTexture(toAtlasTexture(img)); };
  img.onerror = () => tryLoad(urls, i + 1);
  img.src = urls[i];
})(TEXTURE_URLS, 0);

/* ─── Atmosphere Shader ───────────────────────────────────── */
const atmosVert = `
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal   = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const atmosFrag = `
uniform vec3 glowColor;
uniform float coeff;
uniform float power;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vec3 viewDir = normalize(-vPosition);
  float intensity = pow(coeff - dot(vNormal, viewDir), power);
  gl_FragColor = vec4(glowColor * intensity, intensity * 0.82);
}`;

const atmosMat = new THREE.ShaderMaterial({
  uniforms: {
    glowColor: { value: new THREE.Color(0x8ab8e8) },
    coeff:     { value: 0.65 },
    power:     { value: 3.2 }
  },
  vertexShader: atmosVert,
  fragmentShader: atmosFrag,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});

const atmosGeo = new THREE.SphereGeometry(GLOBE_R * 1.055, 64, 64);
const atmos = new THREE.Mesh(atmosGeo, atmosMat);
scene.add(atmos);

/* Inner glow (back face) for deeper atmosphere */
const atmosInner = new THREE.ShaderMaterial({
  uniforms: {
    glowColor: { value: new THREE.Color(0xaad0f0) },
    coeff:     { value: 0.72 },
    power:     { value: 4.5 }
  },
  vertexShader: atmosVert,
  fragmentShader: atmosFrag,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
const atmosInnerMesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.12, 64, 64), atmosInner);
scene.add(atmosInnerMesh);

/* ─── Cluster Markers ─────────────────────────────────────── */
const MARKERS = [
  { lon: 10, lat: 52, label: '2', type: 'purple' },  /* Europe */
  { lon: 22, lat: 4,  label: '5', type: 'dark'   },  /* Africa */
];

function latLonTo3D(lat, lon, r) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

/* Project 3D globe-surface point → screen pixel */
function projectToScreen(worldPos) {
  const v = worldPos.clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    behind: v.z > 1
  };
}

/* Check if a point on globe is facing camera */
function isFacing(worldPos) {
  const toPoint = worldPos.clone().normalize();
  const toCam   = camera.position.clone().normalize();
  return toPoint.dot(toCam) > 0.08;
}

const markerEls = MARKERS.map(m => {
  const div = document.createElement('div');
  div.className = 'marker';

  if (m.type === 'purple') {
    div.innerHTML = `<div class="marker-purple">${m.label}</div>`;
  } else {
    div.innerHTML = `<div class="marker-pill-dark"><span class="gi"></span>${m.label}</div>`;
  }

  document.getElementById('marker-container').appendChild(div);
  return { el: div, lon: m.lon, lat: m.lat };
});

function updateMarkers() {
  markerEls.forEach(m => {
    const worldPos = latLonTo3D(m.lat, m.lon, GLOBE_R);
    /* Apply current globe rotation */
    worldPos.applyEuler(globe.rotation);

    const facing = isFacing(worldPos);
    const screen = projectToScreen(worldPos);

    if (!facing || screen.behind) {
      m.el.style.opacity = '0';
      m.el.style.pointerEvents = 'none';
    } else {
      m.el.style.opacity = '1';
      m.el.style.pointerEvents = 'auto';
      m.el.style.left = (screen.x - 15) + 'px';
      m.el.style.top  = (screen.y - 15) + 'px';
    }
  });
}

/* ─── Interaction ─────────────────────────────────────────── */
let isDragging = false;
let prevMouse  = { x: 0, y: 0 };
let targetRotY = -0.3; /* Start showing Europe/Africa */
let targetRotX = -0.18;
let currentRotY = -0.3;
let currentRotX = -0.18;
let velX = 0, velY = 0;
let autoSpin = true;

canvas.addEventListener('mousedown', e => {
  isDragging = true;
  prevMouse = { x: e.clientX, y: e.clientY };
  velX = velY = 0;
});

window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const dx = (e.clientX - prevMouse.x) / window.innerWidth;
  const dy = (e.clientY - prevMouse.y) / window.innerHeight;
  velX =  dy * Math.PI * 1.4;
  velY =  dx * Math.PI * 2.0;
  targetRotX += velX;
  targetRotY += velY;
  targetRotX = Math.max(-1.1, Math.min(1.1, targetRotX));
  prevMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => { isDragging = false; });
window.addEventListener('mouseleave', () => { isDragging = false; });

canvas.addEventListener('touchstart', e => {
  isDragging = true;
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  velX = velY = 0;
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  if (!isDragging) return;
  const dx = (e.touches[0].clientX - prevMouse.x) / window.innerWidth;
  const dy = (e.touches[0].clientY - prevMouse.y) / window.innerHeight;
  velX =  dy * Math.PI * 1.4;
  velY =  dx * Math.PI * 2.0;
  targetRotX += velX;
  targetRotY += velY;
  targetRotX = Math.max(-1.1, Math.min(1.1, targetRotX));
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

canvas.addEventListener('touchend', () => { isDragging = false; });

/* ─── UI Buttons ──────────────────────────────────────────── */
let tilted = false;
document.getElementById('btn-spin').addEventListener('click', function() {
  autoSpin = !autoSpin;
  this.textContent = autoSpin ? '⏸ Pause' : '▶ Spin';
  this.classList.toggle('active', autoSpin);
});

document.getElementById('btn-tilt').addEventListener('click', function() {
  tilted = !tilted;
  targetRotX = tilted ? -0.55 : -0.18;
  this.classList.toggle('active', tilted);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  targetRotY = -0.3; targetRotX = -0.18;
  velX = velY = 0; tilted = false;
  document.getElementById('btn-tilt').classList.remove('active');
});

/* ─── Resize ──────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ─── Render Loop ─────────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  /* Inertia decay when not dragging */
  if (!isDragging) {
    velX *= 0.88;
    velY *= 0.88;
    targetRotX += velX * dt * 8;
    targetRotY += velY * dt * 8;
    targetRotX = Math.max(-1.1, Math.min(1.1, targetRotX));
  }

  /* Auto-spin */
  if (autoSpin && !isDragging) {
    targetRotY += 0.0015;
  }

  /* Smooth lerp to target rotation */
  const LERP = 0.07;
  currentRotX += (targetRotX - currentRotX) * LERP;
  currentRotY += (targetRotY - currentRotY) * LERP;

  globe.rotation.x = currentRotX;
  globe.rotation.y = currentRotY;
  atmos.rotation.x = currentRotX;
  atmos.rotation.y = currentRotY;
  atmosInnerMesh.rotation.x = currentRotX;
  atmosInnerMesh.rotation.y = currentRotY;

  updateMarkers();
  renderer.render(scene, camera);
}

animate();