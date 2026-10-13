/* Простые SVG-иллюстрации в палитре: голубой фон, тёплый контур, жёлтые акценты */

type Props = { className?: string }

export function PawIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <ellipse cx="6" cy="9" rx="2.2" ry="2.8" />
      <ellipse cx="10" cy="5.5" rx="2.2" ry="2.8" />
      <ellipse cx="14" cy="5.5" rx="2.2" ry="2.8" />
      <ellipse cx="18" cy="9" rx="2.2" ry="2.8" />
      <path d="M12 11c-3.2 0-6.5 4.2-6.5 6.8 0 1.8 1.4 2.7 3.1 2.7 1.3 0 2.2-.6 3.4-.6s2.1.6 3.4.6c1.7 0 3.1-.9 3.1-2.7C18.5 15.2 15.2 11 12 11Z" />
    </svg>
  )
}

/** Грустный щенок — 404 и ошибки */
export function SadDog({ className }: Props) {
  return (
    <svg viewBox="0 0 240 200" aria-hidden="true" className={className}>
      <ellipse cx="120" cy="184" rx="80" ry="10" fill="#D6E4F0" />
      <path d="M70 120c0-38 22-64 50-64s50 26 50 64-22 60-50 60-50-22-50-60Z" fill="#F2E3CC" stroke="#3A3630" strokeWidth="4" />
      <path
        d="M72 80c-18 4-26 34-18 58 4 12 16 8 18-4l6-40c2-10-2-15-6-14Z"
        fill="#C79A6B"
        stroke="#3A3630"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M168 80c18 4 26 34 18 58-4 12-16 8-18-4l-6-40c-2-10 2-15 6-14Z"
        fill="#C79A6B"
        stroke="#3A3630"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M98 112c4-4 10-4 14 0M128 112c4-4 10-4 14 0" stroke="#3A3630" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="120" cy="134" rx="10" ry="7" fill="#3A3630" />
      <path d="M108 154c8-6 16-6 24 0" stroke="#3A3630" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M144 124c0 6-3 10-3 10" stroke="#5B7FA6" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Кот в коробке — пустые состояния */
export function CatInBox({ className }: Props) {
  return (
    <svg viewBox="0 0 240 200" aria-hidden="true" className={className}>
      <ellipse cx="120" cy="186" rx="84" ry="10" fill="#D6E4F0" />
      <path d="M84 104 76 64l26 22M156 104l8-40-26 22" fill="#F2E3CC" stroke="#3A3630" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="120" cy="110" r="42" fill="#F2E3CC" stroke="#3A3630" strokeWidth="4" />
      <circle cx="104" cy="106" r="5" fill="#3A3630" />
      <circle cx="136" cy="106" r="5" fill="#3A3630" />
      <path d="M114 122l6 4 6-4" stroke="#3A3630" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 124h140l-10 56H60Z" fill="#A9C6E0" stroke="#3A3630" strokeWidth="4" strokeLinejoin="round" />
      <path d="M50 124l-14-18h52l12 18M190 124l14-18h-52l-12 18" fill="#D6E4F0" stroke="#3A3630" strokeWidth="4" strokeLinejoin="round" />
      <path d="M110 150h20" stroke="#3A3630" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Сердце с лапкой — успешная отправка */
export function HappyHeart({ className }: Props) {
  return (
    <svg viewBox="0 0 240 200" aria-hidden="true" className={className}>
      <circle cx="120" cy="100" r="88" fill="#D6E4F0" />
      <path
        d="M120 164s-58-34-58-78c0-20 15-34 33-34 11 0 20 6 25 14 5-8 14-14 25-14 18 0 33 14 33 34 0 44-58 78-58 78Z"
        fill="#FFC629"
        stroke="#3A2A00"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <g fill="#3A2A00" transform="translate(96 76) scale(2)">
        <ellipse cx="6" cy="9" rx="2.2" ry="2.8" />
        <ellipse cx="10" cy="5.5" rx="2.2" ry="2.8" />
        <ellipse cx="14" cy="5.5" rx="2.2" ry="2.8" />
        <ellipse cx="18" cy="9" rx="2.2" ry="2.8" />
        <path d="M12 11c-3.2 0-6.5 4.2-6.5 6.8 0 1.8 1.4 2.7 3.1 2.7 1.3 0 2.2-.6 3.4-.6s2.1.6 3.4.6c1.7 0 3.1-.9 3.1-2.7C18.5 15.2 15.2 11 12 11Z" />
      </g>
    </svg>
  )
}
