const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Ensure baseUrl is applied from app.json
config.transformer = {
  ...config.transformer,
  publicPath: '/FireMes/_expo/static/js/web/',
}

module.exports = config