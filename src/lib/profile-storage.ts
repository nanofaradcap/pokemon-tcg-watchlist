/**
 * Utility functions for managing profile preference across localStorage and cookies
 * This ensures server-side rendering can access the user's profile preference
 */

const PROFILE_STORAGE_KEY = 'watchlist:profile'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

/**
 * Get profile from localStorage (client-side only)
 */
export function getProfileFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PROFILE_STORAGE_KEY)
  } catch {
    // localStorage might be disabled or full
    return null
  }
}

/**
 * Get profile from cookies (works client-side and server-side)
 */
export function getProfileFromCookie(cookieString?: string): string | null {
  const cookies = cookieString || (typeof document !== 'undefined' ? document.cookie : '')
  if (!cookies) return null

  // Properly parse cookies - handle values that might contain '='
  const parts = cookies.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${PROFILE_STORAGE_KEY}=`)) {
      // Extract value after the '=' - this handles values with '=' in them
      return trimmed.substring(PROFILE_STORAGE_KEY.length + 1)
    }
  }
  return null
}

/**
 * Set profile in both localStorage and cookies
 */
export function setProfile(profile: string): void {
  if (typeof window === 'undefined') return

  try {
    // Store in localStorage
    window.localStorage.setItem(PROFILE_STORAGE_KEY, profile)
  } catch {
    // localStorage might be disabled or full - continue anyway
  }

  try {
    // Store in cookie (URL encode to handle special characters)
    const encoded = encodeURIComponent(profile)
    document.cookie = `${PROFILE_STORAGE_KEY}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    // Cookie setting might fail - continue anyway
  }
}

/**
 * Get profile preference, checking localStorage first, then cookies
 * Validates that the profile exists in the allowed profiles list
 */
export function getProfilePreference(
  allowedProfiles: readonly string[],
  cookieString?: string
): string {
  // Try localStorage first (client-side only)
  let profile = getProfileFromStorage()
  
  // Fallback to cookies if localStorage doesn't have it
  if (!profile) {
    profile = getProfileFromCookie(cookieString)
  }

  // Validate profile is in allowed list
  if (profile && allowedProfiles.includes(profile)) {
    // Sync cookie if we got it from localStorage but cookie might be missing
    if (typeof window !== 'undefined' && profile === getProfileFromStorage()) {
      const cookieValue = getProfileFromCookie()
      if (cookieValue !== profile) {
        setProfile(profile) // This will sync both storage mechanisms
      }
    }
    return profile
  }

  // Return first profile as default
  return allowedProfiles[0]
}

