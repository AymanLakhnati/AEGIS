from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_demo_incident_contains_grounded_diagnosis() -> None:
    response = client.get("/api/incidents/INC-1024")
    assert response.status_code == 200
    body = response.json()
    assert body["root_cause"].startswith("Faulty deployment")
    assert len(body["evidence"]) == 3


def test_approval_resolves_incident_and_records_verification() -> None:
    response = client.post("/api/incidents/INC-1024/actions/ACT-1024", json={"decision": "approve"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "RESOLVED"
    assert body["metrics_after"]["error_rate"] == 0.7
    assert body["timeline"][-1]["label"] == "INCIDENT RESOLVED"


def test_demo_scenarios_have_distinct_diagnoses() -> None:
    expected = {
        "database-failure": "Database connection pool exhaustion",
        "memory-leak": "Unbounded session cache growth in auth-api",
        "traffic-spike": "Traffic surge exceeding current checkout capacity",
        "dependency-failure": "Third-party payment provider degradation",
    }
    for scenario, root_cause in expected.items():
        response = client.post(f"/api/incidents/demo/{scenario}")
        assert response.status_code == 200
        assert response.json()["root_cause"] == root_cause


def test_rejected_remediation_blocks_incident() -> None:
    incident = client.post("/api/incidents/demo/memory-leak").json()
    response = client.post(f"/api/incidents/{incident['id']}/actions/{incident['action']['id']}", json={"decision": "reject"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "BLOCKED"
    assert body["action"]["state"] == "REJECTED"
    assert body["timeline"][-1]["label"] == "REMEDIATION BLOCKED"


def test_closed_action_cannot_be_decided_twice() -> None:
    response = client.post("/api/incidents/INC-1024/actions/ACT-1024", json={"decision": "approve"})
    assert response.status_code == 409