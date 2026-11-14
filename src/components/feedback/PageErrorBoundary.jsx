import { Component } from 'react';
import { ErrorState } from './States.jsx';

// A screen's own error boundary (Phase 15, D45 stability): if the screen fails while drawing, only the screen is
// replaced by a friendly error with Try again; the menus and header stay, so the person can retry or go elsewhere.
// Going to another page (a new `resetKey`) clears it. The route-level RouteErrorPage still catches everything else.
// The error is written to the browser console only (no error-reporting service: ADR-023) and never shown.

/** @typedef {{ resetKey: string, children: import('react').ReactNode }} Props */
/** @typedef {{ failedFor: string | null }} State */

/** @extends {Component<Props, State>} */
export class PageErrorBoundary extends Component {
  /** @param {Props} props */
  constructor(props) {
    super(props);
    /** @type {State} */
    this.state = { failedFor: null };
  }

  static getDerivedStateFromError() {
    return { failedFor: '__pending__' };
  }

  /** @param {unknown} error */
  componentDidCatch(error) {
    console.error(error);
    this.setState({ failedFor: this.props.resetKey });
  }

  /** Another page: start clean, so coming back later tries again. @param {Props} previous */
  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failedFor !== null) this.setState({ failedFor: null });
  }

  render() {
    const { failedFor } = this.state;
    const failed = failedFor === '__pending__' || failedFor === this.props.resetKey;
    if (!failed) return this.props.children;
    return (
      <ErrorState
        description="This page could not be shown. Try again, and if it keeps happening, tell your administrator."
        onRetry={() => this.setState({ failedFor: null })}
      />
    );
  }
}
