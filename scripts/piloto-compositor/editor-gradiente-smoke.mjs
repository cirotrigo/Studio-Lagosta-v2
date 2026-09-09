/** Painel e Context reais em Chromium; sem auth, API ou persistência. */
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const out = resolve('.tmp-medicao-compositor/editor-gradiente'); mkdirSync(out, { recursive: true })
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{TemplateEditorProvider,useTemplateEditor}from'@/contexts/template-editor-context';import{GradientsPanel}from'@/components/templates/sidebar/gradients-panel';
const template={id:1,projectId:1,name:'Teste local',type:'STORY',dimensions:'1080x1920',dynamicFields:[],designData:{canvas:{width:1080,height:1920,background:'#fff'},layers:[{id:'h',name:'headline',type:'text',order:0,visible:true,locked:false,content:'Teste',position:{x:100,y:100},size:{width:500,height:100},style:{fontSize:80,color:'#fff'},effects:{background:{enabled:true,opacity:.6}}}]}};
function State(){const e=useTemplateEditor();return <><button onClick={e.undo}>Desfazer teste</button><button onClick={e.redo}>Refazer teste</button><pre id="state">{JSON.stringify({layers:e.design.layers,dirty:e.dirty,canUndo:e.canUndo,selected:e.selectedLayerId})}</pre><GradientsPanel/></>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TemplateEditorProvider template={template}><State/></TemplateEditorProvider></QueryClientProvider>);`
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: resolve(out, 'bundle.js'), platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'brand-read-only', setup(b) { b.onResolve({ filter: /^@\/hooks\/use-brand-colors$/ }, () => ({ path: 'brand', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const useBrandColors=()=>({data:[]})', loader: 'js' })) } }] })
const server = createServer((req, res) => {res.end(req.url === '/bundle.js' ? readFileSync(resolve(out, 'bundle.js')) : '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>')})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
let browser
try {
 browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message))
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 const state=async()=>JSON.parse(await page.locator('#state').innerText())
 await page.getByRole('button',{name:'Aplicar gradiente suave',exact:true}).click()
 let s=await state(); assert.equal(s.layers.length,2);assert.equal(s.layers[0].type,'gradient');assert.equal(s.layers[1].effects.background,undefined);assert.equal(s.dirty,true);assert.equal(s.canUndo,true)
 await page.getByRole('button',{name:'Desfazer teste',exact:true}).click();s=await state();assert.equal(s.layers.length,1);assert.equal(s.layers[0].effects.background.opacity,.6)
 await page.getByRole('button',{name:'Refazer teste',exact:true}).click();s=await state();assert.equal(s.layers.length,2)
 await page.getByRole('button',{name:'Aplicar gradiente suave',exact:true}).click()
 await page.getByRole('button',{name:'Ponto de cor em 0%',exact:true}).click()
 await page.locator('input[type=range]').first().focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');s=await state();assert.equal(s.layers[0].style.gradientStops[0].opacity,.01)
 await page.getByRole('button',{name:'Aplicar gradiente suave',exact:true}).click();s=await state();assert.equal(s.layers.length,2);assert.equal(s.layers[0].style.gradientStops[0].opacity,.58)
 assert.equal(errors.length,0)
 writeFileSync(resolve(out,'resultado.json'),JSON.stringify({aplicar:true,undo:true,redo:true,semDuplicar:true,editarOpacidade:true,dirty:true,erros:errors},null,2));console.log('Chromium: painel real aplica preset, marca dirty, desfaz/refaz, edita opacidade e não duplica.')
} finally { if(browser)await browser.close();server.close() }
