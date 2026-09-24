import { lazy, Suspense } from "react"
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ScrollManager, SiteLayout } from "@/components/layout/site-layout"
import { RequireAuth } from "@/components/require-auth"
import { AuthProvider } from "@/context/auth"
import HomePage from "@/pages/home"
import CatalogPage from "@/pages/catalog"
import PetPage from "@/pages/pet"
import ApplyPage from "@/pages/apply"
import AboutPage from "@/pages/about"
import HelpPage from "@/pages/help"
import AccountPage, { GuestFavoritesPage } from "@/pages/account"
import { LoginPage, RegisterPage } from "@/pages/auth"
import { ContactsPage, FaqPage, PrivacyPage } from "@/pages/info"
import NotFoundPage from "@/pages/not-found"

// Админка грузится отдельным чанком — посетителям сайта она не нужна
const AdminLayout = lazy(() => import("@/components/layout/admin-layout").then((m) => ({ default: m.AdminLayout })))
const DashboardPage = lazy(() => import("@/pages/admin/dashboard"))
const AdminPetsPage = lazy(() => import("@/pages/admin/pets"))
const PetFormPage = lazy(() => import("@/pages/admin/pet-form"))
const AdminApplicationsPage = lazy(() => import("@/pages/admin/applications"))
const AdminVolunteersPage = lazy(() => import("@/pages/admin/volunteers"))

function Root() {
  return (
    <>
      <ScrollManager />
      <Outlet />
    </>
  )
}

const adminFallback = (
  <div className="flex min-h-svh gap-8 p-8">
    <Skeleton className="hidden h-full w-64 rounded-3xl lg:block" />
    <Skeleton className="h-96 flex-1 rounded-3xl" />
  </div>
)

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <SiteLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "catalog", element: <CatalogPage /> },
          { path: "pet/:id", element: <PetPage /> },
          { path: "apply/:petId", element: <ApplyPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "help", element: <HelpPage /> },
          { path: "contacts", element: <ContactsPage /> },
          { path: "faq", element: <FaqPage /> },
          { path: "privacy", element: <PrivacyPage /> },
          { path: "favorites", element: <GuestFavoritesPage /> },
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
          {
            path: "account",
            element: (
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            ),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      {
        path: "admin",
        element: (
          <RequireAuth permission="admin.access">
            <Suspense fallback={adminFallback}>
              <AdminLayout />
            </Suspense>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "pets", element: <AdminPetsPage /> },
          {
            path: "pets/new",
            element: (
              <RequireAuth permission="pets.edit">
                <PetFormPage />
              </RequireAuth>
            ),
          },
          {
            path: "pets/:id/edit",
            element: (
              <RequireAuth permission="pets.edit">
                <PetFormPage />
              </RequireAuth>
            ),
          },
          {
            path: "applications",
            element: (
              <RequireAuth permission="applications.view">
                <AdminApplicationsPage />
              </RequireAuth>
            ),
          },
          {
            path: "volunteers",
            element: (
              <RequireAuth permission="volunteers.manage">
                <AdminVolunteersPage />
              </RequireAuth>
            ),
          },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <Suspense fallback={adminFallback}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  )
}
