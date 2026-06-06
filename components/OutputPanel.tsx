'use client';

import { motion } from 'framer-motion';
import { VerdictBadge } from '@/components/VerdictBadge';
import { useIDEStore } from '@/store/ide-store';

function OutputBlock({ title, value, tone = 'slate', className = '' }: { title: string; value: string; tone?: 'slate' | 'red' | 'amber' | 'sky'; className?: string }) {
  const toneClass = {
    slate: 'text-slate-300',
    red: 'text-red-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
  }[tone];

  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-950/70 ${className}`}>
      <div className="shrink-0 border-b border-slate-800 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <pre className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 ${toneClass}`}>{value || 'Sin contenido'}</pre>
    </div>
  );
}

export function OutputPanel() {
  const execution = useIDEStore((state) => state.execution);
  const logs = execution.logs.join('\n');

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/80">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resultado</span>
        <VerdictBadge verdict={execution.verdict} />
      </header>
      <motion.div layout className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-2 lg:grid-rows-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <OutputBlock title="Salida estándar" value={execution.stdout} tone="sky" className="lg:row-span-2" />
        <OutputBlock title="Registro" value={logs} />
        <div className="grid min-h-0 gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <OutputBlock title="Errores" value={execution.stderr} tone="red" />
          <OutputBlock title="Compilación" value={execution.compileErrors} tone="amber" />
        </div>
      </motion.div>
    </section>
  );
}
