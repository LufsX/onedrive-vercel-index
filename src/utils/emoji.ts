// Unicode's recommended-for-general-interchange emoji set, anchored to the start of a name.
// \p{RGI_Emoji} needs the ES2024 v flag; engines without it fall back to emoji presentation.
const leadingEmoji = (() => {
  try {
    return new RegExp('^\\p{RGI_Emoji}', 'v')
  } catch {
    return new RegExp('^\\p{Emoji_Presentation}', 'u')
  }
})()

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The emoji starting a name, including joined and skin tone sequences. */
export function firstEmoji(name: string): string | undefined {
  const first = Array.from(graphemes.segment(name))[0]
  if (!first || !leadingEmoji.test(first.segment)) return undefined
  return first.segment
}
