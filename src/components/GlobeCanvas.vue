<template>
  <div ref="container" class="canvas"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as THREE from 'three'

const container = ref(null)

let scene, camera, renderer, globe
let labels = []

// ---------------- UTILS ----------------
function toSphere(lat, lng, r = 1) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
     Math.cos(phi),
     Math.sin(phi) * Math.sin(theta)
  ).multiplyScalar(r)
}

function getCentroid(coords) {
  let x = 0, y = 0, z = 0

  coords.forEach(([lng, lat]) => {
    const v = toSphere(lat, lng, 1)
    x += v.x
    y += v.y
    z += v.z
  })

  const len = coords.length || 1
  return new THREE.Vector3(x/len, y/len, z/len).normalize()
}

// ---------------- MASK ----------------
async function createMask() {
  const data = await fetch('/world.json').then(r => r.json())

  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'white'

  function project(lng, lat) {
    return [
      ((lng + 180) / 360) * canvas.width,
      ((90 - lat) / 180) * canvas.height
    ]
  }

  data.features.forEach(f => {
    let polys = []

    if (f.geometry.type === 'Polygon') polys = [f.geometry.coordinates]
    if (f.geometry.type === 'MultiPolygon') polys = f.geometry.coordinates

    polys.forEach(poly => {
      poly.forEach((ring, i) => {
        ctx.beginPath()

        ring.forEach(([lng, lat], idx) => {
          const [x, y] = project(lng, lat)
          idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })

        ctx.closePath()

        if (i === 0) ctx.fill()
        else ctx.globalCompositeOperation = 'destination-out'
      })

      ctx.globalCompositeOperation = 'source-over'
    })
  })

  return new THREE.CanvasTexture(canvas)
}

// ---------------- LABEL ----------------
function createLabel(text) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  canvas.width = 256
  canvas.height = 64

  // halo
  ctx.fillStyle = "white"
  ctx.font = "bold 22px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(text, 128, 42)

  // text
  ctx.fillStyle = "#333"
  ctx.fillText(text, 128, 40)

  const texture = new THREE.CanvasTexture(canvas)

  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true })
  )
}

// ---------------- PRIORITY ----------------
function getPriority(f) {
  const area = f.properties.AREA || 1
  return area
}

// ---------------- LABEL ENGINE ----------------
function updateLabels() {
  const used = []

  const sorted = [...labels].sort((a, b) =>
    b.userData.priority - a.userData.priority
  )

  sorted.forEach(label => {

    const worldPos = new THREE.Vector3()
    label.getWorldPosition(worldPos)

    const screen = worldPos.clone().project(camera)

    const x = (screen.x * 0.5 + 0.5) * window.innerWidth
    const y = (1 - (screen.y * 0.5 + 0.5)) * window.innerHeight

    // edge
    if (x < 100 || x > window.innerWidth - 100 ||
        y < 100 || y > window.innerHeight - 100) {
      label.visible = false
      return
    }

    // backside
    const dot = worldPos.clone().normalize()
      .dot(camera.position.clone().normalize())

    if (dot < 0.25) {
      label.visible = false
      return
    }

    // collision
    for (let p of used) {
      const dx = p.x - x
      const dy = p.y - y
      if (dx*dx + dy*dy < 5000) {
        label.visible = false
        return
      }
    }

    used.push({ x, y })

    label.visible = true

    const dist = camera.position.distanceTo(worldPos)
    const scale = THREE.MathUtils.clamp(2/dist, 0.05, 0.22)

    label.scale.set(scale, scale * 0.4, 1)

    label.lookAt(camera.position)
  })
}

// ---------------- BORDERS ----------------
function createBorders(data) {
  const group = new THREE.Group()

  data.features.forEach(f => {
    let polys = []

    if (f.geometry.type === 'Polygon') polys = [f.geometry.coordinates]
    if (f.geometry.type === 'MultiPolygon') polys = f.geometry.coordinates

    polys.forEach(poly => {
      poly.forEach(ring => {
        const points = ring.map(([lng, lat]) =>
          toSphere(lat, lng, 1.001)
        )

        const geo = new THREE.BufferGeometry().setFromPoints(points)

        group.add(new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({
            color: 0xff6b6b,
            opacity: 0.3,
            transparent: true
          })
        ))
      })
    })
  })

  return group
}

// ---------------- INIT ----------------
onMounted(async () => {

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f7fb)

  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100)
  camera.position.set(0,0,2.5)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  container.value.appendChild(renderer.domElement)

  const mask = await createMask()

  const material = new THREE.ShaderMaterial({
    uniforms: { mask: { value: mask } },
    vertexShader: `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}
    `,
    fragmentShader: `
varying vec2 vUv;
uniform sampler2D mask;

void main(){

  float m = texture2D(mask, vUv).r;

  // \U0001F30A Mapbox ocean palette (exact feel)
  vec3 oceanTop    = vec3(0.78, 0.92, 0.98);
  vec3 oceanBottom = vec3(0.52, 0.76, 0.90);

  // \U0001F33F land (soft pastel)
  vec3 land = vec3(0.80, 0.89, 0.74);

  // \U0001F3AF vertical gradient ONLY (this is key)
  float g = smoothstep(0.0, 1.0, vUv.y);

  vec3 water = mix(oceanBottom, oceanTop, g);

  vec3 color = mix(water, land, m);

  // \U0001F4A8 VERY subtle edge fade (not lighting)
  float edge = smoothstep(0.7, 1.0, length(vUv - 0.5));
  color = mix(color, vec3(0.85, 0.92, 0.98), edge * 0.2);

  // \U0001F3AF gamma correction (important for vibrancy)
  color = pow(color, vec3(0.95));

  gl_FragColor = vec4(color, 1.0);
}
    `
  })

  globe = new THREE.Mesh(
    new THREE.SphereGeometry(1,256,256),
    material
  )

  scene.add(globe)

  // atmosphere
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.015, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0xd6ecff,
      transparent: true,
      opacity: 0.25,
      side: THREE.BackSide
    })
  ))

  const data = await fetch('/world.json').then(r => r.json())

  globe.add(createBorders(data))

  const sorted = [...data.features].sort((a,b)=>getPriority(b)-getPriority(a))

  sorted.forEach(f=>{
    const name = f.properties.ADMIN
    if(!name) return

    let coords = []
    if(f.geometry.type==="Polygon") coords=f.geometry.coordinates[0]
    else if(f.geometry.type==="MultiPolygon") coords=f.geometry.coordinates[0][0]

    if(!coords.length) return

    const centroid = getCentroid(coords)

    const label = createLabel(name)
    label.position.copy(centroid.multiplyScalar(1.02))

    label.userData.priority = getPriority(f)

    labels.push(label)
    globe.add(label)
  })

  // interaction
  let isDragging=false, prev={x:0,y:0}

  window.addEventListener('mousedown',e=>{
    isDragging=true
    prev={x:e.clientX,y:e.clientY}
  })

  window.addEventListener('mouseup',()=>isDragging=false)

  window.addEventListener('mousemove',e=>{
    if(!isDragging) return

    globe.rotation.y += (e.clientX-prev.x)*0.005
    globe.rotation.x += (e.clientY-prev.y)*0.003

    prev={x:e.clientX,y:e.clientY}
  })

  function animate(){
    requestAnimationFrame(animate)
    globe.rotation.y += 0.001
    updateLabels()
    renderer.render(scene,camera)
  }

  animate()
})
</script>

<style>
.canvas {
  width: 100vw;
  height: 100vh;
}
</style>