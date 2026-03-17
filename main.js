import * as THREE from 'three';

// ---------------- SCENE ----------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 2.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------------- TEXTURE ----------------
// Use a clean earth texture (NOT satellite-heavy)
const textureLoader = new THREE.TextureLoader();

const earthTexture = textureLoader.load(
  'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg'
);

// ---------------- GLOBE ----------------
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 128),
  new THREE.MeshBasicMaterial({
    map: earthTexture
  })
);

scene.add(globe);

// ---------------- BORDERS ----------------
function latLngToVector3(lat, lng, r = 1.01) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function createBorder(ring) {
  const pts = ring.map(([lng, lat]) =>
    latLngToVector3(lat, lng)
  );

  const geo = new THREE.BufferGeometry().setFromPoints(pts);

  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color: 0xff6b6b,
      opacity: 0.5,
      transparent: true
    })
  );
}

// ---------------- LOAD GEOJSON ----------------
fetch('/world.json')
  .then(res => res.json())
  .then(data => {
    data.features.forEach(f => {
      const coords = f.geometry.coordinates;

      if (f.geometry.type === 'Polygon') {
        coords.forEach(r => scene.add(createBorder(r)));
      }

      if (f.geometry.type === 'MultiPolygon') {
        coords.forEach(p => p.forEach(r => scene.add(createBorder(r))));
      }
    });
  });

// ---------------- CONTROLS ----------------
let isDragging = false;
let prev = {x:0,y:0};
let rotation = {x:0,y:0};

window.addEventListener('mousedown', e => {
  isDragging = true;
  prev = {x:e.clientX, y:e.clientY};
});

window.addEventListener('mouseup', () => isDragging = false);

window.addEventListener('mousemove', e => {
  if (!isDragging) return;

  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;

  rotation.y += dx * 0.005;
  rotation.x += dy * 0.003;

  rotation.x = Math.max(-1.2, Math.min(1.2, rotation.x));

  prev = {x:e.clientX, y:e.clientY};
});

// ---------------- BUTTONS ----------------
const [pauseBtn, tiltBtn, resetBtn] = document.querySelectorAll('.pill');

let autoRotate = true;
let tilt = false;

pauseBtn.onclick = () => autoRotate = !autoRotate;

tiltBtn.onclick = () => tilt = !tilt;

resetBtn.onclick = () => {
  rotation.x = 0;
  rotation.y = 0;
};

// ---------------- ANIMATION ----------------
function animate() {
  requestAnimationFrame(animate);

  if (autoRotate && !isDragging) {
    rotation.y += 0.0015;
  }

  if (tilt) {
    rotation.x = 0.5;
  }

  scene.rotation.y = rotation.y;
  scene.rotation.x = rotation.x;

  renderer.render(scene, camera);
}

animate();

// ---------------- RESIZE ----------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});