import { Fragment } from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import {
  STORY_HORIZONTAL_GUIDES,
  STORY_VERTICAL_GUIDES,
  isStoryFormat,
} from '@/lib/editor/story-guides'
import type { KonvaPage } from '@/types/template'

interface StoryGuideLinesProps {
  page: KonvaPage
  zoom: number
}

function GuideLabel({
  x,
  y,
  text,
  color,
  fontSize,
  padding,
}: {
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  padding: number
}) {
  const charWidth = fontSize * 0.6
  const bgWidth = text.length * charWidth + padding * 2
  const bgHeight = fontSize + padding * 2

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={bgWidth}
        height={bgHeight}
        fill="#000000"
        opacity={0.5}
        cornerRadius={2 / fontSize}
      />
      <Text
        x={x + padding}
        y={y + padding}
        text={text}
        fontSize={fontSize}
        fill={color}
        opacity={0.8}
      />
    </>
  )
}

export function StoryGuideLines({ page, zoom }: StoryGuideLinesProps) {
  if (!isStoryFormat(page.width, page.height)) {
    return null
  }

  const strokeWidth = 1 / zoom
  const dash = [12 / zoom, 8 / zoom]
  const labelFontSize = Math.max(10 / zoom, 8)
  const labelPadding = 4 / zoom

  return (
    <Group listening={false}>
      {STORY_HORIZONTAL_GUIDES.map((guide) => (
        <Fragment key={`h-${guide.position}`}>
          <Line
            points={[0, guide.position, page.width, guide.position]}
            stroke={guide.color}
            strokeWidth={strokeWidth}
            dash={dash}
            opacity={0.4}
          />
          <GuideLabel
            x={labelPadding}
            y={guide.position + labelPadding}
            text={guide.label}
            color={guide.color}
            fontSize={labelFontSize}
            padding={labelPadding}
          />
        </Fragment>
      ))}

      {STORY_VERTICAL_GUIDES.map((guide) => (
        <Fragment key={`v-${guide.position}`}>
          <Line
            points={[guide.position, 0, guide.position, page.height]}
            stroke={guide.color}
            strokeWidth={strokeWidth}
            dash={dash}
            opacity={0.4}
          />
          <GuideLabel
            x={guide.position + labelPadding}
            y={labelPadding}
            text={guide.label}
            color={guide.color}
            fontSize={labelFontSize}
            padding={labelPadding}
          />
        </Fragment>
      ))}
    </Group>
  )
}
