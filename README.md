# Globe: Mapbox-Style 3D Interactive Globe with Three.js

This project is a high-quality, interactive 3D globe built with Three.js and Vue.js, inspired by Mapbox GL JS. It features smooth zoom, inertia rotation, vector/GeoJSON rendering, and Mapbox-like label density and fading. Designed for beautiful, production-level globe visualizations with robust label management and modern UI.

## Features
- 3D globe rendering with custom shaders and pastel Mapbox-style palette
- Vector land and border rendering from GeoJSON (`/world.json`)
- Smooth zoom and inertia rotation (Mapbox-like feel)
- Mapbox-style label density tiers and fading
- High-DPI label rendering with collision and edge/backside culling
- Subtle atmosphere and auto-rotation
- Responsive and performant (Vite + Vue 3)

## Getting Started

1. Clone the repo:
   ```sh
   git clone https://github.com/your-username/globe.git
   cd globe
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the dev server:
   ```sh
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure
- `src/components/GlobeCanvas.vue` — Main globe component (Three.js + label logic)
- `public/world.json` — GeoJSON for land and borders
- `index.html` — App entry point

## Customization
- Replace `world.json` with your own GeoJSON for custom regions.
- Tweak label density/priority logic in `GlobeCanvas.vue` for different map styles.

## License
MIT
