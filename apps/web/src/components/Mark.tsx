export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M2 16 H9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M9 16 C12 16 12 10 16 10 C20 10 20 16 23 16"
        stroke="var(--teal)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M9 16 C12 16 12 22 16 22 C20 22 20 16 23 16"
        stroke="var(--amber)"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path d="M23 16 H30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="14.6" y="14.6" width="2.8" height="2.8" transform="rotate(45 16 16)" fill="var(--red)" />
    </svg>
  );
}
