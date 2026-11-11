import { fork, type ChildProcess } from 'child_process';
import os from 'os';

/**
 * Pool de processos filhos (cada um com o seu heap; o tsx carrega o TypeScript também nos filhos). Uma tarefa por
 * vez em cada filho, por mensagens (IPC). Usado na limpeza (um arquivo .xlsx por tarefa) e no processamento
 * (uma parte de 100 mil linhas por tarefa).
 */
export interface Progresso {
  tipo: 'progresso';
  chave: string;
  feito: number;
}

type Mensagem<R> = { tipo: 'fim'; id: number; resultado: R } | { tipo: 'erro'; id: number; erro: string } | Progresso;

/**
 * Quantos filhos cabem: núcleos − 1, limitado pela memória (cada filho usa cerca de `mbPorFilho`). No Windows,
 * freemem() não conta o cache liberável, então vale o maior entre a memória livre e metade da RAM total.
 */
export function workersPadrao(mbPorFilho: number, maximo = Infinity): number {
  const disponivel = Math.max(os.freemem(), os.totalmem() / 2) / 2 ** 20;
  const porMemoria = Math.floor((disponivel - 1500) / mbPorFilho);
  return Math.max(1, Math.min(os.cpus().length - 1, porMemoria, maximo));
}

export async function rodarEmPool<T, R>(
  modulo: string,
  tarefas: T[],
  opcoes: { workers: number; mbPorFilho: number; aoProgredir?: (p: Progresso) => void; aoTerminar?: (r: R, t: T) => void },
): Promise<R[]> {
  const resultados: R[] = new Array(tarefas.length);
  let proxima = 0;
  const filhos: ChildProcess[] = [];
  await Promise.all(
    Array.from({ length: Math.min(opcoes.workers, tarefas.length) }, () => {
      const filho = fork(modulo, ['--trabalhador'], { execArgv: [...process.execArgv, `--max-old-space-size=${opcoes.mbPorFilho}`] });
      filhos.push(filho);
      return new Promise<void>((resolve, reject) => {
        const enviar = () => {
          if (proxima >= tarefas.length) {
            filho.kill();
            return resolve();
          }
          const id = proxima++;
          filho.send({ id, tarefa: tarefas[id] });
        };
        filho.on('message', (m: Mensagem<R>) => {
          if (m.tipo === 'progresso') return opcoes.aoProgredir?.(m);
          if (m.tipo === 'erro') {
            filhos.forEach((f) => f.kill());
            return reject(new Error(m.erro));
          }
          resultados[m.id] = m.resultado;
          opcoes.aoTerminar?.(m.resultado, tarefas[m.id]);
          enviar();
        });
        filho.on('exit', (code) => code && code !== 0 && reject(new Error(`Processo filho saiu com código ${code}`)));
        enviar();
      });
    }),
  );
  return resultados;
}

/** Lado do filho: chame no módulo quando `process.argv` tiver `--trabalhador`. */
export function servirTarefas<T, R>(fazer: (tarefa: T) => Promise<R> | R): void {
  process.on('message', async (m: { id: number; tarefa: T }) => {
    try {
      process.send!({ tipo: 'fim', id: m.id, resultado: await fazer(m.tarefa) });
    } catch (e) {
      process.send!({ tipo: 'erro', id: m.id, erro: e instanceof Error ? (e.stack ?? e.message) : String(e) });
    }
  });
}

export const avisarProgresso = (chave: string, feito: number) => process.send?.({ tipo: 'progresso', chave, feito } satisfies Progresso);

export const ehTrabalhador = () => process.argv.includes('--trabalhador');
