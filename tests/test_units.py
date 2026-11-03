"""Catalog / crawler / scoring unit tests."""
from datatrust.catalog import BY_ID, is_placeholder_id, vendors_for_url
from datatrust.crawler import normalize_link, select_pages


def test_beacon_vs_script_classification():
    m = dict((v.id, k) for v, k in vendors_for_url("https://region1.google-analytics.com/g/collect?v=2&tid=G-AAAA111122&en=page_view"))
    assert m == {"ga4": "beacon"}
    m = dict((v.id, k) for v, k in vendors_for_url("https://www.facebook.com/tr/?id=1&ev=PageView"))
    assert m == {"meta_pixel": "beacon"}
    m = dict((v.id, k) for v, k in vendors_for_url("https://connect.facebook.net/en_US/fbevents.js"))
    assert m == {"meta_pixel": "script"}


def test_generic_vendor_words_are_not_signatures():
    html = "We use HubSpot, Hotjar and hotjar.com. Criteo is great. <a href='https://www.hubspot.com'>x</a>"
    for vid in ("hubspot", "hotjar", "criteo"):
        assert list(BY_ID[vid].html_matches(html)) == []


def test_server_side_ga4_first_party_endpoint():
    m = dict((v.id, k) for v, k in vendors_for_url("https://sgtm.example.com/g/collect?v=2&tid=G-ABCD123456&en=page_view"))
    assert m == {"ga4": "beacon"}


def test_placeholders():
    assert is_placeholder_id("G-XXXXXXXXXX") and is_placeholder_id("GTM-XXXXXX") and is_placeholder_id("G-1234567890")
    assert not is_placeholder_id("G-TEST12345") and not is_placeholder_id("GTM-K9X2PQL")


def test_crawler_never_invents_and_filters():
    home = "https://shop.example.com/"
    links = ["/produto/camiseta", "/produto/camiseta?utm_source=x", "/politica-de-privacidade", "/contato",
             "/carrinho", "/logout", "/wp-admin/", "/img/a.jpg", "https://other.com/x", "#top", "mailto:a@b.com",
             "/p?add-to-cart=12", "/categoria/a?page=1", "/categoria/a?page=2", "https://www.shop.example.com/sobre"]
    res = select_pages(home, links, 10)
    urls = [c["url"] for c in res["selected"]]
    assert all(u.startswith("https://") for u in urls)
    assert any(u.endswith("/politica-de-privacidade") for u in urls)
    assert not any("logout" in u or "wp-admin" in u or ".jpg" in u or "other.com" in u or "add-to-cart" in u for u in urls)
    assert len([u for u in urls if "/categoria/a" in u]) == 1     # no query explosion
    assert len([u for u in urls if "/produto/camiseta" in u]) == 1
    # every selected URL came from the input list
    raw = {normalize_link(l, home) for l in links}
    assert set(urls) <= raw
    assert res["selected"][0]["reason"] == "privacy_policy"


def test_crawler_with_no_links_selects_nothing():
    assert select_pages("https://a.com/", [], 5)["selected"] == []
