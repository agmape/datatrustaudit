"""
Static (non-finding) engine messages -> pt-BR. The engine still emits English technical diagnostics;
the API renders them in the language requested. Anything that has no translation is reported in
``report["i18n"]["untranslated"]`` (visible diagnostics) instead of silently leaking English.
"""
from __future__ import annotations

import re
from typing import List, Optional, Tuple

EXACT_PT = {
    # limitations / disclaimers
    "Only publicly reachable pages were visited, without login; authenticated areas and post-login funnels are not observed.":
        "Foram visitadas apenas páginas públicas, sem login; áreas autenticadas e jornadas pós-login não são observadas.",
    "Server-side tracking (server-side GTM, Measurement Protocol, Conversions API) is invisible to a browser-based scanner.":
        "Rastreamento no servidor (GTM server-side, Measurement Protocol, API de Conversões) é invisível para um scanner baseado em navegador.",
    "Internal configuration of GA4/GTM (unpublished workspaces, triggers, retention, custom dimensions) cannot be observed.":
        "A configuração interna do GA4/GTM (workspaces não publicados, acionadores, retenção, dimensões personalizadas) não pode ser observada.",
    "Events that require user actions (add to cart, checkout, form submission) are only observed if they fire on page load.":
        "Eventos que dependem de ações do usuário (adicionar ao carrinho, checkout, envio de formulário) só são observados se dispararem na carga da página.",
    "The scanner's IP/location may differ from your visitors'; geo-targeted banners or tags may behave differently.":
        "O IP/local do scanner pode ser diferente do dos seus visitantes; banners ou tags segmentados por região podem se comportar de outra forma.",
    "Observation windows are a few seconds per phase; tags that fire later or on scroll/click are not observed.":
        "As janelas de observação duram poucos segundos por fase; tags que disparam depois, na rolagem ou no clique não são observadas.",
    "Findings are technical observations, not legal conclusions.":
        "Os achados são observações técnicas, não conclusões jurídicas.",
    "Runtime JavaScript, cookies and network behavior were not verified.":
        "JavaScript em tempo de execução, cookies e comportamento de rede não foram verificados.",
    "DataTrust Audit reports only what was observed in this scan. Items marked INFERRED, NOT_OBSERVED or UNVERIFIABLE are not facts about the site. Nothing here is legal advice or a determination of non-compliance; no fines or damages are estimated.":
        "O DataTrust Audit relata apenas o que foi observado neste teste. Itens marcados como Suspeita, Não observado ou Não verificado não são fatos sobre o site. Nada aqui é aconselhamento jurídico nem conclusão de não conformidade; nenhuma multa ou dano é estimado.",
    "Scan failed — no observation was made. Nothing in this response describes the website.":
        "A auditoria falhou — nenhuma observação foi feita. Nada nesta resposta descreve o site.",
    # error messages
    "Please enter a valid public http(s) URL.": "Informe uma URL pública http(s) válida.",
    "This address is not allowed (private, local or reserved network).": "Este endereço não é permitido (rede privada, local ou reservada).",
    "The domain could not be resolved.": "Não foi possível resolver o domínio.",
    "The website did not respond in time.": "O site não respondeu a tempo.",
    "The connection failed at protocol/TLS level.": "A conexão falhou no nível de protocolo/TLS.",
    "The website refused or blocked the scanner.": "O site recusou ou bloqueou o scanner.",
    "The website could not be fetched.": "Não foi possível acessar o site.",
    "The site redirected to a disallowed (private/reserved) address.": "O site redirecionou para um endereço não permitido (privado/reservado).",
    # scoring reasons
    "Global score withheld: the browser runtime was not observed (static or failed scan).":
        "Nota global retida: a execução no navegador não foi observada (varredura estática ou com falha).",
    "Scan failed; nothing was measured.": "A auditoria falhou; nada foi medido.",
    "No tracking technology was observed to evaluate.": "Nenhuma tecnologia de rastreamento foi observada para avaliar.",
    "No GA4 recommended event with a published parameter specification was observed firing; nothing to validate.":
        "Nenhum evento recomendado do GA4 com especificação publicada foi observado disparando; nada a validar.",
    "Runtime browser not observed.": "A execução no navegador não foi observada.",
    "No CMP observed; consent gating could not be evaluated. This is not a penalty — it may require analysis of purpose and legal basis.":
        "Nenhuma CMP observada; o bloqueio por consentimento não pôde ser avaliado. Isso não é penalização — pode exigir análise de finalidade e base legal.",
    "No consent check was applicable.": "Nenhuma verificação de consentimento era aplicável.",
    # tag notes
    "Collection request to the vendor endpoint observed.": "Requisição de coleta ao endpoint do fornecedor observada.",
    "No collection request to known vendor endpoints was observed during the observation window.":
        "Nenhuma requisição de coleta para endpoints conhecidos do fornecedor foi observada na janela de observação.",
    "Not applicable: this technology has no collection endpoint signature (loader/CMP).":
        "Não aplicável: esta tecnologia não tem assinatura de endpoint de coleta (carregador/CMP).",
    "Runtime not verified (no browser phase).": "Execução não verificada (sem fase de navegador).",
    # events
    "Observed in browser runtime (dataLayer/gtag/fbq) but no GA4 collection hit for this event was observed.":
        "Observado na execução do navegador (dataLayer/gtag/fbq), mas nenhum envio ao GA4 para este evento foi observado.",
    "implementation candidate detected; runtime firing not confirmed":
        "candidato de implementação detectado; disparo em execução não confirmado",
    # consent
    "No Google tags observed; Consent Mode not applicable.": "Nenhuma tag do Google observada; Consent Mode não se aplica.",
    "Runtime not verified; Consent Mode state unknown.": "Execução não verificada; estado do Consent Mode desconhecido.",
    "No CMP script/global or consent banner was observed, so no consent interaction was attempted.":
        "Nenhum script/variável global de CMP nem banner foi observado; por isso nenhuma interação de consentimento foi tentada.",
    "Generic click caused a navigation; result discarded.": "O clique genérico causou uma navegação; resultado descartado.",
    # privacy / network
    "Raw values are never stored or displayed. Online identifiers (client IDs, cookie IDs) are expected and not reported as PII findings.":
        "Valores brutos nunca são armazenados nem exibidos. Identificadores online (client IDs, IDs de cookie) são esperados e não são reportados como dado pessoal.",
    "Network, dataLayer and storage were not observed; personal-data exposure was not verified.":
        "Rede, dataLayer e armazenamento não foram observados; a exposição de dados pessoais não foi verificada.",
    "Recorded = vendor-matched, script, navigation, third-party, or PII-bearing requests. First-party images/styles/fonts are not stored.":
        "Registradas = requisições de fornecedores conhecidos, scripts, navegação, terceiros ou com dado pessoal. Imagens/estilos/fontes do próprio domínio não são armazenados.",
    "Observation window is a few seconds on one page; later navigation was not observed.":
        "A janela de observação dura poucos segundos em uma página; a navegação posterior não foi observada.",
    "Consent Mode may be configured server-side or only in some regions.":
        "O Consent Mode pode estar configurado apenas no servidor ou só em algumas regiões.",
    "Links rendered as images, inside iframes or only after interaction are not detected.":
        "Links exibidos como imagem, dentro de iframes ou somente após interação não são detectados.",
    "Consent phases are only run on the home page.": "As fases de consentimento só rodam na página inicial.",
    "Multi-page results use baseline only.": "Páginas adicionais usam apenas o cenário inicial.",
}

