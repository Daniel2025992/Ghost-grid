import {build} from 'esbuild';
import fs from 'node:fs';
const out = await build({entryPoints: ['game.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none'});
const code = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => code);
const dest = process.argv[2] || '../dist/index.html';
fs.mkdirSync(dest.replace(/\/[^/]*$/, ''), {recursive: true});
fs.writeFileSync(dest, html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB ->', dest);
