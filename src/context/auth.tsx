import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import * as api from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { readLS, writeLS } from "@/hooks/use-local-storage"

const GUEST_FAVS_KEY = "dd:favs"

// Остатки прототипа, когда «база» жила в браузере: данные теперь на сервере
for (const legacy of ["dd:db:v1", "dd:db:v2", "dd:session"]) writeLS(legacy, undefined)

type AuthContextValue = {
  user: User | null
  /** false, пока проверяем сохранённую сессию на сервере */
  ready: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: { name: string; email: string; password: string }) => Promise<User>
  logout: () => void
  updateProfile: (patch: Partial<Omit<User, "id" | "role" | "favorites">>) => Promise<void>
  favorites: string[]
  isFavorite: (petId: string) => boolean
  toggleFavorite: (petId: string, petName?: string) => void
  can: (action: Permission) => boolean
}

/**
 * Матрица доступа из PROMPT.md, раздел 5. Здесь она только прячет лишние кнопки —
 * настоящая проверка прав на сервере (server/auth.ts).
 */
export type Permission =
  "admin.access" | "pets.status" | "pets.edit" | "applications.view" | "applications.status" | "volunteers.manage" | "users.manage"

const permissions: Record<Role, Permission[]> = {
  user: [],
  volunteer: ["admin.access", "pets.status", "applications.view"],
  admin: ["admin.access", "pets.status", "pets.edit", "applications.view", "applications.status", "volunteers.manage", "users.manage"],
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(() => !api.getToken())
  const [guestFavs, setGuestFavs] = useState<string[]>(() => readLS(GUEST_FAVS_KEY, []))

  // Восстанавливаем сессию по сохранённому токену
  useEffect(() => {
    if (!api.getToken()) return
    api
      .getMe()
      .then(setUser)
      .catch(() => {
        // Токен недействителен (401 его уже стёр) или сервер недоступен — работаем как гость
      })
      .finally(() => setReady(true))
  }, [])

  const favorites = user ? user.favorites : guestFavs

  const startSession = useCallback((u: User) => {
    // Избранное гостя переносим в аккаунт
    const guest = readLS<string[]>(GUEST_FAVS_KEY, [])
    const merged = Array.from(new Set([...u.favorites, ...guest]))
    writeLS(GUEST_FAVS_KEY, undefined)
    setGuestFavs([])
    setUser({ ...u, favorites: merged })
    if (merged.length !== u.favorites.length) {
      api.saveFavorites(merged).then(setUser, () => toast.error("Не удалось перенести избранное в аккаунт"))
    }
    return u
  }, [])

  const login = useCallback(async (email: string, password: string) => startSession(await api.login(email, password)), [startSession])

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => startSession(await api.register(input)),
    [startSession],
  )

  const logout = useCallback(() => {
    setUser(null)
    api.logout().catch(() => {
      // токен уже стёрт локально; если сервер недоступен, сессия истечёт сама
    })
    toast("Вы вышли из аккаунта. Возвращайтесь 🐾")
  }, [])

  const updateProfile = useCallback(async (patch: Partial<Omit<User, "id" | "role" | "favorites">>) => {
    setUser(await api.updateProfile(patch))
  }, [])

  const toggleFavorite = useCallback(
    (petId: string, petName?: string) => {
      const has = favorites.includes(petId)
      const next = has ? favorites.filter((id) => id !== petId) : [...favorites, petId]
      if (user) {
        // Оптимистично: сердечко меняется сразу, при ошибке сервера откатываем
        const prev = user
        setUser({ ...user, favorites: next })
        api.saveFavorites(next).then(setUser, (e: Error) => {
          setUser(prev)
          toast.error(e.message)
        })
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
      ready,
      login,
      register,
      logout,
      updateProfile,
      favorites,
      isFavorite: (id) => favorites.includes(id),
      toggleFavorite,
      can: (action) => !!user && permissions[user.role].includes(action),
    }),
    [user, ready, login, register, logout, updateProfile, favorites, toggleFavorite],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
