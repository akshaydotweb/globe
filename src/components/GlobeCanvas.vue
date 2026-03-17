<template>
  <div ref="container" class="canvas"></div>

  <div class="ui">
    <button @click="toggleRotate">Pause</button>
    <button @click="toggleTilt">Tilt</button>
    <button @click="reset">Reset</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { initScene } from '../engine/SceneManager'
import { initControls } from '../engine/Controls'
import { initGlobe } from '../engine/render/Globe'
import { initTiles } from '../engine/tile/TileManager'

const container = ref(null)

let controls

onMounted(async () => {
  const { scene, camera, renderer } = initScene(container.value)

  controls = initControls(scene)

  initGlobe(scene)

  await initTiles(scene)

  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  animate()
})

function toggleRotate() {
  controls.toggleRotate()
}

function toggleTilt() {
  controls.toggleTilt()
}

function reset() {
  controls.reset()
}
</script>

<style>
.canvas {
  width: 100vw;
  height: 100vh;
}
.ui {
  position: absolute;
  top: 20px;
  width: 100%;
  text-align: center;
}
button {
  margin: 5px;
}
</style>