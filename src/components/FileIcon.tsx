import { Folder, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'

import { getFileIcon } from '../utils/getFileIcon'

// One icon for a listing entry: a folder, or the icon matching the file extension.
// The element is built with createElement because the icon depends on props, and a
// component aliased during render would be treated as a new component every time.
export default function FileIcon({
  name,
  folder,
  video,
  className,
}: {
  name: string
  folder?: boolean
  video?: boolean
  className?: string
}) {
  const icon: LucideIcon = folder ? Folder : getFileIcon(name, { video })
  return createElement(icon, { className })
}
