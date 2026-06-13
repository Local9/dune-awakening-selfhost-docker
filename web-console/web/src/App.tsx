import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { setCsrfToken } from "./api/client";
import { authApi } from "./api/auth";
import { setupApi, type Task } from "./api/setup";
import { updatesApi } from "./api/updates";
import { serverApi } from "./api/server";
import { SetupWizard } from "./components/SetupWizard";
import { TaskProgress } from "./components/TaskProgress";
import { DiscordLogo } from "./components/DiscordLogo";
import { KofiLogo } from "./components/KofiLogo";
import { setOpenConfirmDialog } from "./lib/confirmDialog";
import { withTimeout, waitForTaskSilently } from "./lib/tasks";
import * as persistence from "./lib/persistence";
import { stackVersionButtonLabel, stackVersionButtonTitle } from "./lib/updates";
import { navGroups } from "./constants/navigation";
import { REDBLINK_REPO_URL, REDBLINK_DISCORD_URL, REDBLINK_KOFI_URL } from "./constants/links";
import type { Tab, SetupState, HomeTaskResult, HomeLoadResult, ConfirmDialogRequest } from "./types";
import {
  HomePanel, ServerPanel, ServicesPanel, PlayersPanel, AdminToolsPanel,
  LiveMapPanel, MapsPanel, CarePackagePanel, AddonsPanel, DatabasePanel,
  StoragePanel, BackupsPanel, LogsPanel, UpdatesPanel, SettingsPanel, ConfirmDialog,
  isHomeStopComplete, isHomeActionComplete
} from "./features";

