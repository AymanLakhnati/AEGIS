from datetime import datetime, timezone
from enum import Enum
import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class IncidentStatus(str, Enum):
    investigating = "INVESTIGATING"
    approval = "HUMAN_APPROVAL"
    resolved = "RESOLVED"
    blocked = "BLOCKED"


class Severity(str, Enum):
    critical = "CRITICAL"
    high = "HIGH"
    medium = "MEDIUM"


class TimelineEvent(BaseModel):
    time: str
    label: str
    detail: str | None = None
    kind: Literal["signal", "analysis", "action", "success"]


class Evidence(BaseModel):
    id: str
    title: str
    source: str
    excerpt: str
    relevance: int = Field(ge=0, le=100)


class ActionRequest(BaseModel):
    id: str
    action: str
    reason: str
    risk: Literal["LOW", "MEDIUM", "HIGH"]
    expected_result: str
    state: Literal["PENDING", "APPROVED", "REJECTED", "EXECUTED"]


class Metrics(BaseModel):
    error_rate: float
    latency_p95: int
    db_connections: int
    cpu: int


class Incident(BaseModel):
    id: str
    title: str
    service: str
    severity: Severity
    status: IncidentStatus
    started_at: str
    summary: str
    root_cause: str | None = None
    confidence: int | None = None
    metrics_before: Metrics
    metrics_after: Metrics | None = None
    timeline: list[TimelineEvent]
    evidence: list[Evidence]
    action: ActionRequest | None = None
    scenario: str = "bad-deployment"
    postmortem: "Postmortem | None" = None


class Postmortem(BaseModel):
    summary: str
    impact: str
    root_cause: str
    resolution: str
    preventive_actions: list[str]
    evidence_ids: list[str]
    confidence: int


class ActionDecision(BaseModel):
    decision: Literal["approve", "reject"]


def now_label() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M")


SCENARIOS: dict[str, dict[str, object]] = {
    "bad-deployment": {
        "title": "Checkout API failures after deployment", "service": "checkout-api", "severity": Severity.high,
        "summary": "Checkout requests are failing with 503 responses shortly after release v2.8.1.",
        "root_cause": "Faulty deployment causing database connection pool exhaustion", "confidence": 87,
        "before": Metrics(error_rate=17.8, latency_p95=4800, db_connections=98, cpu=72),
        "action": ("Rollback checkout-api to v2.8.0", "The release correlates with the error spike and saturated database pool.", "Restore the last stable application version."),
        "evidence": [
            ("Connection Pool Troubleshooting", "Database Runbook · §4", "Pool saturation above 95% causes request queuing and cascading 503 responses.", 96),
            ("INC-812 Postmortem", "Incident History · 2025-11-18", "The previous checkout outage began four minutes after a release and cleared after rollback.", 91),
            ("Release v2.8.1", "Deployment Registry · checkout-api", "v2.8.1 reached 100% traffic at 14:27 UTC, immediately before the first alert.", 88),
        ],
    },
    "database-failure": {
        "title": "Checkout latency from database exhaustion", "service": "postgres", "severity": Severity.critical,
        "summary": "Database connections are saturated and checkout latency is climbing across healthy application pods.",
        "root_cause": "Database connection pool exhaustion", "confidence": 94,
        "before": Metrics(error_rate=11.2, latency_p95=6200, db_connections=99, cpu=81),
        "action": ("Restart checkout-api connection pools", "Database saturation is isolated from the application release path.", "Return connection usage below the saturation threshold."),
        "evidence": [("Pool Saturation Runbook", "Database Runbook · §2", "Connection usage above 95% causes queue growth and request timeouts.", 98), ("Postgres Health", "Metrics · postgres", "Available connections fell below the service reserve at 14:29 UTC.", 94)],
    },
    "memory-leak": {
        "title": "Auth API memory pressure", "service": "auth-api", "severity": Severity.high,
        "summary": "Memory usage has risen steadily for 46 minutes and containers are restarting under pressure.",
        "root_cause": "Unbounded session cache growth in auth-api", "confidence": 89,
        "before": Metrics(error_rate=6.4, latency_p95=2100, db_connections=52, cpu=88),
        "action": ("Restart auth-api instances", "The service is approaching its memory limit and restart is a reversible mitigation.", "Restore healthy memory headroom while the leak is investigated."),
        "evidence": [("Memory Leak Playbook", "SRE Runbook · §7", "A monotonic heap trend with restart churn indicates retained application state.", 95), ("Container Metrics", "Metrics · auth-api", "RSS grew from 420MB to 1.8GB without a corresponding traffic increase.", 92)],
    },
    "traffic-spike": {
        "title": "Checkout traffic surge", "service": "checkout-api", "severity": Severity.medium,
        "summary": "Request volume is 4.6x baseline while all dependency health checks remain green.",
        "root_cause": "Traffic surge exceeding current checkout capacity", "confidence": 92,
        "before": Metrics(error_rate=4.1, latency_p95=1800, db_connections=67, cpu=96),
        "action": ("Scale checkout-api to 12 replicas", "CPU saturation tracks a verified request-volume surge, not a dependency failure.", "Restore latency headroom without changing application state."),
        "evidence": [("Capacity Runbook", "Platform Runbook · §3", "Scale horizontally when CPU exceeds 85% with proportional request growth.", 94), ("Traffic Metrics", "Metrics · gateway", "Requests per second increased 4.6x in the last 12 minutes.", 97)],
    },
    "dependency-failure": {
        "title": "Payment provider timeouts", "service": "payment-api", "severity": Severity.critical,
        "summary": "The external payment provider is timing out while internal service health remains normal.",
        "root_cause": "Third-party payment provider degradation", "confidence": 96,
        "before": Metrics(error_rate=22.1, latency_p95=7100, db_connections=44, cpu=39),
        "action": ("Enable payment-provider circuit breaker", "Internal services are healthy; restarting them would not address the external timeout.", "Fail fast and preserve checkout capacity until the provider recovers."),
        "evidence": [("Dependency Failure Runbook", "SRE Runbook · §9", "Keep internal services running when an external dependency is the isolated failing component.", 99), ("Provider Health", "Synthetic Checks · payments", "Payment provider timeout rate reached 81% while internal probes stayed green.", 98)],
    },
}


