import { resolve, isAbsolute, sep } from 'node:path'

function decodeAndNormalize(p: string): string {
  // Decode URL-encoded characters (e.g. %2e -> ., %2f -> /, %5c -> \)
  let decoded = p
  try {
    decoded = decodeURIComponent(p)
  } catch {
    // invalid encoding, use as-is
  }
  // Normalize backslashes to forward slashes
  return decoded.replace(/\\/g, '/')
}

export function isSafePath(relativePath: string, baseDir: string): boolean {
  const normalized = decodeAndNormalize(relativePath)
  if (normalized.includes('..') || normalized.includes('\0') || isAbsolute(normalized)) {
    return false
  }
  const resolved = resolve(baseDir, normalized)
  return resolved.startsWith(resolve(baseDir) + sep) || resolved === resolve(baseDir)
}
