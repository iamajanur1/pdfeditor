import React from 'react';

interface State { failed: boolean }

/** A failed editor should not leave users with a silently blank white screen. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error) {
    // Do not send errors or document contents to third-party logging services.
    if (import.meta.env.DEV) console.error('Paprify editor error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ padding: 'min(8vw, 64px)', maxWidth: 680, margin: '8vh auto', fontFamily: 'system-ui,sans-serif', color: '#182c40' }}>
      <h1>Paprify could not display this document</h1>
      <p>The editor encountered an unexpected problem. Unsaved changes may be lost if you reload the page.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ background: '#0a4174', color: '#fff', border: 0, borderRadius: 8, padding: '12px 18px', cursor: 'pointer' }}>Reload Paprify</button>
    </main>;
  }
}
