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
      className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-800/50 border border-white/5 hover:bg-zinc-800 transition-all group w-full hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.2)]"
      title={label}
    >
      <Icon className="w-5 h-5 mb-2 text-zinc-400 group-hover:text-white group-hover:scale-110 transition-all" />
      <span className="text-[10px] font-mono text-zinc-500 group-hover:text-white uppercase tracking-wider transition-colors duration-300">{label}</span>
    </button>
  );
}
