import { describe, expect, test } from 'bun:test'

import { GLYPH_CHARS } from '../types'
import { parseProject, serializeProject } from './svg-io'

import type { Glyph, ProjectSettings } from '../types'

const baseSettings: ProjectSettings = {
  fontName: 'Test',
  unitsPerEm: 1000,
  ascender: 750,
  descender: -200,
  capHeight: 700,
  xHeight: 500,
  bezierPresets: [
    { name: 'default', value: 0.5 },
    { name: 'sharp', value: 0.05 },
  ],
  snapAngles: [0, 45, 90, 135, 180, 225, 270, 315],
  gridSize: 50,
  gridVisible: true,
  gridSnap: false,
}

const emptyGlyphs = (): Record<string, Glyph> => {
  const out: Record<string, Glyph> = {}
  for (const ch of GLYPH_CHARS) out[ch] = { char: ch, advanceWidth: 600, shapes: [] }
  return out
}

describe('serializeProject + parseProject', () => {
  test('round-trips an empty project', () => {
    const svg = serializeProject(baseSettings, emptyGlyphs())
    const { settings, glyphs } = parseProject(svg)
    expect(settings.fontName).toBe('Test')
    expect(settings.bezierPresets).toEqual(baseSettings.bezierPresets)
    expect(Object.keys(glyphs)).toContain('A')
    expect(glyphs.A.shapes).toEqual([])
  })

  test('round-trips a glyph with one contour + bezier refs', () => {
    const glyphs = emptyGlyphs()
    glyphs.A = {
      char: 'A',
      advanceWidth: 700,
      shapes: [
        {
          id: 'shape-1',
          points: [
            [50, 0],
            [350, 700],
            [650, 0],
          ],
          bezierRef: 'sharp',
          pointBezierRefs: { 1: 'default' },
        },
      ],
    }
    const svg = serializeProject(baseSettings, glyphs)
    const round = parseProject(svg)
    expect(round.glyphs.A.advanceWidth).toBe(700)
    expect(round.glyphs.A.shapes).toHaveLength(1)
    const s = round.glyphs.A.shapes[0]
    expect(s.points).toEqual([
      [50, 0],
      [350, 700],
      [650, 0],
    ])
    expect(s.bezierRef).toBe('sharp')
    expect(s.pointBezierRefs?.[1]).toBe('default')
  })

  test('parse throws on malformed XML', () => {
    expect(() => parseProject('<not-svg></broken')).toThrow()
  })
})
