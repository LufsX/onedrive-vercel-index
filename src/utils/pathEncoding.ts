/**
 * Dynamic route segments arrive still percent-encoded (they are not decoded by
 * the framework before they reach `params`), while everything downstream —
 * breadcrumbs, links and Graph API paths — works with plain segments.
 */
export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function decodePathSegments(segments: string[] | undefined): string[] {
  return (segments ?? []).map(decodePathSegment)
}