# (regex, template) — group numbers fill {0},{1}
PATTERNS_PT: List[Tuple[str, str]] = [
    (r"Global score withheld: only (\d+)% of the weighted axes could be measured \(minimum (\d+)%\)\.",
     "Nota global retida: apenas {0}% dos eixos ponderados puderam ser medidos (mínimo de {1}%)."),
    (r"A CMP/banner was observed but the scanner could not perform and verify a '(reject|accept) all' interaction automatically\. No post-(?:reject|accept) behavior is claimed\.",
     "Uma CMP/banner foi observada, mas o teste não conseguiu executar e confirmar automaticamente \"{0}\". Nenhum comportamento posterior é afirmado."),
    (r"'(reject|accept)' phase skipped: time budget exhausted\.", "Fase \"{0}\" pulada: orçamento de tempo esgotado."),
    (r"'(Reject|Accept) all' could not be performed automatically [—-] manual verification required\.",
     "\"{0} todos\" não pôde ser executado automaticamente — verificação manual necessária."),
    (r"discovered same-origin links: .*", "Links do mesmo domínio descobertos."),
]
_PT_ACTION = {"reject": "rejeitar todos", "accept": "aceitar todos", "Reject": "Rejeitar", "Accept": "Aceitar"}

CHECK_LABELS = {
    "pt-BR": {
        "gtm_single_load": "Cada contêiner do GTM carregado uma única vez por página",
        "ga4_single_page_view": "page_view do GA4 sem duplicidade",
        "meta_no_duplicates": "Meta Pixel sem inicialização/PageView duplicados",
        "no_legacy_ua": "Sem código do Universal Analytics (legado)",
        "no_placeholder_ids": "Sem IDs de exemplo publicados",
        "ga4_config_collects": "GA4 configurado realmente coleta",
        "no_duplicate_purchase": "transaction_id não enviado duas vezes",
        "no_tracking_before_interaction": "Sem rastreamento antes da interação com o consentimento",
        "reject_blocks_requests": "Sem rastreamento depois de \"Rejeitar todos\"",
        "reject_blocks_cookies": "Sem novos cookies de rastreamento depois de \"Rejeitar todos\"",
        "consent_mode_default_first": "Consent Mode padrão definido antes das tags do Google",
        "consent_mode_denied_after_reject": "Envios do GA4 após recusa indicam armazenamento negado",
        "no_pii_to_third_parties": "Nenhum valor de dado pessoal validado enviado a terceiros",
        "no_pii_in_datalayer": "Nenhum valor de dado pessoal validado no dataLayer/chamadas de tags",
        "no_pii_in_storage": "Nenhum valor de dado pessoal validado em cookies/armazenamento",
    },
    "en": {},
}
CHECK_REASONS_PT = {
    "runtime not observed": "execução no navegador não observada",
    "network not observed": "rede não observada",
    "runtime not observed ": "execução no navegador não observada",
    "storage not observed": "armazenamento não observado",
    "GTM not observed loading at runtime": "GTM não observado carregando em execução",
    "no GA4 page_view hit observed": "nenhum envio page_view ao GA4 observado",
    "Meta Pixel not observed at runtime": "Meta Pixel não observado em execução",
    "no analytics tags observed": "nenhuma tag de analytics observada",
    "no tags observed": "nenhuma tag observada",
    "GA4 not observed or consent gating not testable": "GA4 não observado ou bloqueio por consentimento não testável",
    "requires runtime + CMP observed": "requer execução no navegador e CMP observada",
    "no consent default command observed": "nenhum comando de consentimento padrão observado",
    "no GA4 hits with gcs in reject phase": "nenhum envio do GA4 com gcs na fase de recusa",
    "CMP present and accept interaction not performed; absence could be consent gating":
        "CMP presente e aceite não realizado; a ausência pode ser bloqueio por consentimento",
}
CHECK_REASON_PATTERNS_PT = [(r"reject interaction status: (.+)", "status da interação de recusa: {0}")]


