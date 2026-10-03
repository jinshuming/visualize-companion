import { build } from 'esbuild';
import fs from 'node:fs';
const dist = 'node_modules/@viggle/splat-engine/dist/';
const worker = fs.readFileSync(dist + 'binary-gsplat-worker.js', 'utf8');
const patchWorker = {
  name: 'inline-worker',
  setup(b) {
    b.onLoad({ filter: /splat-engine\/dist\/index\.js$/ }, (a) => {
      let src = fs.readFileSync(a.path, 'utf8');
      const re = /new Worker\(\s*new URL\("\.\/binary-gsplat-worker\.js", import\.meta\.url\),\s*\{ type: "module", name: "binary-gsplat" \}\s*\)/;
      if (!re.test(src)) throw new Error('worker pattern not found');
      src = src.replace(re, `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {type:'text/javascript'})), {name:"binary-gsplat"})`);
      return { contents: src, loader: 'js' };
    });
  },
};
await build({
  entryPoints: ['src/stage.js'], bundle: true, minify: true, format: 'iife',
  target: 'safari16', outfile: 'dist/stage.bundle.js', plugins: [patchWorker, {
    name: 'nonode',
    setup(b) {
      b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'nonode' }));
      b.onLoad({ filter: /.*/, namespace: 'nonode' }, () => ({ contents: 'module.exports={}' }));
    },
  }],
  define: { 'import.meta.url': '"veplika://app/"' },
});
fs.copyFileSync('stage.html', 'dist/stage.html');
console.log('built', (fs.statSync('dist/stage.bundle.js').size / 1e6).toFixed(2), 'MB');
