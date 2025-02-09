import React from 'react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Clipper Catalog Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="cc-flex cc-flex-col cc-items-center cc-justify-center cc-p-4 cc-gap-2">
          <div className="cc-text-red-500">Something went wrong displaying the catalog.</div>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="cc-px-3 cc-py-1 cc-text-sm cc-rounded cc-bg-accent-primary cc-text-on-accent"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;