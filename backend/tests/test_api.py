from fastapi.testclient import TestClient


def test_health_reports_missing_dependencies_without_failing(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["llm"]["available"] is False
    assert body["detector"]["available"] is False
    assert body["data"]["available"] is False


def test_data_routes_return_503_when_data_missing(client: TestClient) -> None:
    res = client.get("/api/scene")
    assert res.status_code == 503
    assert res.json()["error"] == "data_unavailable"


def test_unknown_analysis_returns_typed_404(golden_client: TestClient) -> None:
    res = golden_client.get("/api/analyses/nope")
    assert res.status_code == 404
    assert res.json() == {"error": "not_found", "detail": "analysis nope not found"}


def test_scene_and_images(golden_client: TestClient) -> None:
    scene = golden_client.get("/api/scene").json()
    assert scene["base"]["name"] == "Merkez Us"
    assert len(scene["zones"]) == 8
    (image,) = golden_client.get("/api/images").json()
    assert image["image_id"] == "img_000860" and image["zone"] == "Dogu Yolu"


def test_create_then_get_analysis_reuses_latest(golden_client: TestClient) -> None:
    first = golden_client.post("/api/analyses", json={"image_id": "img_000860"}).json()
    again = golden_client.post("/api/analyses", json={"image_id": "img_000860"}).json()
    fresh = golden_client.post(
        "/api/analyses", json={"image_id": "img_000860", "force_refresh": True}
    ).json()
    assert first == again and fresh != first

    analysis = golden_client.get(f"/api/analyses/{first['analysis_id']}").json()
    assert analysis["status"] == "done"
    assert [s["index"] for s in analysis["steps"]] == list(range(1, 9))
    assert analysis["brief"]["level"] == "CRITICAL"


def test_unknown_image_is_404(golden_client: TestClient) -> None:
    res = golden_client.post("/api/analyses", json={"image_id": "img_999999"})
    assert res.status_code == 404
