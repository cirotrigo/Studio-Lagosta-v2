const fs=require('node:fs'),p=require('node:path'),assert=require('node:assert/strict')
const dir=process.argv[2],a=JSON.parse(fs.readFileSync(p.join(dir,'baseline-metrics.json'))),b=JSON.parse(fs.readFileSync(p.join(dir,'candidate-metrics.json')))
assert.equal(a.version,'0.1.84');assert.equal(b.version,'1.0.11')
const changes={}
for(const name of Object.keys(a.cases)){
 const x=fs.readFileSync(p.join(dir,`baseline-${name}.rgba`)),y=fs.readFileSync(p.join(dir,`candidate-${name}.rgba`));assert.equal(x.length,y.length)
 let changed=0,max=0,sum=0
 for(let i=0;i<x.length;i+=4){let different=false;for(let j=0;j<4;j++){const d=Math.abs(x[i+j]-y[i+j]);max=Math.max(max,d);sum+=d;if(d)different=true}if(different)changed++}
 changes[name]={changedPixels:changed,totalPixels:x.length/4,percent:100*changed/(x.length/4),maxChannelDelta:max,meanChannelDelta:sum/x.length}
 fs.unlinkSync(p.join(dir,`baseline-${name}.rgba`));fs.unlinkSync(p.join(dir,`candidate-${name}.rgba`))
}
const result={baseline:a,candidate:b,changes};fs.writeFileSync(p.join(dir,'comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
