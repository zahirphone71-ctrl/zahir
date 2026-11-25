import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  isInline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidUpdate(prevProps: Props) {
    // Automatically reset error boundary when children or active tab change
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    logger.error(error, 'ReactErrorBoundary', { componentStack: errorInfo?.componentStack });
    this.setState({ errorInfo });
  }

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private _isMounted = true;

  public componentDidMount() {
    this._isMounted = true;
  }

  public componentWillUnmount() {
    this._isMounted = false;
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyError = async () => {
    const errorText = `${this.state.error?.toString()}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    try {
      await navigator.clipboard.writeText(errorText);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = errorText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {}
    }
    if (!this._isMounted) return;
    this.setState({ copied: true });
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      if (this._isMounted) this.setState({ copied: false });
    }, 2500);
  };

  public render() {
    if (this.state.hasError) {
      const isInline = this.props.isInline !== false;
      return (
        <div className={isInline ? "w-full py-10 px-4 flex flex-col items-center justify-center" : "min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-rose-600 selection:text-white"} dir="rtl">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {this.props.fallbackTitle || 'حدث استثناء غير متوقع في الواجهة'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  قام نظام الحماية ZCtrl باعتراض الخطأ لحماية اتصالك وبياناتك من التلف أو الشاشة الفارغة
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 font-mono text-xs text-rose-300 overflow-x-auto max-h-48 custom-scrollbar">
                <p className="font-bold mb-1 text-rose-400">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="text-[10px] text-slate-500 whitespace-pre-wrap leading-relaxed">
                    {this.state.error.stack.slice(0, 500)}...
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 min-w-[140px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة المحاولة والمتابعة</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                <span>إعادة تحميل الصفحة</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyError}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all border border-slate-700/60"
                title="نسخ تفاصيل الخطأ"
              >
                {this.state.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