export function App() {
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("Home");
  const [status, setStatus] = useState("");
  const [readiness, setReadiness] = useState("");
  const [ports, setPorts] = useState("");
  const [doctor, setDoctor] = useState("");
  const [services, setServices] = useState("");
  const [selectedLogService, setSelectedLogService] = useState("gateway");
  const [logs, setLogs] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [backupRestoreTask, setBackupRestoreTask] = useState<Task | null>(null);
  const [homeTaskResult, setHomeTaskResult] = useState<HomeTaskResult | null>(null);
  const [funcomTokenResult, setFuncomTokenResult] = useState<HomeTaskResult | null>(() => persistence.loadPersistedFuncomTokenResult());
  const [homeRunningAction, setHomeRunningAction] = useState<"start" | "stop" | "restart" | "">("");
  const [stackVersionStatus, setStackVersionStatus] = useState<Record<string, string>>({ status: "Checking", current: "", latest: "" });
  const stackActionStartedAt = useRef(0);
  const stackStatusLoadRef = useRef<Promise<HomeLoadResult> | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [setupStateLoaded, setSetupStateLoaded] = useState(false);
  const [setupJump, setSetupJump] = useState({ step: 0, nonce: 0 });
  const [error, setError] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const setupComplete = Boolean(setupState?.files?.complete ?? (setupState?.files?.env && setupState?.files?.token && setupState?.files?.battlegroup));
  const firstRunSetup = auth && setupStateLoaded && !setupComplete;

  useEffect(() => {
    authApi.state().then((state) => {
      setAuth(state.authenticated);
      setCsrfToken(state.csrfToken);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    persistence.persistFuncomTokenResult(funcomTokenResult);
  }, [funcomTokenResult]);

  useEffect(() => {
    if (!auth) {
      setSetupState(null);
      setSetupStateLoaded(false);
      return;
    }
    let cancelled = false;
    setSetupStateLoaded(false);
    setupApi.state().then((state) => {
      if (cancelled) return;
      setSetupState(state);
      setSetupStateLoaded(true);
      if (!(state.files?.complete ?? (state.files?.env && state.files?.token && state.files?.battlegroup))) setTab("Setup");
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
      setSetupStateLoaded(true);
      setTab("Setup");
    });
    return () => { cancelled = true; };
  }, [auth]);

  useEffect(() => {
    setOpenConfirmDialog((request) => setConfirmRequest(request));
    return () => {
      setOpenConfirmDialog(null);
    };
  }, []);

  function closeConfirmDialog(confirmed: boolean) {
    const request = confirmRequest;
    setConfirmRequest(null);
    request?.resolve(confirmed);
  }

  async function login() {
    const result = await authApi.login(password);
    setCsrfToken(result.csrfToken);
    setAuth(result.authenticated);
  }

  async function logoutAfterPasswordChange() {
    try {
      await authApi.logout();
    } catch {
      // The password already changed; return to login even if session cleanup fails.
    }
    setCsrfToken(null);
    setAuth(false);
    setPassword("");
    setTab("Home");
  }

  async function safe(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const loadStackStatus = useCallback(async () => {
    if (stackStatusLoadRef.current) return stackStatusLoadRef.current;
    stackStatusLoadRef.current = (async () => {
      setError("");
      const [nextStatus, nextReadiness] = await Promise.allSettled([
        withTimeout(serverApi.status(), 90000, "Server status check timed out."),
        withTimeout(serverApi.readiness(), 90000, "Readiness check timed out.")
      ]);
      const result: HomeLoadResult = { statusLoaded: false, readinessLoaded: false, statusError: "", readinessError: "", statusText: "", readinessText: "" };
      if (nextStatus.status === "fulfilled") {
        setStatus(nextStatus.value.stdout);
        result.statusText = nextStatus.value.stdout;
        result.statusLoaded = true;
      } else {
        result.statusError = nextStatus.reason instanceof Error ? nextStatus.reason.message : String(nextStatus.reason);
      }
      if (nextReadiness.status === "fulfilled") {
        const readinessText = nextReadiness.value.stdout || nextReadiness.value.stderr || "";
        result.readinessText = readinessText;
        setReadiness(readinessText);
        result.readinessLoaded = Number(nextReadiness.value.exitCode || 0) === 0;
        if (!result.readinessLoaded) result.readinessError = nextReadiness.value.stderr || nextReadiness.value.stdout || "Readiness checks are not ready yet.";
      } else {
        result.readinessError = nextReadiness.reason instanceof Error ? nextReadiness.reason.message : String(nextReadiness.reason);
      }
      return result;
    })().finally(() => {
      stackStatusLoadRef.current = null;
    });
    return stackStatusLoadRef.current;
  }, []);

  useEffect(() => {
    if (!homeRunningAction) return;
    stackActionStartedAt.current = Date.now();
    let active = true;
    async function refreshRunningAction() {
      const result = await loadStackStatus().catch(() => null);
      if (!active || !result) return;
      const statusText = result.statusText;
      const readinessText = result.readinessText;
      const elapsedMs = Date.now() - stackActionStartedAt.current;
      if (homeRunningAction === "stop" && isHomeStopComplete(statusText, readinessText)) {
        setHomeTaskResult({ status: "stopped", title: "Server Stopped" });
        setHomeRunningAction("");
      } else if ((homeRunningAction === "start" || homeRunningAction === "restart") && elapsedMs >= 8000 && isHomeActionComplete(statusText, readinessText)) {
        setHomeTaskResult({ status: "succeeded", title: homeRunningAction === "start" ? "Server Started Successfully" : "Server Restarted Successfully" });
        setHomeRunningAction("");
      }
    }
    const id = window.setInterval(refreshRunningAction, 3000);
    refreshRunningAction();
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [homeRunningAction, loadStackStatus]);

  useEffect(() => {
    if (!auth || !setupComplete) return;
    let cancelled = false;
    void (async () => {
      try {
        const final = await waitForTaskSilently((await updatesApi.checkStack()).task);
        if (!cancelled) setStackVersionStatus(persistence.parseUpdateTask(final));
      } catch {
        if (!cancelled) setStackVersionStatus({ status: "Unavailable", current: "", latest: "" });
      }
    })();
    return () => { cancelled = true; };
  }, [auth, setupComplete]);

  if (!auth) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <h1>Dune Docker Console</h1>
          <p>Please enter your admin password to continue</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin Password" />
          <button onClick={() => safe(login)}>Sign In</button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (!setupStateLoaded) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <h1>Dune Docker Console</h1>
          <p className="loading-dots">Loading setup</p>
        </section>
      </main>
    );
  }

  if (firstRunSetup) {
    return (
      <div className="app-shell setup-only-shell">
        <main className="home-main setup-main">
          <div className="home-backdrop" aria-hidden="true">
            <span className="home-sand-fine" />
            <span className="home-sand-near" />
          </div>
          <header className="topbar">
            <div>
              <strong>Setup</strong>
              <span>Finish the first-time setup to unlock the console.</span>
            </div>
          </header>
          {error && <div className="error-banner">{error}</div>}
          <SetupWizard
            initialStep={setupJump.step}
            jumpNonce={setupJump.nonce}
            mode="first-run"
            onSetupComplete={async () => {
              const state = await setupApi.state();
              setSetupState(state);
              if (state.files?.complete ?? (state.files?.env && state.files?.token && state.files?.battlegroup)) setTab("Home");
            }}
          />
          <footer className="app-footer"><Heart size={16} fill="currentColor" /><span>Created with love by <a href={REDBLINK_REPO_URL} target="_blank" rel="noreferrer">RedBlink</a></span></footer>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <button className="sidebar-home-button" type="button" onClick={() => setTab("Home")} title="Open Home">
            <h1>Dune Docker Console</h1>
          </button>
          <button className="stack-version-button" title={stackVersionButtonTitle(stackVersionStatus)} aria-label={stackVersionButtonTitle(stackVersionStatus)} onClick={() => setTab("Updates")}>{stackVersionButtonLabel(stackVersionStatus)}</button>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <section className="sidebar-nav-group" key={group.title} aria-label={group.title}>
              <p className="sidebar-nav-heading">{group.title}</p>
              {group.items.map((item) => (
                <button key={item.tab} className={tab === item.tab ? "active" : ""} onClick={() => {
                  if (item.tab === "Setup") setSetupJump((current) => ({ step: 0, nonce: current.nonce + 1 }));
                  setTab(item.tab);
                }}>{item.icon}{item.tab}</button>
              ))}
              {group.title === "Community" && (
                <a className="sidebar-request-button" href={REDBLINK_DISCORD_URL} target="_blank" rel="noreferrer"><MessageCircle size={18} />Requests</a>
              )}
            </section>
          ))}
        </nav>
      </aside>
      <main className={tab === "Home" ? "home-main" : undefined}>
        {tab === "Home" && (
          <div className="home-backdrop" aria-hidden="true">
            <span className="home-sand-fine" />
            <span className="home-sand-near" />
          </div>
        )}
        <header className="topbar">
          <div>
            <strong>{tab}</strong>
            <span>Run and manage your self-hosted Dune server from the browser.</span>
          </div>
          <div className="topbar-links" aria-label="Community links">
            <a className="community-button discord" href={REDBLINK_DISCORD_URL} target="_blank" rel="noreferrer" title="Join Discord"><span>Join Discord</span><DiscordLogo size={19} /></a>
            <a className="community-button support" href={REDBLINK_KOFI_URL} target="_blank" rel="noreferrer" title="Support Project"><span>Support Project</span><KofiLogo size={19} /></a>
          </div>
        </header>
        {error && <div className="error-banner">{error}</div>}
        {tab === "Home" && <HomePanel status={status} readiness={readiness} taskResult={homeTaskResult} setTaskResult={setHomeTaskResult} funcomTokenResult={funcomTokenResult} setFuncomTokenResult={setFuncomTokenResult} runningAction={homeRunningAction} setRunningAction={setHomeRunningAction} onLoad={loadStackStatus} />}
        {tab === "Setup" && <SetupWizard initialStep={setupJump.step} jumpNonce={setupJump.nonce} mode="redeploy" onSetupComplete={async () => setSetupState(await setupApi.state())} />}
        {tab === "Server Control" && <ServerPanel setTask={setTask} setStatus={setStatus} status={status} setReadiness={setReadiness} setPorts={setPorts} setDoctor={setDoctor} ports={ports} readiness={readiness} doctor={doctor} taskResult={homeTaskResult} setTaskResult={setHomeTaskResult} funcomTokenResult={funcomTokenResult} setFuncomTokenResult={setFuncomTokenResult} runningAction={homeRunningAction} setRunningAction={setHomeRunningAction} onError={setError} onRedeploy={() => {
          setSetupJump((current) => ({ step: 4, nonce: current.nonce + 1 }));
          setTab("Setup");
        }} />}
        {tab === "Services" && <ServicesPanel services={services} setServices={setServices} setTask={setTask} openLogs={(service) => { setSelectedLogService(service); setTab("Logs"); }} onError={setError} />}
        {tab === "Players" && <PlayersPanel setTask={setTask} onError={setError} />}
        {tab === "Admin Tools" && <AdminToolsPanel onError={setError} />}
        {tab === "Live Map" && <LiveMapPanel onError={setError} />}
        {tab === "Maps" && <MapsPanel setTask={setTask} onError={setError} />}
        {tab === "Care Package" && <CarePackagePanel onError={setError} />}
        {tab === "Addons" && <AddonsPanel />}
        {tab === "Database" && <DatabasePanel />}
        {tab === "Storage" && <StoragePanel onError={setError} />}
        {tab === "Backups" && <BackupsPanel backupRestoreTask={backupRestoreTask} setBackupRestoreTask={setBackupRestoreTask} onError={setError} />}
        {tab === "Logs" && <LogsPanel selectedService={selectedLogService} setSelectedService={setSelectedLogService} text={logs} setText={setLogs} onError={setError} />}
        {tab === "Updates" && <UpdatesPanel setTask={setTask} />}
        {tab === "Settings" && <SettingsPanel onPasswordChanged={logoutAfterPasswordChange} />}
        {tab !== "Maps" && <TaskProgress task={task} onDismiss={() => setTask(null)} />}
        <footer className="app-footer"><Heart size={16} fill="currentColor" /><span>Created with love by <a href={REDBLINK_REPO_URL} target="_blank" rel="noreferrer">RedBlink</a></span></footer>
      </main>
      <ConfirmDialog request={confirmRequest} onClose={closeConfirmDialog} />
    </div>
  );
}

