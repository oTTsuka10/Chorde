const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// O monorepo tem backend/ e processing/ (codigo Node de servidor) no mesmo diretorio pai.
// Sem isto, o Metro tenta empacotar server.js (que usa "fs", "express") no app mobile e falha.
config.resolver.blockList = [
  /.*\/backend\/.*/,
  /.*\/processing\/.*/,
  /.*\\backend\\.*/,
  /.*\\processing\\.*/,
  /.*\/Dockerfile/,
  /.*\\Dockerfile/,
  /.*setup-.*\.sh$/,
];

// Garante que so a pasta mobile/ seja observada pelo Metro.
config.watchFolders = [__dirname];

module.exports = config;
