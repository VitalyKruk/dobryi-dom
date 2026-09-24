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
  experience: Experience
  comment?: string
  preferredTime: VisitTime
  status: ApplicationStatus
  staffComments: StaffComment[]
  createdAt: string
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
