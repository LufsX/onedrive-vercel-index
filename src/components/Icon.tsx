import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  icon: IconDefinition
  size?: 'lg' | '2x'
  title?: string
}

export const FontAwesomeIcon = ({ icon, size, title, className, ...props }: IconProps) => {
  const [width, height, , , path] = icon.icon
  const paths = typeof path === 'string' ? [path] : path
  const hasAccessibleName = Boolean(title || props['aria-label'] || props['aria-labelledby'])

  return (
    <svg
      data-prefix={icon.prefix}
      data-icon={icon.iconName}
      className={['svg-inline--fa', `fa-${icon.iconName}`, className, size && `fa-${size}`].filter(Boolean).join(' ')}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden={!hasAccessibleName}
      {...props}
    >
      {title && <title>{title}</title>}
      {paths.map((d, index) => (
        <path key={index} fill="currentColor" d={d} />
      ))}
    </svg>
  )
}
