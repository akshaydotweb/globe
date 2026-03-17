<template>
  <div ref="container" class="canvas"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as THREE from 'three'

const container = ref(null)

let scene, camera, renderer, globe
let labels = []

// ---------------- LAT/LNG → SPHERE ----------------
function toSphere(lat, lng, r = 1) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
     Math.cos(phi),
     Math.sin(phi) * Math.sin(theta)
  ).multiplyScalar(r)
}

// ---------------- CENTROID ----------------
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

// ---------------- SAFE MASK ----------------
async function createMaskSafe() {
  try {
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

      if (f.geometry.type === 'Polygon') {
        polys = [f.geometry.coordinates]
      } else if (f.geometry.type === 'MultiPolygon') {
        polys = f.geometry.coordinates
      }

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

  } catch (e) {
    console.error("Mask failed → fallback used", e)
    return null
  }
}

// ---------------- LABEL ----------------
function createLabel(text) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  canvas.width = 256
  canvas.height = 64

  ctx.fillStyle = '#333'
  ctx.font = '22px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(text, 128, 40)

  const texture = new THREE.CanvasTexture(canvas)

  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true })
  )
}

// ---------------- UPDATE LABELS ----------------
function updateLabels() {
  labels.forEach(label => {

    const worldPos = new THREE.Vector3()
    label.getWorldPosition(worldPos)

    label.lookAt(camera.position)

    const dist = camera.position.distanceTo(worldPos)
    const scale = THREE.MathUtils.clamp(2 / dist, 0.05, 0.25)

    label.scale.set(scale, scale * 0.4, 1)

    const dot = worldPos.clone().normalize()
      .dot(camera.position.clone().normalize())

    label.visible = dot > 0.2
  })
}

// ---------------- BORDERS ----------------
function createBorders(data) {
  const group = new THREE.Group()

  data.features.forEach(f => {
    let polys = []

    if (f.geometry.type === 'Polygon') {
      polys = [f.geometry.coordinates]
    } else if (f.geometry.type === 'MultiPolygon') {
      polys = f.geometry.coordinates
    }

    polys.forEach(poly => {
      poly.forEach(ring => {

        const points = ring.map(([lng, lat]) =>
          toSphere(lat, lng, 1.001)
        )

        const geo = new THREE.BufferGeometry().setFromPoints(points)

        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({
            color: 0xff6b6b,
            opacity: 0.4,
            transparent: true
          })
        )

        group.add(line)
      })
    })
  })

  return group
}

// ---------------- INIT ----------------
onMounted(async () => {

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeef3f7)

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 2.5)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.value.appendChild(renderer.domElement)

  // fallback sphere first (so you NEVER get blank screen)
  globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x88ccee })
  )

  scene.add(globe)

  // try to load mask
  const mask = await createMaskSafe()

  if (mask) {
    globe.material = new THREE.ShaderMaterial({
      uniforms: { mask: { value: mask } },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D mask;

        void main(){
          float m = texture2D(mask, vUv).r;

          vec3 oceanLight = vec3(0.62, 0.82, 0.92);
          vec3 oceanDeep  = vec3(0.35, 0.65, 0.85);
          vec3 land       = vec3(0.78, 0.88, 0.68);

          vec3 water = mix(oceanDeep, oceanLight, vUv.y);
          vec3 color = mix(water, land, m);

          float light = 0.6 + 0.4 * vUv.y;

          gl_FragColor = vec4(color * light, 1.0);
        }
      `
    })
  }

  // load geojson
  let data
  try {
    data = await fetch('/world.json').then(r => r.json())
    console.log("Loaded:", data.features.length)
  } catch (e) {
    console.error("GeoJSON failed", e)
    return
  }

  // borders
  globe.add(createBorders(data))

  // labels (SAFE)
  data.features.forEach(f => {
    const name = f.properties.ADMIN
    if (!name) return

    let coords = []

    if (f.geometry.type === 'Polygon') {
      coords = f.geometry.coordinates[0]
    } else if (f.geometry.type === 'MultiPolygon') {
      coords = f.geometry.coordinates[0][0]
    }

    if (!coords || coords.length === 0) return

    const centroid = getCentroid(coords)

    const label = createLabel(name)
    label.position.copy(centroid.multiplyScalar(1.02))

    labels.push(label)
    globe.add(label)
  })

  // interaction
  let isDragging = false
  let prev = { x: 0, y: 0 }

  window.addEventListener('mousedown', e => {
    isDragging = true
    prev = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mouseup', () => isDragging = false)

  window.addEventListener('mousemove', e => {
    if (!isDragging) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y

    globe.rotation.y += dx * 0.005
    globe.rotation.x += dy * 0.003

    prev = { x: e.clientX, y: e.clientY }
  })

  function animate() {
    requestAnimationFrame(animate)

    globe.rotation.y += 0.001
    updateLabels()

    renderer.render(scene, camera)
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