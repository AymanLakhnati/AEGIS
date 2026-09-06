"use client";

import { useEffect, useState } from "react";

type Event = { time: string; label: string; detail?: string; kind: string };
type Evidence = { id: string; title: string; source: string; excerpt: string; relevance: number };
type Metrics = { error_rate: number; latency_p95: number; db_connections: number; cpu: number };
type Postmortem = { summary: string; impact: string; root_cause: string; resolution: string; preventive_actions: string[]; evidence_ids: string[]; confidence: number };
type Incident = {
  id: string; title: string; service: string; severity: string; status: string; started_at: string; summary: string;
  root_cause: string | null; confidence: number | null; metrics_before: Metrics; metrics_after: Metrics | null;
  timeline: Event[]; evidence: Evidence[]; scenario: string; postmortem: Postmortem | null;
  action: { id: string; action: string; reason: string; risk: string; expected_result: string; state: string } | null;
};
type DashboardMetrics = { total_incidents: number; successful_resolutions: number; human_interventions: number; failed_investigations: number; resolution_rate: number };

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const scenarios = [
  { id: "bad-deployment", label: "Bad deployment", detail: "Release regression", color: "red" },
  { id: "database-failure", label: "Database failure", detail: "Pool exhaustion", color: "amber" },
  { id: "memory-leak", label: "Memory leak", detail: "Rising RSS pressure", color: "blue" },
  { id: "traffic-spike", label: "Traffic spike", detail: "Capacity surge", color: "cyan" },
  { id: "dependency-failure", label: "Dependency failure", detail: "Provider degradation", color: "violet" },
];
const navItems = [
  { label: "Command center", target: "top" },
  { label: "Incidents", target: "incident-watch" },
  { label: "Knowledge", target: "evidence" },
  { label: "Tool registry", target: "approval" },
  { label: "Evaluations", target: "metrics" },
  { label: "Observability", target: "trajectory" },
];

