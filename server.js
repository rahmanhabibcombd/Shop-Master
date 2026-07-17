// Hostinger Entrypoint Wrapper
// This file runs after Hostinger triggers 'npm run build' which compiles 'server.ts' to 'dist/server.cjs'
// Using dynamic import ensures it is compatible with both ES Module ("type": "module") and older CommonJS Passenger environments.
import('./dist/server.cjs').catch((err) => {
  console.error("Failed to load server.cjs via ES import, trying CommonJS require fallback...", err);
  try {
    // If we are in a CommonJS wrapper where require is defined
    const path = require('path');
    require(path.join(__dirname, 'dist', 'server.cjs'));
  } catch (reqErr) {
    console.error("Failed to load server.cjs via CommonJS require:", reqErr);
    process.exit(1);
  }
});
