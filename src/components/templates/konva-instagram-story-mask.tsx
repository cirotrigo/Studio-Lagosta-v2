"use client"

import * as React from 'react'
import { Group, Rect, Circle, Text, Path, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { useProject, useProjectLogo } from '@/hooks/use-project'
import {
  STORY_ICON_PATHS,
  STORY_REFERENCE_WIDTH,
  buildStoryChrome,
  isStoryRatio,
} from '@/lib/instagram-story-chrome'

/**
 * Máscara de referência: desenha a interface do story do Instagram por cima da
 * arte, para o usuário ver o que a foto de perfil, o @ e a caixa "Enviar
 * mensagem" vão cobrir. Ligada/desligada com `M`.
 *
 * **Vive dentro da `guides-layer`** — é o que a mantém fora de TODA exportação
 * (download, thumbnail da página, export de vídeo), porque todos os caminhos de
 * export escondem essa layer pelo nome. Mover para outra layer faria a máscara
 * vazar para a arte publicada.
 *
 * O render server-side (`render-engine`) nunca vê isto: ele desenha a partir do
 * JSON de `Page.layers`, e a máscara não é uma camada.
 *
 * Sem gradiente por trás: o chrome cabe dentro das margens de segurança e a
 * legibilidade sobre foto clara fica por conta de uma sombra discreta.
 */

const CHROME_FONT = 'Inter, -apple-system, "Helvetica Neue", Arial, sans-serif'
const WHITE = '#FFFFFF'
const WHITE_DIM = 'rgba(255,255,255,0.75)'

/** Sombra suave: sem ela o chrome branco some em foto clara. */
const SHADOW = {
  shadowColor: '#000000',
  shadowBlur: 6,
  shadowOpacity: 0.45,
  shadowOffset: { x: 0, y: 1 },
} as const

/** Mede o texto sem montar o node, para posicionar o horário depois do @. */
let measureCtx: CanvasRenderingContext2D | null = null
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return 0
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

interface KonvaInstagramStoryMaskProps {
  projectId: number
  canvasWidth: number
  canvasHeight: number
}

export function KonvaInstagramStoryMask({
  projectId,
  canvasWidth,
  canvasHeight,
}: KonvaInstagramStoryMaskProps) {
  const isStory = isStoryRatio(canvasWidth, canvasHeight)

  const { data: project } = useProject(isStory ? projectId : null)
  const { data: logo } = useProjectLogo(projectId, isStory)
  const [logoImage] = useImage(logo?.fileUrl ?? '', 'anonymous')

  const username = project?.instagramUsername || project?.name || 'sua_conta'

  // Tudo é descrito em 1080x1920 e escalado pela largura; num canvas 9:16 a
  // escala vertical é a mesma, então um fator só basta
  const s = canvasWidth / STORY_REFERENCE_WIDTH
  const baseHeight = canvasHeight / s

  const chrome = React.useMemo(() => buildStoryChrome(baseHeight), [baseHeight])

  const usernameWidth = React.useMemo(
    () => measureTextWidth(username, `bold ${chrome.username.fontSize}px ${CHROME_FONT}`),
    [username, chrome.username.fontSize],
  )

  if (!isStory) return null

  const { progressBar, avatar, username: user, timestamp, moreIcon, closeIcon } = chrome
  const { replyBox, heartIcon, shareIcon } = chrome

  const segmentWidth =
    (progressBar.width - progressBar.gap * (progressBar.segments - 1)) / progressBar.segments

  // Logo "contida" no círculo: a proporção é preservada, então logo larga
  // (TERO) não vira um recorte ilegível
  const logoBox = (() => {
    if (!logoImage?.width || !logoImage?.height) return null
    const max = avatar.radius * 2 * avatar.logoFit
    const scale = Math.min(max / logoImage.width, max / logoImage.height)
    const width = logoImage.width * scale
    const height = logoImage.height * scale
    return { width, height, x: avatar.cx - width / 2, y: avatar.cy - height / 2 }
  })()

  return (
    <Group scaleX={s} scaleY={s} listening={false}>
      {/* Barra de progresso */}
      {Array.from({ length: progressBar.segments }).map((_, index) => (
        <Rect
          key={`segment-${index}`}
          x={progressBar.x + index * (segmentWidth + progressBar.gap)}
          y={progressBar.y}
          width={segmentWidth}
          height={progressBar.height}
          cornerRadius={progressBar.height / 2}
          fill={WHITE}
          opacity={index === progressBar.activeIndex ? 1 : 0.45}
          listening={false}
          {...SHADOW}
        />
      ))}

      {/* Foto de perfil: fundo branco porque as logos são transparentes e
          escuras ou coloridas — logo branca é o único caso que sofre */}
      <Circle
        x={avatar.cx}
        y={avatar.cy}
        radius={avatar.radius}
        fill="#FFFFFF"
        stroke={WHITE}
        strokeWidth={2}
        listening={false}
        {...SHADOW}
      />
      {logoBox && logoImage ? (
        <Group
          clipFunc={(ctx) => {
            ctx.arc(avatar.cx, avatar.cy, avatar.radius, 0, Math.PI * 2, false)
          }}
          listening={false}
        >
          <KonvaImage
            image={logoImage}
            x={logoBox.x}
            y={logoBox.y}
            width={logoBox.width}
            height={logoBox.height}
            listening={false}
            perfectDrawEnabled={false}
          />
        </Group>
      ) : (
        <Text
          text={(username[0] ?? '?').toUpperCase()}
          x={avatar.cx - avatar.radius}
          y={avatar.cy - avatar.radius}
          width={avatar.radius * 2}
          height={avatar.radius * 2}
          align="center"
          verticalAlign="middle"
          fontSize={avatar.radius}
          fontStyle="bold"
          fontFamily={CHROME_FONT}
          fill="#262626"
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* @ da conta */}
      <Text
        text={username}
        x={user.x}
        y={user.cy - user.fontSize}
        height={user.fontSize * 2}
        verticalAlign="middle"
        fontSize={user.fontSize}
        fontStyle="bold"
        fontFamily={CHROME_FONT}
        fill={WHITE}
        listening={false}
        {...SHADOW}
      />
      <Text
        text={timestamp.text}
        x={user.x + usernameWidth + timestamp.gap}
        y={user.cy - timestamp.fontSize}
        height={timestamp.fontSize * 2}
        verticalAlign="middle"
        fontSize={timestamp.fontSize}
        fontFamily={CHROME_FONT}
        fill={WHITE_DIM}
        listening={false}
        {...SHADOW}
      />

      {/* "..." e "✕" */}
      {[-1, 0, 1].map((offset) => (
        <Circle
          key={`dot-${offset}`}
          x={moreIcon.cx + offset * moreIcon.dotGap}
          y={moreIcon.cy}
          radius={moreIcon.dotRadius}
          fill={WHITE}
          listening={false}
          {...SHADOW}
        />
      ))}
      <Path
        data={STORY_ICON_PATHS.close}
        x={closeIcon.cx - closeIcon.size / 2}
        y={closeIcon.cy - closeIcon.size / 2}
        scaleX={closeIcon.size / 24}
        scaleY={closeIcon.size / 24}
        stroke={WHITE}
        strokeWidth={2.2}
        lineCap="round"
        listening={false}
        {...SHADOW}
      />

      {/* Caixa "Enviar mensagem" */}
      <Rect
        x={replyBox.x}
        y={replyBox.y}
        width={replyBox.width}
        height={replyBox.height}
        cornerRadius={replyBox.height / 2}
        stroke={WHITE}
        strokeWidth={2.5}
        opacity={0.95}
        listening={false}
        {...SHADOW}
      />
      <Text
        text={replyBox.placeholder}
        x={replyBox.x + replyBox.paddingX}
        y={replyBox.y}
        height={replyBox.height}
        verticalAlign="middle"
        fontSize={replyBox.fontSize}
        fontFamily={CHROME_FONT}
        fill={WHITE_DIM}
        listening={false}
        {...SHADOW}
      />
      <Path
        data={STORY_ICON_PATHS.heart}
        x={heartIcon.cx - heartIcon.size / 2}
        y={heartIcon.cy - heartIcon.size / 2}
        scaleX={heartIcon.size / 24}
        scaleY={heartIcon.size / 24}
        stroke={WHITE}
        strokeWidth={1.9}
        lineCap="round"
        lineJoin="round"
        listening={false}
        {...SHADOW}
      />
      <Path
        data={STORY_ICON_PATHS.share}
        x={shareIcon.cx - shareIcon.size / 2}
        y={shareIcon.cy - shareIcon.size / 2}
        scaleX={shareIcon.size / 24}
        scaleY={shareIcon.size / 24}
        stroke={WHITE}
        strokeWidth={1.9}
        lineCap="round"
        lineJoin="round"
        listening={false}
        {...SHADOW}
      />
    </Group>
  )
}
