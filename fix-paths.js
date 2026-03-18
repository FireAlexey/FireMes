const fs = require('fs')
const path = require('path')

const BASE = '/FireMes'
const indexPath = path.join(__dirname, 'dist', 'index.html')

let html = fs.readFileSync(indexPath, 'utf8')

// Fix script src
html = html.replace(/src="\/_expo\//g, `src="${BASE}/_expo/`)
// Fix link href
html = html.replace(/href="\/_expo\//g, `href="${BASE}/_expo/`)
// Fix assets
html = html.replace(/href="\/assets\//g, `href="${BASE}/assets/`)

fs.writeFileSync(indexPath, html)
console.log('✓ Paths fixed:', indexPath)