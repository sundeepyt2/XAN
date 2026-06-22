"use client";

// components/ErrorBoundary.tsx
// ✅ "use client" REQUIRED — class component
// ✅ Receives a plain `message` string (Server→Client safe) — renders its own retry UI

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  message?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl border border-xan-border bg-xan-card">
          <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
          <p className="text-foreground font-medium">
            {this.props.message ?? "Something went wrong"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Please try again in a moment.
          </p>
          <Button
            onClick={this.handleReset}
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
