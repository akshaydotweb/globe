import { createTileMesh } from './TileMesh'

export async function initTiles(scene) {
  const data = await fetch('/world.json').then(r => r.json())

  data.features.forEach(f => {
    const mesh = createTileMesh(f)
    scene.add(mesh)
  })
}