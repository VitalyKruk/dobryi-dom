import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import * as api from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { readLS, writeLS } from "@/hooks/use-local-storage"

const SESSION_KEY = "dd:session"
const GUEST_FAVS_KEY = "dd:favs"

type AuthContextValue = {
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (input: { name: string; email: string; password: string }) => Promise<User>
  logout: () => void
  updateProfile: (patch: Partial<Omit<User, "id" | "role">>) => Promise<void>
  favorites: string[]
  isFavorite: (petId: string) => boolean
  toggleFavorite: (petId: string, petName?: string) => void
  can: (action: Permission) => boolean
}

/** Матрица доступа из PROMPT.md, раздел 5 */
export type Permission =
  | "admin.access"
  | "pets.status"
  | "pets.edit"
  | "applications.view"
  | "applications.status"
  | "volunteers.manage"
  | "users.manage"

const permissions: Record<Role, Permission[]> = {
  user: [],
  volunteer: ["admin.access", "pets.status", "applications.view"],
  admin: [
    "admin.access",
    "pets.status",
    "pets.edit",
    "applications.view",
    "applications.status",
    "volunteers.manage",
    "users.manage",
  ],
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const id = readLS<string | null>(SESSION_KEY, null)
    return id ? api.getUserSync(id) : null
  })
  const [guestFavs, setGuestFavs] = useState<string[]>(() => readLS(GUEST_FAVS_KEY, []))

  const favorites = user ? user.favorites : guestFavs

  const startSession = useCallback((u: User) => {
    // Избранное гостя переносим в аккаунт
    const merged = Array.from(new Set([...u.favorites, ...readLS<string[]>(GUEST_FAVS_KEY, [])]))
    if (merged.length !== u.favorites.length) api.saveFavoritesSync(u.id, merged)
    writeLS(GUEST_FAVS_KEY, undefined)
    setGuestFavs([])
    writeLS(SESSION_KEY, u.id)
    const withFavs = { ...u, favorites: merged }
    setUser(withFavs)
    return withFavs
  }, [])

  const login = useCallback(
    async (email: string, password: string) => startSession(await api.login(email, password)),
    [startSession],
  )

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => startSession(await api.register(input)),
    [startSession],
  )

  const logout = useCallback(() => {
    writeLS(SESSION_KEY, undefined)
    setUser(null)
    toast("Вы вышли из аккаунта. Возвращайтесь 🐾")
  }, [])

  const updateProfile = useCallback(
    async (patch: Partial<Omit<User, "id" | "role">>) => {
      if (!user) return
      setUser(await api.updateUser(user.id, patch))
    },
    [user],
  )

  const toggleFavorite = useCallback(
    (petId: string, petName?: string) => {
      const has = favorites.includes(petId)
      const next = has ? favorites.filter((id) => id !== petId) : [...favorites, petId]
      if (user) {
        api.saveFavoritesSync(user.id, next)
        setUser({ ...user, favorites: next })
      } else {
        writeLS(GUEST_FAVS_KEY, next)
        setGuestFavs(next)
      }
      toast(has ? "Убрали из избранного" : `${petName ?? "Питомец"} в избранном ❤️`)
    },
    [favorites, user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      register,
      logout,
      updateProfile,
      favorites,
      isFavorite: (id) => favorites.includes(id),
      toggleFavorite,
      can: (action) => !!user && permissions[user.role].includes(action),
    }),
    [user, login, register, logout, updateProfile, favorites, toggleFavorite],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
