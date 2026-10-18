// Cenários sintéticos de sombra, IDÊNTICOS para napi e Chromium (o mesmo código roda nos dois). W×H fixos.
// "so-sombra": a forma fica fora do quadro (x - 2000) e o deslocamento traz só a sombra para dentro: isola a sombra
// do raster dos glifos. "composto": forma + sombra, como o render desenha.
var W = 640, H = 200
var CENARIOS = []
;[0, 8, 24].forEach(function (blur) {
  ;[0.5, 1].forEach(function (alfa) {
    CENARIOS.push({ nome: 'ret-so-sombra-a' + alfa + '-b' + blur, forma: 'ret', so: true, alfa: alfa, blur: blur })
    CENARIOS.push({ nome: 'texto-so-sombra-a' + alfa + '-b' + blur, forma: 'texto', so: true, alfa: alfa, blur: blur })
    CENARIOS.push({ nome: 'ret-composto-a' + alfa + '-b' + blur, forma: 'ret', so: false, alfa: alfa, blur: blur })
  })
})
CENARIOS.push({ nome: 'ret-sem-sombra', forma: 'ret', so: false, alfa: null, blur: 0 })
function desenhar(ctx, c) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
  var dx = c.so ? -2000 : 0
  if (c.alfa !== null) { ctx.shadowColor = 'rgba(0,0,0,' + c.alfa + ')'; ctx.shadowBlur = c.blur; ctx.shadowOffsetX = 12 - dx; ctx.shadowOffsetY = 12 }
  ctx.fillStyle = '#c0392b'
  if (c.forma === 'ret') ctx.fillRect(160 + dx, 50, 260, 90)
  else { ctx.font = '700 64px Montserrat'; ctx.textBaseline = 'top'; ctx.fillText('ALMOÇO 12h', 40 + dx, 50) }
}
if (typeof module !== 'undefined') module.exports = { W: W, H: H, CENARIOS: CENARIOS, desenhar: desenhar }
