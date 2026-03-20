#!/usr/bin/env node
/**
 * Generates assets/icons/*.png — the extension icon at all required sizes.
 * Run: npm run generate:icons
 *
 * Source icon: highlight marker (diagonal stroke + square tip), charcoal #3a3a3c
 * on light grey #e5e5ea rounded-square background.
 *
 * SVG geometry is defined in a 32×32 viewport and scaled to each target size.
 */

const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'assets', 'icons')

const SIZES = [16, 19, 32, 38, 48, 64, 96, 128, 256]

// Icon geometry — 32×32 viewport, charcoal fill
const ICON_PATHS = `
  <path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/>
`

/**
 * Build a full SVG string for the given pixel size.
 * The icon paths are defined in a 32×32 space; we scale them to fit
 * inside an inset (icon occupies ~65% of total canvas) centred on the bg.
 */
function buildSvg(size) {
  const radius = Math.round(size * 0.225)       // 22.5% corner radius
  const iconSize = Math.round(size * 0.65)       // icon occupies 65% of canvas
  const offset = Math.round((size - iconSize) / 2)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${radius}" fill="#e5e5ea"/>
  <!-- Icon: 32x32 paths scaled and centred -->
  <g transform="translate(${offset}, ${offset}) scale(${iconSize / 32})">
    ${ICON_PATHS}
  </g>
</svg>`
}

function generateAll() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  for (const size of SIZES) {
    const svg = buildSvg(size)
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()
    const outPath = path.join(OUT_DIR, `${size}.png`)
    fs.writeFileSync(outPath, pngBuffer)
    console.log(`  ✓ ${size}.png  (${pngBuffer.length} bytes)`)
  }

  console.log(`\nGenerated ${SIZES.length} icons → ${OUT_DIR}`)
}

generateAll()
