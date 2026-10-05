// A FILA DE VÍDEO de verdade (`processNextVideoJob`): baixa o WebM gravado no
// editor, monta a trilha (som de cada clipe pela linha do tempo, ou a música)
// e converte para MP4 com o ffmpeg da produção (ffmpeg-static). Banco, Blob e
// Drive são o stub-servidor.ts; o job vem de PROVA_JOB e o MP4 sai em
// PROVA_SAIDA. O resultado e o que a fila gravou na Generation vão para
// PROVA_RESULTADO. Uso (o rodar.mjs monta o bundle e chama, servindo os
// arquivos por http): node processar-servidor.cjs
import fs from 'node:fs'
import { processNextVideoJob } from '../../src/lib/video/process-video-job'
import { registro } from './stub-servidor'

processNextVideoJob().then(
  (resultado) => {
    fs.writeFileSync(process.env.PROVA_RESULTADO as string, JSON.stringify({ resultado, fieldValues: registro.fieldValues }))
    process.exit(resultado.outcome === 'completed' ? 0 : 1)
  },
  (erro) => {
    console.error(erro)
    process.exit(1)
  },
)
