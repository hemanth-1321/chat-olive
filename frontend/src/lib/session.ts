const KEY = 'ollive_username'

export function getUsername(): string | null {
  return localStorage.getItem(KEY)
}

export function setUsername(name: string) {
  localStorage.setItem(KEY, name)
}

export function getSessionId(): string {
  const name = getUsername()
  return name ? `${name}@olive` : ''
}
