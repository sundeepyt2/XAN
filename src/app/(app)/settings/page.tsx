"use client";

// app/(app)/settings/page.tsx
// ✅ Settings page — manual Cloudflare verification for AllAnime streams.
//
// Flow:
//   1. User clicks "Open AllAnime" → new tab opens to allmanga.to
//   2. User solves the CF challenge in that tab (if prompted)
//   3. User opens DevTools → Application → Cookies → api.allanime.day
//   4. User copies the cf_clearance value
//   5. User pastes it into the input field below
//   6. User clicks "Save & Test"
//   7. Server stores the cookie and tests it against AllAnime
//   8. If successful, the status turns green and streams will work

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Trash2,
  RefreshCw,
  Info,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CookieStatus {
  hasCookie: boolean;
  isExpired: boolean;
  ageMinutes: number | null;
}

interface TestResult {
  status: number;
  ok: boolean;
  bodySnippet: string;
  hasCookie: boolean;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [cookieValue, setCookieValue] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status on mount
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cf/status");
      if (res.ok) {
        const json = await res.json();
        setStatus(json);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    // Set default UA
    setUserAgent(navigator.userAgent);
  }, [refreshStatus]);

  const handleSave = async () => {
    if (!cookieValue.trim()) {
      setError("Please paste the cf_clearance cookie value");
      return;
    }

    setSaving(true);
    setError(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/cf/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: cookieValue.trim(),
          userAgent: userAgent || navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      // Auto-test after saving
      await handleTest();
      await refreshStatus();
      setCookieValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/cf/test", { method: "POST" });
      const json = await res.json();
      setTestResult(json);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await fetch("/api/cf/clear", { method: "POST" });
      setTestResult(null);
      setCookieValue("");
      await refreshStatus();
    } finally {
      setSaving(false);
    }
  };

  const copyDevToolsCommand = () => {
    const cmd = `document.cookie`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isVerified =
    status?.hasCookie && !status.isExpired && testResult?.ok;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-xan-crimson" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure AllAnime stream verification to enable real episode
          playback.
        </p>
      </div>

      {/* Status Card */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>AllAnime Verification</span>
            {isVerified ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                <ShieldAlert className="h-3 w-3 mr-1" />
                Not Verified
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isVerified
              ? "Streams will use real AllAnime sources."
              : "Streams fall back to demo HLS. Verify to enable real episodes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status?.hasCookie && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                Cookie age:{" "}
                <span className="text-foreground font-mono">
                  {status.ageMinutes != null
                    ? `${status.ageMinutes} min`
                    : "unknown"}
                </span>
              </div>
              <div>
                Status:{" "}
                <span
                  className={
                    status.isExpired ? "text-red-400" : "text-emerald-400"
                  }
                >
                  {status.isExpired ? "Expired" : "Active"}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleTest}
              disabled={testing || !status?.hasCookie}
              variant="secondary"
              size="sm"
              className="bg-xan-card border-xan-border hover:bg-xan-card-hover"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Test Now
            </Button>
            {status?.hasCookie && (
              <Button
                onClick={handleClear}
                disabled={saving}
                variant="secondary"
                size="sm"
                className="bg-xan-card border-xan-border hover:bg-xan-card-hover text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Clear
              </Button>
            )}
          </div>

          {testResult && (
            <div
              className={`rounded-lg border p-3 text-xs font-mono ${
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                  : "border-red-500/30 bg-red-500/5 text-red-400"
              }`}
            >
              <div>
                HTTP {testResult.status} —{" "}
                {testResult.ok ? "✅ Cookie works!" : "❌ Cookie invalid or expired"}
              </div>
              {testResult.bodySnippet && (
                <div className="mt-1 opacity-70 break-all">
                  {testResult.bodySnippet.substring(0, 200)}
                  {testResult.bodySnippet.length > 200 ? "…" : ""}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Instructions */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-4 w-4 text-xan-crimson" />
            How to Verify
          </CardTitle>
          <CardDescription>
            Solve the Cloudflare challenge once in your browser, then paste the
            cookie below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">
                Open AllAnime in a new tab
              </p>
              <p className="text-xs text-muted-foreground">
                Click the button below. If you see a &quot;Just a moment…&quot;
                page, wait for it to load.
              </p>
              <Button asChild size="sm" variant="secondary" className="mt-2 bg-xan-card border-xan-border hover:bg-xan-card-hover">
                <a
                  href="https://allmanga.to/anime/PGcK4wGnqDoeihT6n"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open AllAnime
                </a>
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">
                Open DevTools → Application → Cookies
              </p>
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 bg-xan-card rounded text-xs font-mono border border-xan-border">F12</kbd> in the AllAnime tab, go to{" "}
                <span className="text-foreground">Application</span> →{" "}
                <span className="text-foreground">Cookies</span> →{" "}
                <code className="text-foreground">https://api.allanime.day</code>
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">
                Copy the <code className="text-xan-crimson">cf_clearance</code> value
              </p>
              <p className="text-xs text-muted-foreground">
                Find the row named <code className="text-foreground">cf_clearance</code>,
                double-click its Value cell, and copy the full string.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">
              4
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">
                Paste it below and click Save &amp; Test
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cookie Input */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Paste Cookie</CardTitle>
          <CardDescription>
            The cookie is stored server-side and used for all AllAnime stream
            requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">
              cf_clearance value
            </label>
            <Input
              type="text"
              placeholder="paste the cf_clearance cookie value here…"
              value={cookieValue}
              onChange={(e) => setCookieValue(e.target.value)}
              className="font-mono text-xs bg-xan-card border-xan-border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">
              Your User-Agent (must match the browser that solved the challenge)
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                className="font-mono text-xs bg-xan-card border-xan-border"
              />
              <Button
                onClick={() => setUserAgent(navigator.userAgent)}
                variant="secondary"
                size="sm"
                className="bg-xan-card border-xan-border hover:bg-xan-card-hover flex-shrink-0"
              >
                <Terminal className="h-3.5 w-3.5 mr-1" />
                Use mine
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: The User-Agent must match exactly. Click &quot;Use mine&quot;
              to auto-fill your current browser&apos;s UA.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || !cookieValue.trim()}
            className="w-full bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving & Testing…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Save & Test
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Advanced: console command */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            Quick Method (Console)
          </CardTitle>
          <CardDescription>
            If DevTools is hard to find, use the browser console instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            In the AllAnime tab, press <kbd className="px-1.5 py-0.5 bg-xan-card rounded text-xs font-mono border border-xan-border">F12</kbd>, go to
            <span className="text-foreground"> Console</span>, and run:
          </p>
          <div className="rounded-lg bg-black/50 border border-xan-border p-3 font-mono text-xs text-emerald-400 flex items-center justify-between gap-2">
            <code className="break-all">
              document.cookie.split(&apos;;&apos;).find(c =&gt; c.includes(&apos;cf_clearance&apos;)).split(&apos;=&apos;)[1]
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyDevToolsCommand}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This prints the cf_clearance value. Copy it and paste above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
