#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');

// Minifica CSS
execSync('npx cleancss -o styles.min.css styles.css', { stdio: 'inherit' });
console.log('✓ styles.min.css generado');
