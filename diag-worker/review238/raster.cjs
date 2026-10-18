// Synthetic only: no external images, network, env loading or project database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const canvas=require(process.argv[2]),dir=process.argv[3],label=process.argv[4]
fs.mkdirSync(dir,{recursive:true})
const {createCanvas,GlobalFonts}=canvas
const widths=()=>{const ctx=createCanvas(1,1).getContext('2d');return ['400 40px sans-serif','700 40px sans-serif','400 40px Montserrat','700 40px Montserrat','40px serif','40px NoSuchSyntheticFont'].map(font=>{ctx.font=font;return{font,accent:ctx.measureText('Ç').width,tofu:ctx.measureText('\u0378').width,phrase:ctx.measureText('ALMOÇO às 12h').width}})}
// Register before any measurement, matching CanvasRenderer initialization.
// Cold measurements can populate fallback caches and confound the warm comparison.
const registration=[]
for(const w of [100,300,400,500,600,700,800,900]) registration.push({weight:w,ok:Boolean(GlobalFonts.registerFromPath(path.resolve(`assets/fonts/montserrat/Montserrat-${w}.ttf`),'Montserrat'))})
if(label==='candidate') GlobalFonts.setAlias('Montserrat','sans-serif')
for(const [name,file] of [['Arial','liberation/LiberationSans-Regular.ttf'],['Helvetica','liberation/LiberationSans-Regular.ttf'],['Times New Roman','liberation/LiberationSerif-Regular.ttf'],['Georgia','liberation/LiberationSerif-Regular.ttf'],['Verdana','dejavu/DejaVuSans.ttf']]) GlobalFonts.registerFromPath('/usr/share/fonts/truetype/'+file,name)
const metrics={version:require(process.argv[2]+'/package.json').version,registration,warm:widths(),cases:{}}
const cases={
 montserrat400:{font:'400 40px Montserrat'},montserrat700:{font:'700 40px Montserrat'},sans400:{font:'400 40px sans-serif'},sans700:{font:'700 40px sans-serif'},serif:{font:'40px serif'},unknown:{font:'40px NoSuchSyntheticFont'},
 shadowHalf:{shadow:0.5,blur:0},shadowFull:{shadow:1,blur:0},shadowBlurHalf:{shadow:0.5,blur:24},shadowBlurFull:{shadow:1,blur:24},stroke:{stroke:true},rotation:{rotation:true},rectShadowHalf:{rect:true,shadow:0.5,blur:0},rectShadowFull:{rect:true,shadow:1,blur:0},rectShadowBlurHalf:{rect:true,shadow:0.5,blur:24},rectShadowBlurFull:{rect:true,shadow:1,blur:24},rectNoShadow:{rect:true}
}
for(const [name,opt] of Object.entries(cases)){
 const c=createCanvas(640,180),ctx=c.getContext('2d');ctx.fillStyle='#e0e0e0';ctx.fillRect(0,0,640,180)
 ctx.font=opt.font||'700 40px Montserrat';ctx.fillStyle='#123456';ctx.textBaseline='top'
 if(opt.shadow!==undefined){ctx.shadowColor=`rgba(0,0,0,${opt.shadow})`;ctx.shadowOffsetX=20;ctx.shadowOffsetY=20;ctx.shadowBlur=opt.blur}
 if(opt.rotation){ctx.translate(20,20);ctx.rotate(Math.PI/18)}
 if(opt.rect) ctx.fillRect(180,40,180,60); else ctx.fillText('ALMOÇO às 12h Ç Ã',30,35)
 if(opt.stroke){ctx.lineWidth=2;ctx.strokeStyle='#c00000';ctx.strokeText('ALMOÇO às 12h Ç Ã',30,35)}
 const rgba=Buffer.from(ctx.getImageData(0,0,640,180).data)
 fs.writeFileSync(path.join(dir,`${label}-${name}.rgba`),rgba);fs.writeFileSync(path.join(dir,`${label}-${name}.png`),c.toBuffer('image/png'))
 metrics.cases[name]={hash:crypto.createHash('sha256').update(rgba).digest('hex'),pixels:640*180}
}
fs.writeFileSync(path.join(dir,`${label}-metrics.json`),JSON.stringify(metrics,null,2))
