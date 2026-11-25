import React, { Component, ReactNode, ErrorInfo } from 'react';
import { HotspotUser } from '../types/mikrotik';
import { VoucherStudio } from './VoucherStudio';
import { safeStorage } from '../utils/safeStorage';

interface CardPrintStudioViewProps {
  initialUsers?: HotspotUser[];
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class VoucherErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("VoucherStudio Crash caught by Boundary:", error, errorInfo);
  }

  handleReset = () => {
    safeStorage.removeItem("zahir_current_voucher_design");
    safeStorage.removeItem("zahir_saved_voucher_templates");
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl mx-auto my-12 text-right text-white font-sans" dir="rtl">
          <h2 className="text-xl font-bold text-rose-400 mb-2">عذراً، حدث خطأ مؤقت أثناء تحميل استوديو الكروت</h2>
          <p className="text-slate-300 text-sm mb-4">
            تم احتواء الخطأ بنجاح دون إغلاق البرنامج أو إعادة التوجيه. يمكنك استئناف العمل فوراً بالضغط على زر إعادة المحاولة.
          </p>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-rose-300/80 mb-6 overflow-auto max-h-40">
            {this.state.error?.toString()}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إعادة ضبط القالب الافتراضي
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const CardPrintStudioView: React.FC<CardPrintStudioViewProps> = ({ initialUsers }) => {
  return (
    <VoucherErrorBoundary>
      <VoucherStudio initialUsers={initialUsers} />
    </VoucherErrorBoundary>
  );
};

export default CardPrintStudioView;

