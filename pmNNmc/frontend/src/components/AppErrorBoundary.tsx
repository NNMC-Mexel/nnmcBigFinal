import React from 'react';
import { forceFreshAppLoad, recoverFromChunkError } from '../utils/chunkRecovery';

type State = {
  error: Error | null;
};

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    recoverFromChunkError(error);
    console.error('Application render error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const errorText = `${this.state.error.name}: ${this.state.error.message}`;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-slate-800">Не удалось загрузить страницу</h1>
          <p className="mt-2 text-sm text-slate-500">
            Возможно, приложение было обновлено. Перезагрузите интерфейс.
          </p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-400">Техническая причина</summary>
            <code className="mt-2 block break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
              {errorText}
            </code>
          </details>
          <button
            type="button"
            onClick={forceFreshAppLoad}
            className="mt-5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
