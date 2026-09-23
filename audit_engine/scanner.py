import asyncio
import json
import logging
from typing import Dict, Any, List
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

class PlaywrightAuditScanner:
    def __init__(self, timeout_ms: int = 30000):
        self.timeout_ms = timeout_ms

    async def scan(self, url: str) -> Dict[str, Any]:
        """
        Executa um scan completo usando Playwright, capturando HTML,
        requições de rede (tags), dataLayer e console.
        """
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        results = {
            "url": url,
            "html": "",
            "network_requests": [],
            "console_messages": [],
            "dataLayer": [],
            "error": None
        }

        async with async_playwright() as p:
            # Lançar browser (desabilitar headless para dev/debug se quiser, mas em prod = headless)
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu"
                ]
            )
            
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GTMAuditBot/2.0",
                ignore_https_errors=True
            )
            
            page = await context.new_page()

            # Listeners
            page.on("request", lambda req: results["network_requests"].append({
                "url": req.url,
                "method": req.method,
                "resource_type": req.resource_type,
                "post_data": req.post_data
            }))

            page.on("console", lambda msg: results["console_messages"].append({
                "type": msg.type,
                "text": msg.text
            }))

            try:
                # Go to URL networkidle
                await page.goto(url, wait_until="networkidle", timeout=self.timeout_ms)
                
                # Scroll the page slightly to trigger lazy loading
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight/2)")
                await page.wait_for_timeout(2000)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1000)

                # Capture final HTML
                results["html"] = await page.content()

                # Extract dataLayer
                dataLayer_js = "window.dataLayer || []"
                raw_dl = await page.evaluate(dataLayer_js)
                if isinstance(raw_dl, list):
                    results["dataLayer"] = raw_dl

            except Exception as e:
                logger.error(f"Erro no Playwright scan para {url}: {str(e)}")
                results["error"] = str(e)
                
                # fallback HTML capture if we failed partially
                try:
                    results["html"] = await page.content()
                except:
                    pass
            finally:
                await browser.close()

        return results
