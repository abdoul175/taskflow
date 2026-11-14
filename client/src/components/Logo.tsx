import { Check } from 'lucide-react';

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-950/50 ${className}`}
    >
      <Check className="h-[55%] w-[55%]" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
