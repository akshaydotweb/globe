import * as THREE from 'three'
import earcut from 'earcut'

// MERCATOR PROJECTION (2D)
function mercator(lat, lng) {
  const x = lng * Math.PI / 180
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))
  return [x, y]
}

// SPHERE PROJECTION
function toSphere(lat, lng, r = 1.001) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  )
}

export function createTileMesh(feature) {
  const group = new THREE.Group()

  const coords = feature.geometry.coordinates
  const polygons = feature.geometry.type === 'Polygon'
    ? [coords]
    : coords

  polygons.forEach(polygon => {
    const flat = []
    const positions = []
    const latLngs = []
    const holes = []

    let holeIndex = 0

    polygon.forEach((ring, i) => {
      if (i > 0) {
        holeIndex += polygon[i - 1].length
        holes.push(holeIndex)
      }

      ring.forEach(([lng, lat]) => {
        // STEP 1: project to mercator
        const [x, y] = mercator(lat, lng)
        flat.push(x, y)

        latLngs.push([lat, lng])
      })
    })

    // STEP 2: triangulate in 2D
    const indices = earcut(flat, holes)

    // STEP 3: map to sphere
    latLngs.forEach(([lat, lng]) => {
      const v = toSphere(lat, lng)
      positions.push(v.x, v.y, v.z)
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setIndex(indices)

    // CRITICAL: flat shading look (Mapbox style)
    const material = new THREE.MeshBasicMaterial({
      color: 0xc8d5b9,
      side: THREE.DoubleSide
    })

    group.add(new THREE.Mesh(geometry, material))
  })

  return group
}