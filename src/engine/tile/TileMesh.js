import * as THREE from 'three'
import earcut from 'earcut'
import { latLngToVector3, mercator } from '../math/Projection'
import { clipPolygon } from './TileClipper'

export function createTileMesh(feature) {

    const bounds = {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1
        }

  const group = new THREE.Group()

  const coords = feature.geometry.coordinates

  const polys = feature.geometry.type === 'Polygon'
    ? [coords]
    : coords

  polys.forEach(polygon => {
    const flat = []
    const verts = []
    const holes = []

    let holeIndex = 0

    polygon.forEach((ring, i) => {
      if (i > 0) {
        holeIndex += polygon[i - 1].length
        holes.push(holeIndex)
      }

      ring.forEach(([lng, lat]) => {
        const [x, y] = mercator(lat, lng)
        flat.push(x, y)

        const v = latLngToVector3(lat, lng)
        verts.push(v.x, v.y, v.z)
      })
    })

    const indices = earcut(flat, holes)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)

    group.add(new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xc8d5b9,
        side: THREE.DoubleSide
      })
    ))
  })

  return group
}