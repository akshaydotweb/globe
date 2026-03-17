import * as THREE from 'three'
import { toSphere } from '../math/projection'

export function createBorders(feature) {
  const group = new THREE.Group()

  const coords = feature.geometry.coordinates
  const polygons = feature.geometry.type === 'Polygon'
    ? [coords]
    : coords

  polygons.forEach(poly => {
    poly.forEach(ring => {
      const points = ring.map(([lng, lat]) =>
        toSphere(lat, lng, 1.002)
      )

      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xff6b6b,
          opacity: 0.5,
          transparent: true
        })
      )

      group.add(line)
    })
  })

  return group
}