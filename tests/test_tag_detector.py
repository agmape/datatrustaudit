from audit_engine.tag_detector import detect_tags


def test_meta_pixel_not_detected_from_unrelated_15_digit_number():
    html = "<html><body><p>123456789012345</p></body></html>"
    findings = detect_tags(html)
    assert not any(f.id == "meta_pixel" for f in findings)


def test_meta_pixel_detected_from_contextual_fbq_init():
    html = """
    <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
    <script>fbq('init', '123456789012345'); fbq('track', 'PageView');</script>
    """
    findings = detect_tags(html)
    meta = next(f for f in findings if f.id == "meta_pixel")
    assert meta.confidence in {"high", "medium"}
    assert meta.tag_id == "123456789012345"


def test_gtm_and_ga4_ids_are_detected():
    html = """
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEFGHIJ"></script>
    """
    findings = detect_tags(html)
    ids = {f.id: f.tag_id for f in findings}
    assert ids["gtm"] == "GTM-ABC123"
    assert ids["ga4"] == "G-ABCDEFGHIJ"
