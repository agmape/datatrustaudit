from audit_engine.score_engine import compute_event_architecture, compute_scores


def test_no_events_is_explicit_neutral_heuristic():
    assert compute_event_architecture(None) == 50


def test_score_is_deterministic_for_same_evidence():
    first = compute_scores([], None, None, [], None, None, [])
    second = compute_scores([], None, None, [], None, None, [])
    assert first.overall == second.overall
    assert first.explanation == second.explanation


def test_score_explanation_states_not_legal_compliance():
    result = compute_scores([], None, None, [], None, None, [])
    note = result.explanation["note"].lower()
    assert "not a legal compliance percentage" in note
    assert result.explanation["model"] == "weighted_technical_audit_score_v2"
