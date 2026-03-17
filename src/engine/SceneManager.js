import * as THREE from 'three'

export function initScene(container) {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )
  camera.position.set(0, 0, 2.5)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)

  container.appendChild(renderer.domElement)

  return { scene, camera, renderer }
}