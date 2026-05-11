import { toast } from 'sonner'
import { playPing, playAlert, playThud } from './audio'
import { useUIStore } from '@/store/uiStore'

/**
 * Forensic Notification System
 * Orchestrates visual toasts with synchronized audio signals.
 */

const getSoundEnabled = () => useUIStore.getState().soundEnabled;

export const forensicNotify = {
  /**
   * Standard telemetry signal (Information/Success)
   */
  signal: (message: string, description?: string) => {
    if (getSoundEnabled()) playPing();
    toast.success(message, {
      description,
      className: 'nodal-glass border-white/5 font-sans',
    });
  },

  /**
   * Forensic error or liability warning
   */
  warn: (message: string, description?: string) => {
    if (getSoundEnabled()) playAlert();
    toast.error(message, {
      description,
      className: 'nodal-glass border-red-500/20 text-red-400 font-sans',
    });
  },

  /**
   * Subtle background update or thud
   */
  update: (message: string, description?: string) => {
    if (getSoundEnabled()) playThud();
    toast(message, {
      description,
      className: 'nodal-glass border-white/5 font-sans',
    });
  },
};
