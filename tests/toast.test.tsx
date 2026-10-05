import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastContainer } from '../src/components/ui/Toast';
import { ToastProvider, useToast, TOAST_DURATION_MS } from '../src/context/ToastContext';
import { ErrorBoundary, ErrorFallback } from '../src/components/ui/ErrorBoundary';

describe('ToastContainer', () => {
  it('renders nothing but the container when there are no toasts', () => {
    const html = renderToStaticMarkup(<ToastContainer toasts={[]} onDismiss={() => {}} />);
    expect(html).toContain('fixed bottom-6 right-6');
    expect(html).not.toContain('data-toast-type');
  });

  it('renders each toast with its message, type indicator and dismiss button', () => {
    const html = renderToStaticMarkup(
      <ToastContainer
        toasts={[
          { id: 1, type: 'success', message: 'Word added.' },
          { id: 2, type: 'error', message: 'Failed to delete word.' },
          { id: 3, type: 'info', message: 'Heads up.' },
        ]}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain('Word added.');
    expect(html).toContain('Failed to delete word.');
    expect(html).toContain('Heads up.');
    expect(html).toContain('bg-emerald-500');
    expect(html).toContain('bg-rose-500');
    expect(html).toContain('bg-blue-500');
    expect(html).toContain('role="alert"');
    expect(html.match(/aria-label="Dismiss notification"/g)).toHaveLength(3);
  });
});

describe('ToastProvider / useToast', () => {
  it('uses a 3.5 second auto-dismiss duration', () => {
    expect(TOAST_DURATION_MS).toBe(3500);
  });

  it('exposes success, error and info helpers inside the provider', () => {
    let api: ReturnType<typeof useToast> | null = null;
    function Probe() {
      api = useToast();
      return null;
    }
    renderToStaticMarkup(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    expect(api).not.toBeNull();
    expect(typeof api!.success).toBe('function');
    expect(typeof api!.error).toBe('function');
    expect(typeof api!.info).toBe('function');
  });

  it('throws a clear error when used outside the provider', () => {
    function Probe() {
      useToast();
      return null;
    }
    expect(() => renderToStaticMarkup(<Probe />)).toThrow('useToast must be used within a ToastProvider');
  });
});

describe('ErrorBoundary', () => {
  it('switches to error state when a child throws', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it('renders children when there is no error', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <p>Healthy content</p>
      </ErrorBoundary>,
    );
    expect(html).toContain('Healthy content');
  });

  it('renders a calm fallback with recovery actions', () => {
    const html = renderToStaticMarkup(<ErrorFallback />);
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Reload Application');
    expect(html).toContain('Go to Dashboard');
    expect(html).toContain('bg-card');
  });
});
