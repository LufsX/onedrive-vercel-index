export type BrandMark = { title: string; path: string }

// Simple Icons ships filled 24x24 brand marks, so a brand link renders without
// pulling the whole icon set into the browser bundle.
export default function BrandIcon({ mark, className }: { mark: BrandMark; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} role="img" aria-label={mark.title}>
      <path d={mark.path} />
    </svg>
  )
}
