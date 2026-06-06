'use client';

import { motion } from 'framer-motion';
import { VerdictBadge } from '@/components/VerdictBadge';
import type { Verdict } from '@/types/ide';

type JudgeResultDialogProps = {
  readonly open: boolean;
  readonly verdict: Verdict;
  readonly title: string;
  readonly message: string;
  readonly primaryActionLabel?: string;
  readonly showVerdictBadge?: boolean;
  readonly onPrimaryAction?: () => void;
  readonly onClose: () => void;
};

const verdictAccent: Record<Verdict, string> = {
  Accepted: 'border-emerald-500/50',
  'Wrong Answer': 'border-rose-500/50',
  'Compilation Error': 'border-amber-500/50',
  'Runtime Error': 'border-red-500/50',
  'Time Limit Exceeded': 'border-violet-500/50',
  Pending: 'border-sky-500/50',
  'Internal Error': 'border-slate-500/50',
};

export function JudgeResultDialog({ open, verdict, title, message, primaryActionLabel, showVerdictBadge = true, onPrimaryAction, onClose }: JudgeResultDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="judge-result-title">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className={`w-full max-w-xl overflow-hidden rounded-2xl border bg-slate-950 shadow-2xl ${verdictAccent[verdict]}`}
      >
        <div className="p-6 text-center md:p-8">
          {showVerdictBadge ? (
            <div className="mb-5 flex justify-center">
              <VerdictBadge verdict={verdict} />
            </div>
          ) : null}
          <h2 id="judge-result-title" className="text-2xl font-bold tracking-tight md:text-3xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-200">{message}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {primaryActionLabel && onPrimaryAction ? (
              <button
                onClick={onPrimaryAction}
                className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                {primaryActionLabel}
              </button>
            ) : null}
            <button onClick={onClose} className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:bg-white/10">
              Entendido
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
