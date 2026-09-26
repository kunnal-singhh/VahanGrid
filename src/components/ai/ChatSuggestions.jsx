import { Navigation, Tag, WifiOff, CreditCard } from 'lucide-react';

export const PROMPT_SUGGESTIONS = [
  {
    text: 'Can I reach Noida with 35% battery?',
    icon: Navigation,
    color: 'text-sky-400',
    border: 'border-sky-500/20 hover:border-sky-500/40 bg-sky-500/[.04]',
  },
  {
    text: 'Which charger is cheapest on Yamuna Expressway?',
    icon: Tag,
    color: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-500/40 bg-amber-500/[.04]',
  },
  {
    text: 'How does offline charging work in remote areas?',
    icon: WifiOff,
    color: 'text-violet-400',
    border: 'border-violet-500/20 hover:border-violet-500/40 bg-violet-500/[.04]',
  },
  {
    text: 'How does VahanPass cross-network roaming work?',
    icon: CreditCard,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/[.04]',
  },
];

export default function ChatSuggestions({ onSelectPrompt }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {PROMPT_SUGGESTIONS.map(({ text, icon: Icon, color, border }) => (
        <button
          key={text}
          onClick={() => onSelectPrompt(text)}
          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${border}`}
        >
          <Icon className={`w-4 h-4 shrink-0 ${color}`} />
          <span className="text-slate-300 font-medium truncate">{text}</span>
        </button>
      ))}
    </div>
  );
}
