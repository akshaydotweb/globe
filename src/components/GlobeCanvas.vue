<template>
  <div ref="container" class="canvas"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as THREE from 'three'

const container = ref(null)

let scene, camera, renderer, globe
let labels = []

let targetZoom = 2.5
let currentZoom = 2.5

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
    const v = toSphere(lat, lng)
    x += v.x
    y += v.y
    z += v.z
  })

  return new THREE.Vector3(x, y, z).normalize()
}

function getPriority(f) {
  return f.properties.AREA || 1
}

// ---------------- LABEL ----------------
function createLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64

  const ctx = canvas.getContext('2d')

  ctx.fillStyle = "white"
  ctx.font = "bold 22px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(text, 128, 42)

  ctx.fillStyle = "#444"
  ctx.fillText(text, 128, 40)

  const texture = new THREE.CanvasTexture(canvas)

  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
  )
}

// ---------------- MASK ----------------
async function createMask() {
  const data = await fetch('/world.json').then(r => r.json())

  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'black'
  ctx.fillRect(0,0,canvas.width,canvas.height)

  ctx.fillStyle = 'white'

  function project(lng, lat) {
    return [
      ((lng + 180)/360)*canvas.width,
      ((90 - lat)/180)*canvas.height
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
          const [x,y] = project(lng,lat)
          idx===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
        })

        ctx.closePath()
        if (i===0) ctx.fill()
      })
    })
  })

  return new THREE.CanvasTexture(canvas)
}

// ---------------- LABEL ENGINE ----------------
function updateLabels() {
  const collisionBoxes = []

  const sorted = [...labels].sort(
    (a, b) => b.userData.priority - a.userData.priority
  )

  const anchors = [
    [0, 0],
    [0, 20],
    [0, -20],
    [20, 0],
    [-20, 0]
  ]

  sorted.forEach(label => {

    const worldPos = new THREE.Vector3()
    label.getWorldPosition(worldPos)

    // backside fix
    const camDir = camera.position.clone().normalize()
    const labelDir = worldPos.clone().normalize()

    if (camDir.dot(labelDir) < 0) {
      label.visible = false
      return
    }

    const projected = worldPos.clone().project(camera)

    const baseX = (projected.x * 0.5 + 0.5) * window.innerWidth
    const baseY = (1 - (projected.y * 0.5 + 0.5)) * window.innerHeight

    let placed = false

    for (let [ox, oy] of anchors) {

      const x = baseX + ox
      const y = baseY + oy

      const w = 120
      const h = 30

      const box = {
        x1: x - w/2,
        y1: y - h/2,
        x2: x + w/2,
        y2: y + h/2
      }

      let collision = false

      for (let b of collisionBoxes) {
        if (
          box.x1 < b.x2 &&
          box.x2 > b.x1 &&
          box.y1 < b.y2 &&
          box.y2 > b.y1
        ) {
          collision = true
          break
        }
      }

      if (!collision) {
        collisionBoxes.push(box)

        label.visible = true

        // 🔥 CRITICAL FIX — restore stable position
        label.position.copy(label.userData.basePosition)

        const dist = camera.position.distanceTo(worldPos)

        const scale = THREE.MathUtils.clamp(
          (3 / dist),
          0.08,
          0.35
        )

        label.scale.set(scale, scale * 0.4, 1)
        label.lookAt(camera.position)

        placed = true
        break
      }
    }

    if (!placed) label.visible = false
  })
}

// ---------------- INIT ----------------
onMounted(async () => {

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f7fb)

  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100)
  camera.position.set(0,0,currentZoom)

  renderer = new THREE.WebGLRenderer({ antialias:true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping

  container.value.appendChild(renderer.domElement)

  const mask = await createMask()

  const material = new THREE.ShaderMaterial({
    uniforms: { mask:{value:mask} },
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D mask;
      void main(){
        float m=texture2D(mask,vUv).r;
        vec3 oceanTop=vec3(0.78,0.92,0.98);
        vec3 oceanBottom=vec3(0.52,0.76,0.90);
        vec3 land=vec3(0.80,0.89,0.74);
        float g=smoothstep(0.0,1.0,vUv.y);
        vec3 water=mix(oceanBottom,oceanTop,g);
        vec3 color=mix(water,land,m);
        gl_FragColor=vec4(color,1.0);
      }
    `
  })

  globe = new THREE.Mesh(new THREE.SphereGeometry(1,256,256), material)
  scene.add(globe)

  const data = await fetch('/world.json').then(r => r.json())

  data.features.forEach(f => {
    const name = f.properties.ADMIN
    if (!name) return

    let coords = []
    if (f.geometry.type==="Polygon") coords=f.geometry.coordinates[0]
    else coords=f.geometry.coordinates[0][0]

    const centroid = getCentroid(coords)

    const basePos = centroid.clone().multiplyScalar(1.08)

    const label = createLabel(name)
    label.position.copy(basePos)

    label.userData.priority = getPriority(f)
    label.userData.basePosition = basePos.clone()

    labels.push(label)
    globe.add(label)
  })

  // zoom
  window.addEventListener('wheel', e=>{
    e.preventDefault()
    targetZoom += e.deltaY * 0.0015
    targetZoom = Math.max(1.8, Math.min(4.5, targetZoom))
  }, { passive:false })

  // rotation
  let dragging=false, prev={x:0,y:0}

  window.addEventListener('mousedown',e=>{
    dragging=true
    prev={x:e.clientX,y:e.clientY}
  })

  window.addEventListener('mouseup',()=>dragging=false)

  window.addEventListener('mousemove',e=>{
    if(!dragging) return
    globe.rotation.y += (e.clientX-prev.x)*0.005
    globe.rotation.x += (e.clientY-prev.y)*0.003
    prev={x:e.clientX,y:e.clientY}
  })

  function animate(){
    requestAnimationFrame(animate)

    currentZoom += (targetZoom - currentZoom) * 0.12
    camera.position.setLength(currentZoom)

    updateLabels()

    renderer.render(scene,camera)
  }

  animate()
})
</script>

<style>
.canvas {
  width:100vw;
  height:100vh;
}
</style>