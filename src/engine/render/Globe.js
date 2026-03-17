import * as THREE from 'three'

export function initGlobe(scene) {
  const texture = new THREE.TextureLoader().load(
    '/textures/earth_clean.jpg' // <-- IMPORTANT (no clouds)
  )

  texture.colorSpace = THREE.SRGBColorSpace

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    metalness: 0
  })

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 128),
    material
  )

  scene.add(globe)

  // LIGHTING (critical for Mapbox feel)
  const light = new THREE.DirectionalLight(0xffffff, 1.2)
  light.position.set(5, 3, 5)

  const ambient = new THREE.AmbientLight(0xffffff, 0.3)

  scene.add(light, ambient)
}