import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportClientError } from "../monitoring/clientErrors";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    void _error;
    void _info;
    void reportClientError("component_error");
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="full-page-status" role="alert">
          <h1>This screen could not continue.</h1>
          <p>Your saved learning evidence is not changed. Reload the page or use Support.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload OPedu
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
