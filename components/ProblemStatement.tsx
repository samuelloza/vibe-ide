import { useIDEStore } from '@/store/ide-store';
import { RichProblemContent } from '@/components/RichProblemContent';

export function ProblemStatementContent({ compact = false }: { readonly compact?: boolean }) {
  const problem = useIDEStore((state) => state.problem);
  const textClassName = compact ? 'space-y-3 text-xs leading-5' : 'space-y-4 text-sm leading-6';
  const sample = problem.sampleCases[0];

  return (
    <div className={`${textClassName} text-slate-300`}>
      <section>
        <h4 className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Descripción</h4>
        <RichProblemContent html={problem.description || 'Sin descripción.'} className="prose prose-invert max-w-none text-slate-300" />
      </section>
      <section>
        <h4 className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Entrada</h4>
        <RichProblemContent html={problem.inputSpec || 'Sin especificación de entrada.'} />
      </section>
      <section>
        <h4 className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Salida</h4>
        <RichProblemContent html={problem.outputSpec || 'Sin especificación de salida.'} />
      </section>
      {problem.hint ? (
        <section>
          <h4 className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Pista</h4>
          <RichProblemContent html={problem.hint} />
        </section>
      ) : null}
      {sample ? (
        <section className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <h4 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Ejemplo de Entrada</h4>
            <pre className="font-mono text-sky-100">{sample.input}</pre>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <h4 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-100">Ejemplo de Salida</h4>
            <pre className="font-mono text-emerald-100">{sample.output}</pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}
