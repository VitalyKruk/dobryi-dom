import { PageHeader } from "@/components/page-header"
import { MatchFinder } from "@/components/match"

export default function MatchPage() {
  return (
    <>
      <PageHeader
        title="Подбор питомца"
        subtitle="Пять вопросов — и мы покажем, кому у вас будет хорошо. Для каждого объясним, почему он подходит."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Каталог", to: "/catalog" }, { label: "Подбор" }]}
      />
      <div className="container-page py-8 md:py-12">
        <MatchFinder />
      </div>
    </>
  )
}
