"use client";

// app/(app)/settings/page.tsx
// ✅ Settings page — manual Cloudflare verification for AllAnime streams.
// Includes:
//   - Server-side cookie storage + test
//   - Client-side test (browser fetches AllAnime directly)
//   - Detailed diagnostics (IP mismatch detection, UA check, etc.)

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
  Network,
  AlertTriangle,
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
  diagnostics?: {
    serverIp: string | null;
    savedFromIp: string | null;
    ipMismatch: boolean;
    userAgent: string | null;
    cookieLength: number;
    hasCfClearance: boolean;
    responseServer: string | null;
    cfMitigated: string | null;
  };
}

interface ClientTestResult {
  ok: boolean;
  status: number;
  error: string | null;
  bodySnippet: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [cookieValue, setCookieValue] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clientTesting, setClientTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [clientTestResult, setClientTestResult] = useState<ClientTestResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setClientTestResult(null);

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

  const handleClientTest = async () => {
    setClientTesting(true);
    setError(null);
    try {
      // The browser fetches AllAnime directly — uses the browser's own cf_clearance cookie
      const targetUrl = "https://api.allanime.day/episodes?id=PGcK4wGnqDoeihT6n&episode=1&type=sub";
      const res = await fetch(targetUrl, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = await res.text();
      const isCfChallenge = body.includes("Just a moment") || res.status === 403;
      setClientTestResult({
        ok: res.ok && !isCfChallenge,
        status: res.status,
        error: isCfChallenge ? "Cloudflare challenge page returned" : null,
        bodySnippet: body.substring(0, 300),
      });
    } catch (err) {
      setClientTestResult({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : "CORS or network error",
        bodySnippet: "",
      });
    } finally {
      setClientTesting(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await fetch("/api/cf/clear", { method: "POST" });
      setTestResult(null);
      setClientTestResult(null);
      setCookieValue("");
      await refreshStatus();
    } finally {
      setSaving(false);
    }
  };

  const copyConsoleCommand = () => {
    const cmd = `document.cookie.split(';').find(c => c.includes('cf_clearance')).split('=')[1]`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ipMismatch = testResult?.diagnostics?.ipMismatch;
  const serverVerified = status?.hasCookie && !status.isExpired && testResult?.ok;
  const clientVerified = clientTestResult?.ok;

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

      {/* IP Mismatch Warning */}
      {ipMismatch && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-amber-400">
                  IP Address Mismatch Detected
                </p>
                <p className="text-muted-foreground">
                  Your browser&apos;s IP (<code className="text-foreground font-mono">{testResult?.diagnostics?.savedFromIp}</code>) differs from the server&apos;s IP (<code className="text-foreground font-mono">{testResult?.diagnostics?.serverIp}</code>).
                </p>
                <p className="text-muted-foreground">
                  Cloudflare&apos;s <code className="text-foreground">cf_clearance</code> cookie is IP-bound. The server cannot use your browser&apos;s cookie.{" "}
                  <strong className="text-foreground">Use the Client-Side Test below</strong> — it fetches directly from your browser, bypassing the server.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server-Side Status */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Network className="h-5 w-5 text-muted-foreground" />
              Server-Side Verification
            </span>
            {serverVerified ? (
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
            Server fetches AllAnime using the stored cookie. Works only if
            server and browser share the same IP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status?.hasCookie && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                Cookie age:{" "}
                <span className="text-foreground font-mono">
                  {status.ageMinutes != null ? `${status.ageMinutes} min` : "unknown"}
                </span>
              </div>
              <div>
                Status:{" "}
                <span className={status.isExpired ? "text-red-400" : "text-emerald-400"}>
                  {status.isExpired ? "Expired" : "Active"}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleTest} disabled={testing || !status?.hasCookie} variant="secondary" size="sm" className="bg-xan-card border-xan-border hover:bg-xan-card-hover">
              {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Test Server-Side
            </Button>
            {status?.hasCookie && (
              <Button onClick={handleClear} disabled={saving} variant="secondary" size="sm" className="bg-xan-card border-xan-border hover:bg-xan-card-hover text-red-400">
                <Trash2 className="h-4 w-4 mr-1.5" />
                Clear
              </Button>
            )}
          </div>

          {testResult && (
            <div className={`rounded-lg border p-3 text-xs font-mono ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
              <div>
                HTTP {testResult.status} — {testResult.ok ? "✅ Cookie works!" : "❌ Cookie invalid or expired"}
              </div>
              {testResult.diagnostics && (
                <div className="mt-2 space-y-0.5 opacity-80">
                  <div>Server IP: {testResult.diagnostics.serverIp ?? "unknown"}</div>
                  <div>Saved from IP: {testResult.diagnostics.savedFromIp ?? "unknown"}</div>
                  <div>IP mismatch: {testResult.diagnostics.ipMismatch ? "YES ⚠️" : "no"}</div>
                  <div>Has cf_clearance: {testResult.diagnostics.hasCfClearance ? "yes" : "NO"}</div>
                  <div>Cookie length: {testResult.diagnostics.cookieLength}</div>
                  <div>CF mitigated: {testResult.diagnostics.cfMitigated ?? "no"}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client-Side Test */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              Client-Side Test
            </span>
            {clientVerified !== undefined && (
              <Badge className={clientVerified ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                {clientVerified ? "Works" : "Blocked"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Your browser fetches AllAnime directly, using its own cf_clearance
            cookie. This bypasses the server&apos;s IP entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            First, visit{" "}
            <a href="https://allmanga.to/anime/PGcK4wGnqDoeihT6n" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
              allmanga.to <ExternalLink className="h-3 w-3" />
            </a>{" "}
            in a new tab and wait for any Cloudflare challenge to resolve. Then come back and click the button below.
          </p>
          <Button onClick={handleClientTest} disabled={clientTesting} variant="secondary" className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-xan-border hover:from-blue-500/30 hover:to-purple-500/30">
            {clientTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Test Client-Side Fetch
          </Button>
          {clientTestResult && (
            <div className={`rounded-lg border p-3 text-xs font-mono ${clientTestResult.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
              <div>
                HTTP {clientTestResult.status} — {clientTestResult.ok ? "✅ Browser cookie works!" : "❌ " + (clientTestResult.error || "Failed")}
              </div>
              {!clientTestResult.ok && (
                <div className="mt-2 opacity-80">
                  {clientTestResult.status === 0
                    ? "CORS blocked the request. The browser cannot fetch AllAnime directly due to cross-origin restrictions. Use the server-side approach instead."
                    : clientTestResult.status === 403
                      ? "Cloudflare challenge not solved. Visit allmanga.to first and wait for the challenge to resolve."
                      : "Unexpected response."}
                </div>
              )}
              {clientTestResult.bodySnippet && (
                <div className="mt-1 opacity-60 break-all">
                  {clientTestResult.bodySnippet.substring(0, 150)}
                  {clientTestResult.bodySnippet.length > 150 ? "…" : ""}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-4 w-4 text-xan-crimson" />
            How to Get Your Cookie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">Open AllAnime in a new tab</p>
              <Button asChild size="sm" variant="secondary" className="mt-1 bg-xan-card border-xan-border hover:bg-xan-card-hover">
                <a href="https://allmanga.to/anime/PGcK4wGnqDoeihT6n" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open AllAnime
                </a>
              </Button>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground">Get the <code className="text-xan-crimson">cf_clearance</code> cookie</p>
              <p className="text-xs text-muted-foreground">
                In the AllAnime tab, press <kbd className="px-1.5 py-0.5 bg-xan-card rounded text-xs font-mono border border-xan-border">F12</kbd>, open Console, and run:
              </p>
              <div className="rounded-lg bg-black/50 border border-xan-border p-2 font-mono text-xs text-emerald-400 flex items-center justify-between gap-2 mt-1">
                <code className="break-all text-[10px]">
                  document.cookie.split(&apos;;&apos;).find(c =&gt; c.includes(&apos;cf_clearance&apos;))
                </code>
                <Button size="sm" variant="ghost" onClick={copyConsoleCommand} className="flex-shrink-0 text-muted-foreground hover:text-foreground h-7 w-7 p-0">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This prints the full cookie string. Copy the part after <code className="text-foreground">cf_clearance=</code>.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-xan-crimson/20 text-xan-crimson flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Paste it below and save</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cookie Input */}
      <Card className="border-xan-border bg-xan-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Paste Cookie</CardTitle>
          <CardDescription>
            Accepts the full cookie string (e.g. <code className="text-foreground">cf_clearance=abc123</code>) or just the value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">
              cf_clearance value or full cookie string
            </label>
            <Input
              type="text"
              placeholder="cf_clearance=abc123... or just abc123..."
              value={cookieValue}
              onChange={(e) => setCookieValue(e.target.value)}
              className="font-mono text-xs bg-xan-card border-xan-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">
              User-Agent (must match the browser that solved the challenge)
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                className="font-mono text-xs bg-xan-card border-xan-border"
              />
              <Button onClick={() => setUserAgent(navigator.userAgent)} variant="secondary" size="sm" className="bg-xan-card border-xan-border hover:bg-xan-card-hover flex-shrink-0">
                <Terminal className="h-3.5 w-3.5 mr-1" />
                Use mine
              </Button>
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
          <Button onClick={handleSave} disabled={saving || !cookieValue.trim()} className="w-full bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0">
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
    </div>
  );
}