def _fill(tpl: str, groups, lang: str) -> str:
    vals = []
    for g in groups:
        vals.append(_PT_ACTION.get(g, g))
    try:
        return tpl.format(*vals)
    except Exception:
        return tpl


def translate_static(text: Optional[str], lang: str, missing: Optional[list] = None) -> Optional[str]:
    """Translate a static engine message. English requests return the text unchanged."""
    if not text or lang != "pt-BR":
        return text
    if text in EXACT_PT:
        return EXACT_PT[text]
    for rx, tpl in PATTERNS_PT:
        m = re.fullmatch(rx, text)
        if m:
            return _fill(tpl, m.groups(), lang)
    if missing is not None and re.search(r"[A-Za-z]{4,}\s+[A-Za-z]{3,}", text):
        missing.append(text[:140])
    return text


def translate_check(check: dict, lang: str, missing: Optional[list] = None) -> dict:
    if lang != "pt-BR":
        return check
    out = dict(check)
    cid = check.get("id", "")
    if cid in CHECK_LABELS["pt-BR"]:
        out["label"] = CHECK_LABELS["pt-BR"][cid]
    elif cid.startswith("fires:"):
        label = check.get("label", "")
        m = re.match(r"(.+) sends a collection request on page load$", label)
        out["label"] = f"{m.group(1)} envia requisição de coleta na carga da página" if m else label
    elif cid.startswith("event:"):
        m = re.match(r"'(.+)' carries required parameters$", check.get("label", ""))
        out["label"] = f"'{m.group(1)}' traz os parâmetros obrigatórios" if m else check.get("label")
    reason = check.get("reason") or ""
    if reason in CHECK_REASONS_PT:
        out["reason"] = CHECK_REASONS_PT[reason]
    else:
        for rx, tpl in CHECK_REASON_PATTERNS_PT:
            m = re.fullmatch(rx, reason)
            if m:
                out["reason"] = tpl.format(*m.groups())
                break
        else:
            out["reason"] = translate_static(reason, lang, missing) if reason else reason
    return out
