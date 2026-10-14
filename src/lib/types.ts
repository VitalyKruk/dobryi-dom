export type Species = "cat" | "dog"
export type Sex = "male" | "female"
export type PetSize = "small" | "medium" | "large"
export type Coat = "short" | "long" | "none"
export type Compat = "yes" | "no" | "unknown"
/** adopted не показывается в каталоге, но считается в статистике */
export type PetStatus = "available" | "reserved" | "adopted"

export type Pet = {
  id: string
  name: string
  species: Species
  sex: Sex
  birthDate: string
  breed: string
  size: PetSize
  coat: Coat
  weightKg: number
  photos: string[]
  traits: string[]
  vaccinated: boolean
  sterilized: boolean
  chipped: boolean
  specialNeeds?: string
  goodWithKids: Compat
  goodWithCats: Compat
  goodWithDogs: Compat
  story: string
  careNotes: string
  /** видно только персоналу */
  internalNotes?: string
  status: PetStatus
  addedAt: string
  /** когда уехал домой — ставит сервер при статусе adopted */
  adoptedAt?: string
}

export type ApplicationStatus = "pending" | "approved" | "rejected" | "cancelled"
export type Housing = "apartment" | "house" | "other"
export type Experience = "none" | "some" | "experienced"
export type VisitTime = "weekday-morning" | "weekday-evening" | "weekend"

export type StaffComment = { author: string; text: string; at: string }

export type Application = {
  id: string
  petId: string
  userId?: string
  name: string
  phone: string
  email: string
  city: string
  housing: Housing
  hasOtherPets: boolean
  otherPetsNote?: string
  /** дети до 10 лет; в старых заявках поля нет */
  hasKids?: boolean
  experience: Experience
  comment?: string
  preferredTime: VisitTime
  status: ApplicationStatus
  staffComments: StaffComment[]
  createdAt: string
  /** когда заявку одобрили, отклонили или отозвали */
  decidedAt?: string
}

export type Role = "user" | "volunteer" | "admin"

export type NotifySettings = {
  newPets: boolean
  applicationUpdates: boolean
  email: boolean
}

export type User = {
  id: string
  name: string
  email: string
  phone?: string
  city?: string
  role: Role
  favorites: string[]
  notify: NotifySettings
}

export type VolunteerRole = "walker" | "caretaker" | "photographer" | "driver"
export type ShiftSlot = "morning" | "evening"
export type Shift = { day: number; slot: ShiftSlot }

export type Volunteer = {
  id: string
  name: string
  phone: string
  email: string
  role: VolunteerRole
  shifts: Shift[]
}

export type AgeRange = "baby" | "adult" | "senior"
export type SortKey = "newest" | "oldest" | "age-asc" | "age-desc"

export type PetFilters = {
  q?: string
  species?: Species[]
  age?: AgeRange[]
  size?: PetSize[]
  sex?: Sex[]
  coat?: Coat[]
  health?: ("vaccinated" | "sterilized" | "specialNeeds")[]
  compat?: ("kids" | "cats" | "dogs")[]
  status?: Exclude<PetStatus, "adopted">[]
  sort?: SortKey
}

// ——— Аналитика дашборда (считает server/analytics.ts) ———

export type WeekPoint = {
  /** начало недели (понедельник), ISO */
  start: string
  total: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  /** уехали домой за неделю */
  adopted: number
}

export type Insight = { tone: "warning" | "info" | "success"; title: string; text: string; link?: string }

export type PetRef = { id: string; name: string; photo: string; species: Species; value: number }

export type Analytics = {
  weeks: WeekPoint[]
  totals: {
    applications: number
    /** заявок за 4 последние недели и за 4 недели до них — для тренда */
    last4: number
    prev4: number
    approvalRate: number
    /** отказов за период — база для долей причин */
    rejected: number
    avgDecisionDays: number | null
    avgDaysToHome: number | null
    adopted: number
  }
  funnel: { label: string; value: number }[]
  species: { species: Species; waiting: number; applications: number }[]
  rejectReasons: { reason: string; count: number }[]
  topPets: PetRef[]
  forgotten: PetRef[]
  insights: Insight[]
}

/** Открытые данные для инвесторов: только обезличенные агрегаты, без имён и контактов */
export type InvestorReport = {
  generatedAt: string
  /** пристроено до запуска сайта — из архива приюта, в базе сайта этих питомцев нет */
  adoptedBeforeSite: number
  pets: { adoptedOnSite: number; waiting: number; available: number; reserved: number }
  volunteers: number
  /** все заявки в базе и дата самой ранней — с неё начинаются данные */
  applicationsAllTime: number
  dataSince: string | null
  weeks: WeekPoint[]
  totals: Analytics["totals"]
  funnel: Analytics["funnel"]
  species: Analytics["species"]
}

// ——— Журнал действий (аудит) ———

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.login_locked"
  | "auth.register"
  | "application.create"
  | "application.status"
  | "application.comment"
  | "application.cancel"
  | "pet.create"
  | "pet.update"
  | "pet.delete"
  | "pet.status"
  | "user.role"
  | "volunteers.update"
  | "data.reset"

export type AuditEntry = {
  id: string
  at: string
  /** кто сделал; null — гость или неудачный вход */
  actor: { id?: string; name: string; role?: Role } | null
  action: AuditAction
  target?: { type: "pet" | "application" | "user" | "volunteers" | "data"; id?: string; label?: string }
  /** коротко, что изменилось: «на рассмотрении → одобрена» */
  details?: string
}
