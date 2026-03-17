import * as THREE from 'three'

export function latLngToVector3(lat, lng, r = 1.002) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  )
}

export function mercator(lat, lng) {
  const x = lng * Math.PI / 180
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))
  return [x, y]
}

const projected = ring.map(([lng, lat]) => {
  const [x, y] = mercator(lat, lng)
  return [x, y]
})

// 🔥 CLIP HERE
const clipped = clipPolygon(projected, bounds)

if (clipped.length < 3) return

clipped.forEach(([x, y], i) => {
  flat.push(x, y)

  const original = ring[i % ring.length]
  const v = latLngToVector3(original[1], original[0])
  verts.push(v.x, v.y, v.z)
})