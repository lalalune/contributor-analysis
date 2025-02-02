import * as esbuild from 'esbuild';
import { createRequire } from 'module';

const externals = [
  'react',
  'react-dom',
  'react-dom/server',
  'recharts',
  'fs',
  'path',
  'url',
  'stream',
  'util',
  'http',
  'zlib'
];

await esbuild.build({
  entryPoints: ['src/generate_site.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/generate_site.js',
  external: externals,
  loader: { '.js': 'jsx' }, // Add this line to handle JSX in .js files
  jsxFactory: 'React.createElement', // Add this for React.createElement
  jsxFragment: 'React.Fragment', // Add this for React fragments
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

console.log('Build complete');
