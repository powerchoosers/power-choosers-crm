'use client'
import { LucideIcon } from 'lucide-react';

interface OperationalButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}

export default function OperationalButton({ icon: Icon, label, onClick }: OperationalButtonProps) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-800/50 border border-white/5 hover:bg-zinc-700/50 hover:border-[#002FA7]/50 transition-all group"
    >
      <Icon className="w-5 h-5 text-zinc-400 group-hover:text-[#002FA7] mb-2 transition-colors" />
      <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300 uppercase tracking-wider">{label}</span>
    </button>
  );
}
