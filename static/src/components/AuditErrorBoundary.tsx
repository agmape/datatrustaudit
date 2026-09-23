import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface BoundaryProps {
  children: React.ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  dashboardLabel: string;
  onBack: () => void;
}

interface BoundaryState {
  hasError: boolean;
}

class AuditErrorBoundaryCore extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Audit results render error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/30 p-6 text-red-50 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-xl bg-red-500/20 p-2 text-red-200">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold">{this.props.title}</h2>
              <p className="mt-1 text-sm text-red-100/70">{this.props.body}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => this.setState({ hasError: false })}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {this.props.retryLabel}
            </Button>
            <Button type="button" onClick={this.props.onBack} className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              {this.props.dashboardLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

const AuditErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <AuditErrorBoundaryCore
      title={t('audit.error_boundary_title')}
      body={t('audit.error_boundary_body')}
      retryLabel={t('common.retry')}
      dashboardLabel={t('audit.back_to_dashboard')}
      onBack={() => navigate('/')}
    >
      {children}
    </AuditErrorBoundaryCore>
  );
};

export default AuditErrorBoundary;
