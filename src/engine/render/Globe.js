import * as THREE from 'three'

export function initGlobe(scene) {
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 128),
    new THREE.MeshBasicMaterial({ color: 0x5f8fbf })
  )

  scene.add(globe)
}