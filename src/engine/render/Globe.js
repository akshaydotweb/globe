import * as THREE from 'three'

export function initGlobe(scene) {
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 128),
    new THREE.MeshBasicMaterial({
      color: 0x7bb2d9
    })
  )

  scene.add(ocean)
}