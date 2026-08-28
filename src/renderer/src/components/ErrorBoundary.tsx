import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Change this (e.g. the current route) to clear a caught error. */
  resetKey?: string
  children: ReactNode
}
interface State {
  error: Error | null
  key: string | undefined
}

/** Keeps one crashing page from blanking the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('page crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-2xl px-7 py-10">
        <div className="rounded-xl border border-bad/25 bg-bad/10 p-5">
          <p className="text-sm font-semibold text-bad">This page hit an error.</p>
          <p className="mt-1 text-[12px] text-ink-soft">
            Switch to another tab and back, or restart the app.
          </p>
          <pre className="mt-3 max-h-52 overflow-auto rounded-md border border-line bg-bg/50 p-2 font-mono text-[11px] text-ink-faint">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack?.split('\n').slice(1, 6).join('\n')}
          </pre>
        </div>
      </div>
    )
  }
}