def demo_incident(scenario: str = "bad-deployment", incident_id: str = "INC-1024") -> Incident:
    config = SCENARIOS[scenario]
    evidence = [Evidence(id=f"EV-{index:02d}", title=item[0], source=item[1], excerpt=item[2], relevance=item[3]) for index, item in enumerate(config["evidence"], 1)]
    action_text, reason, expected = config["action"]
    return Incident(
        id=incident_id,
        title=config["title"], service=config["service"], severity=config["severity"],
        status=IncidentStatus.approval,
        started_at="14:31 UTC",
        summary=config["summary"], root_cause=config["root_cause"], confidence=config["confidence"], metrics_before=config["before"], scenario=scenario,
        timeline=[
            TimelineEvent(time="14:31", label="INCIDENT CREATED", detail="Checkout API failures", kind="signal"),
            TimelineEvent(time="14:31", label="AI CLASSIFIED INCIDENT", detail="Severity HIGH · checkout-api", kind="analysis"),
            TimelineEvent(time="14:32", label="METRICS QUERIED", detail="Error rate 17.8% · p95 4.8s", kind="signal"),
            TimelineEvent(time="14:32", label="LOGS ANALYZED", detail="Connection pool timeout pattern found", kind="analysis"),
            TimelineEvent(time="14:33", label="RUNBOOK RETRIEVED", detail="Connection Pool Troubleshooting", kind="analysis"),
            TimelineEvent(time="14:33", label="ROOT CAUSE IDENTIFIED", detail="DB pool exhaustion · confidence 87%", kind="success"),
            TimelineEvent(time="14:34", label="ROLLBACK PROPOSED", detail="Restore v2.8.0", kind="action"),
        ],
        evidence=evidence, action=ActionRequest(id=f"ACT-{incident_id[4:]}", action=action_text, reason=reason, risk="MEDIUM", expected_result=expected, state="PENDING"),
    )


incidents: dict[str, Incident] = {"INC-1024": demo_incident()}

app = FastAPI(title="Aegis Incident Response API", version="0.1.0")
cors_origins = [origin.strip() for origin in os.getenv("AEGIS_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aegis-api"}


@app.get("/api/incidents", response_model=list[Incident])
def list_incidents() -> list[Incident]:
    return list(incidents.values())


@app.get("/api/incidents/{incident_id}", response_model=Incident)
def get_incident(incident_id: str) -> Incident:
    incident = incidents.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.post("/api/incidents/demo/{scenario}", response_model=Incident)
def launch_demo(scenario: str) -> Incident:
    if scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail="Unknown demo scenario")
    incident = demo_incident(scenario, f"INC-{len(incidents) + 1024}")
    incidents[incident.id] = incident
    return incident


@app.post("/api/incidents/{incident_id}/actions/{action_id}", response_model=Incident)
def decide_action(incident_id: str, action_id: str, decision: ActionDecision) -> Incident:
    incident = get_incident(incident_id)
    if incident.action is None or incident.action.id != action_id:
        raise HTTPException(status_code=404, detail="Action request not found")
    if incident.action.state != "PENDING":
        raise HTTPException(status_code=409, detail="Action request is already closed")
    incident.action.state = "APPROVED" if decision.decision == "approve" else "REJECTED"
    incident.timeline.append(TimelineEvent(time=now_label(), label=f"HUMAN {decision.decision.upper()}D", detail=incident.action.action, kind="action"))
    if decision.decision == "approve":
        incident.action.state = "EXECUTED"
        incident.status = IncidentStatus.resolved
        incident.metrics_after = Metrics(error_rate=0.7, latency_p95=420, db_connections=41, cpu=48)
        incident.timeline.extend([
            TimelineEvent(time=now_label(), label="REMEDIATION EXECUTED", detail=incident.action.expected_result, kind="action"),
            TimelineEvent(time=now_label(), label="VERIFICATION PASSED", detail="Error rate and latency returned to baseline", kind="success"),
            TimelineEvent(time=now_label(), label="INCIDENT RESOLVED", detail="Postmortem ready for review", kind="success"),
        ])
        incident.postmortem = Postmortem(summary=incident.summary, impact=f"{incident.service} experienced elevated errors and latency.", root_cause=incident.root_cause or "Unknown", resolution=incident.action.expected_result, preventive_actions=["Add an alert for the leading indicator before customer impact.", "Document the remediation in the service runbook."], evidence_ids=[item.id for item in incident.evidence], confidence=incident.confidence or 0)
    else:
        incident.status = IncidentStatus.blocked
        incident.timeline.append(TimelineEvent(time=now_label(), label="REMEDIATION BLOCKED", detail="Human reviewer rejected the proposed action", kind="analysis"))
    return incident


@app.get("/api/metrics")
def metrics() -> dict[str, object]:
    resolved = sum(item.status == IncidentStatus.resolved for item in incidents.values())
    return {"total_incidents": len(incidents), "successful_resolutions": resolved, "human_interventions": len(incidents), "failed_investigations": 0, "resolution_rate": round(resolved / len(incidents) * 100, 1) if incidents else 0}