export default function Home() {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);
  const [view, setView] = useState<"overview" | "postmortem">("overview");

  async function refresh() {
    setLoading(true);
    try {
      const [listResponse, metricsResponse] = await Promise.all([fetch(`${API}/api/incidents`, { cache: "no-store" }), fetch(`${API}/api/metrics`, { cache: "no-store" })]);
      if (listResponse.ok) { const list = await listResponse.json(); setIncidents(list); setIncident((current) => list.find((item: Incident) => item.id === current?.id) ?? list[0]); }
      if (metricsResponse.ok) setStats(await metricsResponse.json());
    } finally { setLoading(false); }
  }
  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  async function launchDemo(scenario: string) {
    setShowLauncher(false); setLoading(true); setView("overview");
    const response = await fetch(`${API}/api/incidents/demo/${scenario}`, { method: "POST" });
    if (response.ok) { const next = await response.json(); setIncident(next); await refresh(); }
    setLoading(false);
  }
  async function decide(decision: "approve" | "reject") {
    if (!incident?.action) return;
    const response = await fetch(`${API}/api/incidents/${incident.id}/actions/${incident.action.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    if (response.ok) { const next = await response.json(); setIncident(next); setIncidents((current) => current.map((item) => item.id === next.id ? next : item)); }
    setActing(false);
  }

  if (loading && !incident) return <main className="loading-screen"><span className="pulse-dot" /> Connecting to Aegis control plane...</main>;
  if (!incident) return <main className="loading-screen">No incidents available. Launch a demo to begin.</main>;
  const resolved = incident.status === "RESOLVED";
  const blocked = incident.status === "BLOCKED";
  const metrics = resolved && incident.metrics_after ? incident.metrics_after : incident.metrics_before;
  const activeCount = stats?.total_incidents ?? incidents.length;

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">A</span><span>AEGIS <small>OPS CONTROL</small></span></div><div className="workspace-label">WORKSPACE / ACME ENGINEERING</div><nav>{navItems.map((item, index) => <button className={index === 0 ? "nav-item active" : "nav-item"} onClick={() => scrollToSection(item.target)} key={item.label}><span className="nav-glyph">{["+", "!", "◇", "[]", "%", "~"][index]}</span>{item.label}</button>)}</nav><div className="sidebar-bottom"><div className="system-state"><span className="pulse-dot" />Simulator online</div><div className="user-row"><span className="avatar">JM</span><span><strong>Jordan Miller</strong><small>Senior SRE · ENGINEER</small></span><span className="more">...</span></div></div></aside>
    <section className="content"><header className="topbar"><div><span className="eyebrow">TUESDAY, 06 SEP 2026 · DEMO ENVIRONMENT</span><h1>Command center</h1></div><div className="top-actions"><button className="quiet-button" onClick={refresh}>Refresh <span>R</span></button><button className="demo-button" onClick={() => setShowLauncher(true)}>Launch demo incident <b>+</b></button></div></header>
      <div className="status-strip"><span className="live-dot" />LIVE OPERATIONS <span className="strip-divider" /> SIMULATED INFRASTRUCTURE <span className="strip-spacer" /><span>Budget <strong>$0.18 / $0.25</strong></span><span className="budget"><i /></span></div>
      <div className="metrics-grid"><Metric label="INCIDENTS IN RUN" value={`${activeCount}`} note={`${stats?.human_interventions ?? 0} human decisions`} tone="red" /><Metric label="RESOLUTION RATE" value={`${stats?.resolution_rate ?? 0}%`} note="Measured in this session" tone="green" /><Metric label="REMEDIATIONS" value={`${stats?.successful_resolutions ?? 0}`} note="Verified successfully" tone="blue" /><Metric label="FAILED INVESTIGATIONS" value={`${stats?.failed_investigations ?? 0}`} note="No silent failures" tone="amber" /></div>
      <div className="section-heading"><div><span className="eyebrow">PRIORITY QUEUE</span><h2>Incident watch</h2></div><span className="queue-note">{incidents.filter((item) => item.status !== "RESOLVED").length} need attention</span></div>
      <div className="workspace-grid"><section className="incident-list">{incidents.slice().reverse().map((item) => <button className={`incident-row ${item.id === incident.id ? "selected" : ""}`} onClick={() => { setIncident(item); setView("overview"); }} key={item.id}><span className={`mini-status ${item.status.toLowerCase()}`} /><span className="incident-row-copy"><strong>{item.title}</strong><small>{item.id} · {item.service}</small></span><span className={`row-state ${item.status.toLowerCase()}`}>{item.status === "HUMAN_APPROVAL" ? "APPROVAL" : item.status}</span></button>)}<button className="add-incident" onClick={() => setShowLauncher(true)}>+ Launch another controlled scenario</button></section><section className="incident-card"><div className="incident-main"><div className="incident-heading"><span className="severity">{incident.severity}</span><span className={`status ${resolved ? "resolved" : blocked ? "blocked" : "awaiting"}`}>{resolved ? "RESOLVED" : blocked ? "BLOCKED" : "AWAITING APPROVAL"}</span><span className="incident-id">{incident.id}</span></div><h3>{incident.title}</h3><p>{incident.summary}</p><div className="incident-meta"><span><b className="service-dot" />{incident.service}</span><span>Started {incident.started_at}</span><span>Scenario <b>{incident.scenario}</b></span></div></div><div className="incident-score"><span className="eyebrow">AI CONFIDENCE</span><strong>{incident.confidence}%</strong><div className="score-bar"><i style={{ width: `${incident.confidence}%` }} /></div><small>Evidence grounded</small></div><div className="incident-action"><span className="eyebrow">NEXT ACTION</span><strong>{resolved ? "Verification complete" : blocked ? "Review alternate action" : incident.action?.action}</strong><button className="open-button" onClick={() => document.getElementById("investigation")?.scrollIntoView({ behavior: "smooth" })}>Open investigation <span>-&gt;</span></button></div></section></div>
      <div className="view-tabs"><button className={view === "overview" ? "tab active" : "tab"} onClick={() => setView("overview")}>Investigation</button><button className={view === "postmortem" ? "tab active" : "tab"} disabled={!incident.postmortem} onClick={() => setView("postmortem")}>Postmortem {incident.postmortem ? "" : "(available after resolution)"}</button></div>
      {view === "overview" ? <div className="columns" id="investigation"><section className="panel timeline-panel"><div className="panel-heading"><div><span className="eyebrow">AGENT TRAJECTORY</span><h2>Investigation timeline</h2></div><span className="step-count">{incident.timeline.length} STEPS</span></div><div className="timeline">{incident.timeline.map((event, index) => <div className={`timeline-event ${event.kind}`} key={`${event.label}-${index}`}><span className="timeline-time">{event.time}</span><span className="timeline-node" /><div><strong>{event.label}</strong>{event.detail && <p>{event.detail}</p>}</div></div>)}</div></section><div className="right-stack"><section className="panel diagnosis-panel"><div className="panel-heading"><div><span className="eyebrow">AI DIAGNOSIS</span><h2>Likely root cause</h2></div><span className="confidence-pill">{incident.confidence}% confidence</span></div><div className="diagnosis-callout"><span className="cause-icon">!</span><div><strong>{incident.root_cause}</strong><p>Every claim below is tied to retrieved evidence.</p></div></div><div className="evidence-list">{incident.evidence.map((item, index) => <details className="evidence-row" key={item.id}><summary><span className="citation">[{index + 1}]</span><span><strong>{item.title}</strong><small>{item.source}</small></span><span className="relevance">{item.relevance}%</span></summary><p>{item.excerpt}</p></details>)}</div></section><section className={`panel approval-panel ${resolved ? "resolved-panel" : blocked ? "blocked-panel" : ""}`}><div className="approval-icon">{resolved ? "OK" : blocked ? "NO" : "!"}</div><div className="approval-copy"><span className="eyebrow">{resolved ? "VERIFICATION" : blocked ? "ACTION REJECTED" : "HUMAN APPROVAL REQUIRED"}</span><h2>{resolved ? "Incident resolved" : incident.action?.action}</h2><p>{resolved ? "Error rate and latency returned to baseline after the registered tool executed." : incident.action?.reason}</p></div>{resolved ? <div className="verified-metrics"><Metric label="ERROR RATE" value={`${metrics.error_rate}%`} note="before 17.8%" tone="green" compact /><Metric label="LATENCY P95" value={`${metrics.latency_p95}ms`} note="before 4.8s" tone="green" compact /></div> : blocked ? <span className="blocked-note">No action executed</span> : <div className="approval-actions"><span>RISK <b>{incident.action?.risk}</b></span><div><button className="reject-button" disabled={acting} onClick={() => decide("reject")}>Reject</button><button className="approve-button" disabled={acting} onClick={() => decide("approve")}>{acting ? "Executing..." : "Approve"}</button></div></div>}</section></div></div> : <PostmortemView postmortem={incident.postmortem} evidence={incident.evidence} />}
    </section>
    {showLauncher && <div className="modal-backdrop" onClick={() => setShowLauncher(false)}><section className="launcher" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">CONTROLLED SIMULATION</span><h2>Launch a failure scenario</h2></div><button className="close-button" onClick={() => setShowLauncher(false)}>×</button></div><p className="launcher-intro">Each scenario produces its own signals, evidence, diagnosis, and registered remediation. Nothing touches a real environment.</p><div className="scenario-grid">{scenarios.map((scenario) => <button className="scenario-card" onClick={() => launchDemo(scenario.id)} key={scenario.id}><span className={`scenario-icon ${scenario.color}`}>+</span><span><strong>{scenario.label}</strong><small>{scenario.detail}</small></span><span className="scenario-arrow">-&gt;</span></button>)}</div></section></div>}
  </main>;
}

function scrollToSection(target: string) {
  const selectors: Record<string, string> = { top: ".topbar", "incident-watch": ".section-heading", evidence: ".diagnosis-panel", approval: ".approval-panel", metrics: ".metrics-grid", trajectory: ".timeline-panel" };
  document.querySelector(selectors[target] ?? ".topbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PostmortemView({ postmortem, evidence }: { postmortem: Postmortem | null; evidence: Evidence[] }) { if (!postmortem) return <section className="empty-panel">Resolve the incident to generate a grounded postmortem.</section>; return <section className="postmortem-grid"><section className="panel postmortem-main"><span className="eyebrow">GENERATED REPORT · {postmortem.confidence}% AI CONFIDENCE</span><h2>Incident postmortem</h2><ReportBlock label="Incident summary" value={postmortem.summary} /><ReportBlock label="Impact" value={postmortem.impact} /><ReportBlock label="Root cause" value={postmortem.root_cause} /><ReportBlock label="Resolution" value={postmortem.resolution} /></section><section className="panel"><span className="eyebrow">PREVENTIVE ACTIONS</span><h2>What changes next</h2><ul className="prevention-list">{postmortem.preventive_actions.map((action) => <li key={action}>{action}</li>)}</ul><span className="eyebrow citations-heading">SOURCES</span>{evidence.map((item) => <div className="source-chip" key={item.id}><b>{item.id}</b>{item.title}</div>)}</section></section>; }
function ReportBlock({ label, value }: { label: string; value: string }) { return <div className="report-block"><span className="eyebrow">{label}</span><p>{value}</p></div>; }
function Metric({ label, value, note, tone, compact = false }: { label: string; value: string; note: string; tone: string; compact?: boolean }) { return <div className={`metric ${tone} ${compact ? "compact" : ""}`}><span className="eyebrow">{label}</span><strong>{value}</strong><small><i />{note}</small></div>; }
