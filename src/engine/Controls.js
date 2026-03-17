export function initControls(scene) {
  let isDragging = false
  let prev = { x: 0, y: 0 }
  let rotation = { x: 0, y: 0 }

  let autoRotate = true
  let tilt = false

  window.addEventListener('mousedown', e => {
    isDragging = true
    prev = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mouseup', () => isDragging = false)

  window.addEventListener('mousemove', e => {
    if (!isDragging) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y

    rotation.y += dx * 0.005
    rotation.x += dy * 0.003

    prev = { x: e.clientX, y: e.clientY }
  })

  return {
    update() {
      if (autoRotate && !isDragging) {
        rotation.y += 0.0015
      }

      if (tilt) rotation.x = 0.5

      scene.rotation.y = rotation.y
      scene.rotation.x = rotation.x
    },

    toggleRotate() {
      autoRotate = !autoRotate
    },

    toggleTilt() {
      tilt = !tilt
    },

    reset() {
      rotation.x = 0
      rotation.y = 0
    }
  }
}