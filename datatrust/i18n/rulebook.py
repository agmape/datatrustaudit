"""
Rulebook: stable rule codes -> human text (pt-BR / en) + owner. The engine emits ONLY codes, data and
evidence; every sentence a manager reads is rendered here, in the language requested by the client.

Fields per language
  title     problem title
  found     "O que encontramos" (plain language)
  observed  impact that WAS observed in this scan (empty when nothing was observed)
  possible  impact that is only POSSIBLE (hypothesis to validate)
  ask       "O que pedir para a equipe": one objective task
  confirm   how to confirm the fix worked

Placeholders: {n} {requests} {vendors} {domains} {ids} {event} {missing} {kind} {times} {container}
{pixel} {tid} {cookies} {events} {granted} {technology} {status} {hosts}. Unknown ones render as "—".
Spanish falls back to English (flagged with ``translation_fallback``) rather than silently to another language.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

OWNERS = ("marketing", "agency", "development", "privacy")

RULES: Dict[str, Dict[str, Any]] = {
    # ── consent ────────────────────────────────────────────────────────────
    "TRACKING_BEFORE_CONSENT_INTERACTION": {
        "owner": "privacy",
        "pt": dict(
            title="Ferramentas de rastreamento enviaram dados antes de qualquer escolha no banner",
            found="Com um banner de cookies presente, o navegador de teste enviou {requests} requisição(ões) de coleta para {vendors} antes de qualquer clique no banner.",
            observed="Observamos o envio ocorrendo sem interação do visitante, em uma sessão limpa.",
            possible="Dependendo da finalidade e da base legal definidas pela empresa, isso pode exigir revisão do bloqueio por consentimento. Este teste não conclui nada jurídico.",
            ask="Revisar o bloqueio das tags não essenciais até o consentimento (regras do CMP e acionadores/verificações de consentimento no GTM) e repetir o teste em janela anônima.",
            confirm="Abrir o site em janela anônima, não clicar no banner e verificar na aba Rede que não há requisições para os destinos listados nas evidências."),
        "en": dict(
            title="Tracking tools sent data before any choice on the banner",
            found="With a cookie banner present, the test browser sent {requests} collection request(s) to {vendors} before any click on the banner.",
            observed="We observed the sending happening without visitor interaction, in a clean session.",
            possible="Depending on the purpose and legal basis chosen by the company, this may require reviewing consent-based blocking. This test makes no legal conclusion.",
            ask="Review blocking of non-essential tags until consent (CMP rules and GTM consent checks) and repeat the test in an incognito window.",
            confirm="Open the site in an incognito window, do not click the banner and check in the Network tab that there are no requests to the destinations listed in the evidence.")},
    "TRACKING_WITHOUT_OBSERVED_CMP": {
        "owner": "privacy",
        "pt": dict(
            title="Rastreamento observado e nenhuma plataforma de consentimento identificada neste teste",
            found="Foram observadas {requests} requisição(ões) de coleta para {vendors} e nenhuma plataforma de gestão de consentimento (CMP) foi identificada.",
            observed="O envio de dados foi observado; a ausência de CMP vale apenas para este teste.",
            possible="A empresa pode usar outra base legal, uma CMP não reconhecida ou exibir o banner só em certas regiões. Requer revisão manual de finalidade e base legal.",
            ask="Confirmar com privacidade/jurídico qual base legal sustenta cada ferramenta e se existe banner para outras regiões; documentar a decisão.",
            confirm="Documento interno com finalidade e base legal por ferramenta e, se aplicável, banner verificado nas regiões de público."),
        "en": dict(
            title="Tracking observed and no consent platform identified in this test",
            found="{requests} collection request(s) to {vendors} were observed and no consent management platform (CMP) was identified.",
            observed="Data sending was observed; the absence of a CMP only holds for this test.",
            possible="The company may rely on another legal basis, use a CMP we do not recognise, or show the banner only in some regions. Requires manual review of purpose and legal basis.",
            ask="Confirm with privacy/legal which legal basis supports each tool and whether a banner exists for other regions; document the decision.",
            confirm="Internal document with purpose and legal basis per tool and, if applicable, banner verified in the audience regions.")},
    "TRACKING_AFTER_REJECT": {
        "owner": "development",
        "pt": dict(
            title="Ferramentas continuaram enviando dados depois de \"Rejeitar todos\"",
            found="Depois que o teste clicou em recusar (clique confirmado), foram observadas {requests} requisição(ões) de coleta para {vendors}.",
            observed="O envio foi observado após a recusa, em sessão limpa.",
            possible="Pode indicar que a escolha do visitante não está sendo aplicada a todas as tags ou que o Consent Mode não foi atualizado.",
            ask="Garantir que a recusa atualize o estado de consentimento e que as tags respeitem esse estado; revisar tags de terceiros fora do GTM.",
            confirm="Em sessão limpa, clicar em \"Rejeitar todos\" e confirmar na aba Rede que as requisições listadas não ocorrem mais."),
        "en": dict(
            title="Tools kept sending data after \"Reject all\"",
            found="After the test clicked reject (click verified), {requests} collection request(s) to {vendors} were observed.",
            observed="Sending was observed after rejection, in a clean session.",
            possible="It may mean the visitor's choice is not applied to every tag, or Consent Mode was not updated.",
            ask="Make sure rejection updates the consent state and tags respect it; review third-party tags outside GTM.",
            confirm="In a clean session, click \"Reject all\" and confirm in the Network tab that the listed requests no longer occur.")},
    "TRACKING_COOKIES_SET_AFTER_REJECT": {
        "owner": "development",
        "pt": dict(
            title="Cookies de rastreamento foram gravados depois de \"Rejeitar todos\"",
            found="Cookies com nomes de tecnologias de rastreamento conhecidas apareceram só após a recusa: {cookies}. Os valores não foram armazenados.",
            observed="Os cookies foram vistos no navegador de teste após o clique de recusa.",
            possible="Pode indicar scripts de terceiros ignorando a escolha do visitante.",
            ask="Identificar qual script grava esses cookies e condicioná-lo ao consentimento.",
            confirm="Após recusar em sessão limpa, abrir Aplicativo > Cookies e verificar que esses cookies não aparecem."),
        "en": dict(
            title="Tracking cookies were set after \"Reject all\"",
            found="Cookies named after known tracking technologies appeared only after rejection: {cookies}. Values were not stored.",
            observed="The cookies were seen in the test browser after the reject click.",
            possible="It may indicate third-party scripts ignoring the visitor's choice.",
            ask="Identify which script sets these cookies and make it depend on consent.",
            confirm="After rejecting in a clean session, open Application > Cookies and check these cookies do not appear.")},
    "NO_TRACKING_OBSERVED_AFTER_REJECT": {
        "owner": "privacy",
        "pt": dict(
            title="Nenhum rastreamento observado depois de \"Rejeitar todos\"",
            found="Depois de uma recusa confirmada, não vimos requisições de coleta para destinos conhecidos nem novos cookies de rastreamento durante a janela de observação.",
            observed="",
            possible="A janela de observação é de poucos segundos em uma página; comportamentos posteriores não foram vistos.",
            ask="Nenhuma ação necessária para este ponto; manter o teste em rotinas de QA.",
            confirm="Repetir o teste após cada mudança no GTM ou no CMP."),
        "en": dict(
            title="No tracking observed after \"Reject all\"",
            found="After a verified rejection we saw no collection requests to known destinations and no new tracking cookies during the observation window.",
            observed="",
            possible="The observation window is a few seconds on one page; later behaviour was not seen.",
            ask="No action needed for this point; keep the test in QA routines.",
            confirm="Repeat the test after every GTM or CMP change.")},
    "TRACKING_AFTER_ACCEPT": {
        "owner": "marketing",
        "pt": dict(
            title="Comportamento das ferramentas depois de \"Aceitar todos\"",
            found="Depois do aceite, foram observadas requisições de coleta para: {vendors}. Fornecedores que só apareceram após o aceite (coerente com bloqueio por consentimento): {only_after}.",
            observed="Descrição do que foi observado após o aceite; não indica problema por si só.",
            possible="",
            ask="Usar como referência de comparação com o cenário de recusa.",
            confirm="Comparar com o cenário de recusa na aba de consentimento."),
        "en": dict(
            title="Tool behaviour after \"Accept all\"",
            found="After accepting, collection requests were observed for: {vendors}. Vendors that only appeared after acceptance (consistent with consent gating): {only_after}.",
            observed="Description of what was observed after acceptance; not a problem by itself.",
            possible="",
            ask="Use as a baseline to compare with the rejection scenario.",
            confirm="Compare with the rejection scenario in the consent tab.")},
    "CONSENT_REJECT_MANUAL_VERIFICATION": {
        "owner": "privacy",
        "pt": dict(
            title="Não foi possível testar \"Rejeitar todos\" automaticamente",
            found="Um banner/CMP foi observado, mas o teste não conseguiu executar e confirmar a recusa. Nada é afirmado sobre o comportamento depois da recusa.",
            observed="",
            possible="Banners com mais de uma etapa ou componentes personalizados podem exigir verificação manual.",
            ask="Testar manualmente a recusa em janela anônima e registrar se há envio de dados depois.",
            confirm="Registro do teste manual com as requisições observadas."),
        "en": dict(
            title="\"Reject all\" could not be tested automatically",
            found="A banner/CMP was observed, but the test could not perform and verify the rejection. Nothing is claimed about behaviour after rejection.",
            observed="",
            possible="Multi-step banners or custom components may require manual verification.",
            ask="Manually test rejection in an incognito window and record whether data is sent afterwards.",
            confirm="Record of the manual test with the observed requests.")},
    "CONSENT_ACCEPT_MANUAL_VERIFICATION": {
        "owner": "privacy",
        "pt": dict(
            title="Não foi possível testar \"Aceitar todos\" automaticamente",
            found="Um banner/CMP foi observado, mas o teste não conseguiu executar e confirmar o aceite.",
            observed="",
            possible="Isso limita a comparação entre os cenários de recusa e aceite.",
            ask="Testar manualmente o aceite e conferir se as ferramentas esperadas passam a coletar.",
            confirm="Registro do teste manual."),
        "en": dict(
            title="\"Accept all\" could not be tested automatically",
            found="A banner/CMP was observed, but the test could not perform and verify acceptance.",
            observed="",
            possible="This limits the comparison between the reject and accept scenarios.",
            ask="Manually test acceptance and check that the expected tools start collecting.",
            confirm="Record of the manual test.")},
    "CONSENT_BEHAVIOR_UNVERIFIED": {
        "owner": "development",
        "pt": dict(
            title="Comportamento de consentimento não verificado",
            found="As fases com navegador não rodaram, então requisições, cookies e interação com o banner não foram observados. Nada é afirmado sobre rastreamento antes ou depois do consentimento.",
            observed="",
            possible="Pode ter sido bloqueio do site ou falha do navegador de teste.",
            ask="Repetir a auditoria; se persistir, verificar se o site bloqueia navegadores automatizados.",
            confirm="Nova auditoria com status Completo."),
        "en": dict(
            title="Consent behaviour not verified",
            found="The browser phases did not run, so requests, cookies and banner interaction were not observed. Nothing is claimed about tracking before or after consent.",
            observed="",
            possible="It may have been site blocking or a test-browser failure.",
            ask="Repeat the audit; if it persists, check whether the site blocks automated browsers.",
            confirm="New audit with Completed status.")},
    "CMP_NOT_OBSERVED": {
        "owner": "privacy",
        "pt": dict(
            title="Nenhuma plataforma de consentimento foi observada",
            found="Não vimos script, variável global ou botão de consentimento conhecidos na página inicial neste teste.",
            observed="",
            possible="Banners podem depender da região ou usar implementações que não reconhecemos. Ausência de observação não prova ausência de CMP.",
            ask="Confirmar internamente se existe CMP e em quais regiões ele aparece.",
            confirm="Verificar o site a partir da região do público, em janela anônima."),
        "en": dict(
            title="No consent management platform was observed",
            found="We saw no known consent script, global variable or button on the home page in this test.",
            observed="",
            possible="Banners may depend on region or use implementations we do not recognise. Not observing is not proof of absence.",
            ask="Confirm internally whether a CMP exists and in which regions it appears.",
            confirm="Check the site from the audience's region, in an incognito window.")},
    "SCRIPT_BEFORE_CMP_IN_SOURCE": {
        "owner": "development",
        "pt": dict(
            title="Script de rastreamento aparece antes da CMP no código-fonte",
            found="No HTML original, scripts de rastreamento aparecem antes do script da CMP. A ordem no HTML não prova que o script executou ou enviou dados antes do consentimento.",
            observed="",
            possible="Se a CMP não bloquear esses scripts, eles podem executar antes da escolha do visitante. Veja os achados de comportamento observado.",
            ask="Carregar a CMP antes das demais tags ou confirmar que ela bloqueia os scripts até o consentimento.",
            confirm="Teste em sessão limpa sem clicar no banner: nenhuma requisição de coleta para esses fornecedores."),
        "en": dict(
            title="Tracking script appears before the CMP in the source code",
            found="In the original HTML, tracking scripts appear before the CMP script. HTML order does not prove the script ran or sent data before consent.",
            observed="",
            possible="If the CMP does not block these scripts, they may run before the visitor's choice. See the observed-behaviour findings.",
            ask="Load the CMP before other tags or confirm it blocks scripts until consent.",
            confirm="Clean-session test without clicking the banner: no collection requests to these vendors.")},
    "CONSENT_MODE_DENIED_PINGS": {
        "owner": "privacy",
        "pt": dict(
            title="Pings do Google sem cookies, com consentimento negado",
            found="{n} requisição(ões) do Google indicaram consentimento negado (gcs=G100), comportamento compatível com o Consent Mode avançado antes do consentimento.",
            observed="Observamos os pings; eles não usam cookies de publicidade/analytics.",
            possible="Se esse comportamento é adequado depende da análise jurídica da empresa; não há conclusão neste teste.",
            ask="Decidir com privacidade/jurídico entre Consent Mode básico e avançado e registrar a decisão.",
            confirm="Conferir o parâmetro gcs nas requisições antes e depois do consentimento."),
        "en": dict(
            title="Cookieless Google pings with consent denied",
            found="{n} Google request(s) indicated denied consent (gcs=G100), consistent with advanced Consent Mode before consent.",
            observed="We observed the pings; they do not use advertising/analytics cookies.",
            possible="Whether this is appropriate depends on the company's legal analysis; there is no conclusion in this test.",
            ask="Decide with privacy/legal between basic and advanced Consent Mode and record the decision.",
            confirm="Check the gcs parameter in requests before and after consent.")},
    "CONSENT_MODE_NOT_OBSERVED": {
        "owner": "agency",
        "pt": dict(
            title="Consent Mode do Google não observado",
            found="Há tags do Google, mas não vimos comando de consentimento padrão, parâmetro gcs nas requisições do GA4 nem estado de consentimento na fase inicial.",
            observed="",
            possible="O Consent Mode pode estar configurado só no servidor ou apenas em algumas regiões. Ausência de observação não prova ausência de implementação.",
            ask="Verificar se o Consent Mode está implementado (via CMP ou GTM) e em quais regiões.",
            confirm="Procurar gtag('consent', …) no dataLayer e o parâmetro gcs nas requisições /g/collect."),
        "en": dict(
            title="Google Consent Mode not observed",
            found="Google tags are present, but we saw no default consent command, no gcs parameter in GA4 requests and no consent state in the initial phase.",
            observed="",
            possible="Consent Mode may be configured only server-side or only in some regions. Not observing is not proof of absence.",
            ask="Check whether Consent Mode is implemented (via CMP or GTM) and in which regions.",
            confirm="Look for gtag('consent', …) in the dataLayer and the gcs parameter in /g/collect requests.")},
    "CONSENT_MODE_DEFAULT_AFTER_TAG": {
        "owner": "development",
        "pt": dict(
            title="Consent Mode padrão definido depois de uma tag do Google",
            found="O comando de consentimento padrão foi enviado ao dataLayer depois de um comando config/event do Google. O Google exige o padrão antes de qualquer tag disparar.",
            observed="Observamos a ordem real dos comandos no dataLayer.",
            possible="Os primeiros envios podem não respeitar o estado padrão de consentimento.",
            ask="Mover o comando de consentimento padrão para antes do snippet do Google tag/GTM.",
            confirm="No console, executar `dataLayer` e ver consent/default antes de config/event."),
        "en": dict(
            title="Default Consent Mode set after a Google tag",
            found="The default consent command was pushed to the dataLayer after a Google config/event command. Google requires the default before any tag fires.",
            observed="We observed the real order of commands in the dataLayer.",
            possible="Early hits may not respect the default consent state.",
            ask="Move the default consent command above the Google tag/GTM snippet.",
            confirm="In the console, run `dataLayer` and see consent/default before config/event.")},
    "CONSENT_MODE_V2_SIGNALS_MISSING": {
        "owner": "agency",
        "pt": dict(
            title="Consent Mode sem os sinais da versão 2",
            found="O comando de consentimento padrão não define ad_user_data e ad_personalization.",
            observed="Observamos o comando sem esses dois sinais.",
            possible="Recursos de publicidade do Google podem não funcionar como esperado sem esses sinais.",
            ask="Incluir ad_user_data e ad_personalization nos comandos default e update.",
            confirm="Inspecionar o comando consent default no dataLayer."),
        "en": dict(
            title="Consent Mode without version 2 signals",
            found="The default consent command does not set ad_user_data and ad_personalization.",
            observed="We observed the command without these two signals.",
            possible="Google advertising features may not work as expected without them.",
            ask="Add ad_user_data and ad_personalization to default and update commands.",
            confirm="Inspect the consent default command in the dataLayer.")},
    "CONSENT_MODE_DEFAULT_GRANTED": {
        "owner": "privacy",
        "pt": dict(
            title="Consent Mode concede armazenamento antes da interação",
            found="O estado padrão concede: {granted}. Requer revisão para saber se isso corresponde à estratégia de consentimento do público.",
            observed="Observamos o estado padrão no dataLayer.",
            possible="Pode ser intencional para certas regiões (campo region).",
            ask="Confirmar com privacidade se conceder por padrão é intencional e para quais regiões.",
            confirm="Conferir o comando consent default e seu campo region."),
        "en": dict(
            title="Consent Mode grants storage before interaction",
            found="The default state grants: {granted}. Requires review to see whether this matches the consent strategy for the audience.",
            observed="We observed the default state in the dataLayer.",
            possible="It may be intentional for certain regions (region field).",
            ask="Confirm with privacy whether granting by default is intentional and for which regions.",
            confirm="Check the consent default command and its region field.")},
    "CONSENT_MODE_SET_LATE_FLAG": {
        "owner": "development",
        "pt": dict(
            title="O próprio Google sinalizou que o consentimento foi definido tarde",
            found="O objeto interno do Google tag indica wasSetLate=true: o consentimento foi definido depois de as tags começarem.",
            observed="Observamos o sinalizador no navegador.",
            possible="Primeiros envios podem não ter respeitado o estado de consentimento.",
            ask="Definir o consentimento padrão antes de carregar o Google tag.",
            confirm="Repetir o teste e verificar que wasSetLate não é verdadeiro."),
        "en": dict(
            title="Google itself flagged that consent was set late",
            found="Google tag's internal object shows wasSetLate=true: consent was set after tags started.",
            observed="We observed the flag in the browser.",
            possible="Early hits may not have respected the consent state.",
            ask="Set the default consent before loading the Google tag.",
            confirm="Repeat the test and verify wasSetLate is not true.")},
    "CONSENT_MODE_GRANTED_AFTER_REJECT": {
        "owner": "development",
        "pt": dict(
            title="Envios do GA4 indicam armazenamento concedido depois de \"Rejeitar todos\"",
            found="Requisições do GA4 enviadas depois da recusa traziam um valor de gcs que indica armazenamento concedido.",
            observed="Observamos o parâmetro nas requisições após o clique.",
            possible="O Consent Mode pode não estar sendo atualizado para negado quando o visitante recusa.",
            ask="Enviar gtag('consent','update', {...:'denied'}) quando o visitante recusar.",
            confirm="Após recusar, conferir gcs nas requisições do GA4 (esperado: G100 ou equivalente negado)."),
        "en": dict(
            title="GA4 hits indicate granted storage after \"Reject all\"",
            found="GA4 requests sent after rejection carried a gcs value indicating granted storage.",
            observed="We observed the parameter in requests after the click.",
            possible="Consent Mode may not be updated to denied when the visitor rejects.",
            ask="Send gtag('consent','update', {...:'denied'}) when the visitor rejects.",
            confirm="After rejecting, check gcs in GA4 requests (expected: G100 or an equivalent denied value).")},
    # ── implementation ─────────────────────────────────────────────────────
    "GTM_CONTAINER_LOADED_MULTIPLE_TIMES": {
        "owner": "development",
        "pt": dict(
            title="O mesmo contêiner do GTM foi carregado mais de uma vez",
            found="O contêiner {container} foi inserido ou requisitado {times} vezes em uma única carga de página.",
            observed="Contamos as inserções reais do script no navegador.",
            possible="Contêineres duplicados podem disparar cada tag duas vezes, distorcendo relatórios.",
            ask="Manter exatamente um snippet por contêiner por página (revisar tema, plugins e snippets fixos no código).",
            confirm="No DevTools > Rede, filtrar por 'gtm.js' e ver uma única requisição para esse ID."),
        "en": dict(
            title="The same GTM container was loaded more than once",
            found="Container {container} was injected or requested {times} times in a single page load.",
            observed="We counted the real script insertions in the browser.",
            possible="Duplicate containers can fire each tag twice, distorting reports.",
            ask="Keep exactly one snippet per container per page (review theme, plugins and hard-coded snippets).",
            confirm="In DevTools > Network, filter 'gtm.js' and see a single request for that ID.")},
    "GTM_SNIPPET_REPEATED_IN_SOURCE": {
        "owner": "development",
        "pt": dict(
            title="O snippet do GTM aparece mais vezes que o normal no código-fonte",
            found="O HTML contém mais assinaturas do GTM para {ids} do que uma instalação padrão (um script e um noscript).",
            observed="",
            possible="A duplicação em tempo de execução só é confirmada se o contêiner for requisitado mais de uma vez.",
            ask="Revisar o código-fonte para remover snippets repetidos.",
            confirm="Contar os snippets no código-fonte e as requisições gtm.js."),
        "en": dict(
            title="The GTM snippet appears more often than normal in the source code",
            found="The HTML contains more GTM signatures for {ids} than a standard install (one script and one noscript).",
            observed="",
            possible="Runtime duplication is only confirmed if the container is requested more than once.",
            ask="Review the source code and remove repeated snippets.",
            confirm="Count the snippets in the source and the gtm.js requests.")},
    "GTM_MULTIPLE_CONTAINERS": {
        "owner": "agency",
        "pt": dict(
            title="Mais de um contêiner do GTM em uso",
            found="Contêineres observados: {ids}. Vários contêineres são válidos, mas aumentam o risco de tags duplicadas e de consentimento inconsistente.",
            observed="Os contêineres foram vistos carregando no navegador.",
            possible="Pode ser intencional (agência, marca, regiões).",
            ask="Confirmar que cada contêiner tem dono e finalidade e que não há tags repetidas entre eles.",
            confirm="Inventário de contêineres com dono e finalidade."),
        "en": dict(
            title="More than one GTM container in use",
            found="Containers observed: {ids}. Several containers are valid but increase the risk of duplicate tags and inconsistent consent.",
            observed="The containers were seen loading in the browser.",
            possible="It may be intentional (agency, brand, regions).",
            ask="Confirm each container has an owner and purpose and there are no repeated tags between them.",
            confirm="Container inventory with owner and purpose.")},
    "GA4_MULTIPLE_MEASUREMENT_IDS": {
        "owner": "agency",
        "pt": dict(
            title="Mais de um ID de medição do GA4 observado",
            found="IDs observados: {ids}. Pode ser intencional (propriedades diferentes) ou sobra de configuração.",
            observed="Os IDs foram vistos em requisições reais.",
            possible="Não é duplicação por si só: cada ID pode enviar para uma propriedade diferente.",
            ask="Confirmar o objetivo de cada ID e remover os que não são mais usados.",
            confirm="Lista de IDs com propriedade e dono."),
        "en": dict(
            title="More than one GA4 measurement ID observed",
            found="IDs observed: {ids}. It may be intentional (different properties) or leftover configuration.",
            observed="The IDs were seen in real requests.",
            possible="It is not duplication by itself: each ID may send to a different property.",
            ask="Confirm the purpose of each ID and remove those no longer used.",
            confirm="List of IDs with property and owner.")},
    "PLACEHOLDER_TAG_ID": {
        "owner": "development",
        "pt": dict(
            title="ID de exemplo publicado no código de {technology}",
            found="Identificadores de exemplo no código: {ids}. Provavelmente um modelo foi publicado sem o ID real.",
            observed="Vimos o ID de exemplo no código da página.",
            possible="Os dados dessa ferramenta podem não estar sendo coletados.",
            ask="Substituir pelo ID real ou remover o snippet.",
            confirm="Procurar o ID de exemplo no código-fonte; não deve mais existir."),
        "en": dict(
            title="Placeholder ID published in {technology} code",
            found="Placeholder identifiers in the code: {ids}. A template was probably published without the real ID.",
            observed="We saw the placeholder ID in the page code.",
            possible="Data for this tool may not be collected.",
            ask="Replace it with the real ID or remove the snippet.",
            confirm="Search the source for the placeholder ID; it should no longer exist.")},
    "UNIVERSAL_ANALYTICS_LEGACY": {
        "owner": "agency",
        "pt": dict(
            title="Código do Universal Analytics (legado) presente",
            found="O Universal Analytics deixou de processar dados (propriedades padrão em 1º de julho de 2023). Requisições a ele não geram mais relatórios.",
            observed="Vimos o código ou as requisições do Universal Analytics.",
            possible="Pode haver dados sendo enviados sem uso.",
            ask="Remover analytics.js e chamadas ga() e manter apenas o GA4.",
            confirm="Nenhuma requisição para google-analytics.com/analytics.js ou /collect v=1."),
        "en": dict(
            title="Universal Analytics (legacy) code present",
            found="Universal Analytics stopped processing data (standard properties on 1 July 2023). Requests to it no longer produce reports.",
            observed="We saw Universal Analytics code or requests.",
            possible="Data may be sent without being used.",
            ask="Remove analytics.js and ga() calls and keep only GA4.",
            confirm="No requests to google-analytics.com/analytics.js or /collect v=1.")},
    "GA4_CONFIGURED_NO_COLLECTION_OBSERVED": {
        "owner": "agency",
        "pt": dict(
            title="GA4 configurado, mas nenhuma requisição de coleta foi observada",
            found="O código ou script do GA4 foi observado, mas nenhuma requisição para o coletor do GA4 (/g/collect) apareceu na janela de observação.",
            observed="",
            possible="Se uma CMP bloqueia o GA4 até o consentimento, isso é esperado. Também pode indicar tag quebrada ou ID incorreto.",
            ask="Verificar no DebugView do GA4 e no Tag Assistant se a tag dispara e com qual ID.",
            confirm="Requisições /g/collect visíveis na aba Rede e eventos no DebugView."),
        "en": dict(
            title="GA4 configured, but no collection request was observed",
            found="GA4 code or script was observed, but no request to the GA4 collector (/g/collect) appeared during the observation window.",
            observed="",
            possible="If a CMP blocks GA4 until consent this is expected. It may also indicate a broken tag or wrong ID.",
            ask="Check in GA4 DebugView and Tag Assistant whether the tag fires and with which ID.",
            confirm="/g/collect requests visible in the Network tab and events in DebugView.")},
    "GA4_DUPLICATE_PAGE_VIEW": {
        "owner": "agency",
        "pt": dict(
            title="A mesma visualização de página foi enviada mais de uma vez ao GA4",
            found="{times} envios de page_view para {tid}, na mesma página e no mesmo estado de consentimento, em uma única carga ({phase}).",
            observed="Vimos {times} requisições page_view para o mesmo destino e a mesma página. Isso confirma o envio repetido, mas não prova como o GA4 processou.",
            possible="Visualizações e sessões podem ficar infladas nos relatórios.",
            ask="Revisar o envio de page_view: verificar instalações simultâneas pelo código do site e pelo GTM e se há page_view manual além do automático; repetir o teste.",
            confirm="Filtrar /g/collect com en=page_view na aba Rede: um envio por carregamento de página."),
        "en": dict(
            title="The same page view was sent to GA4 more than once",
            found="{times} page_view hits to {tid}, on the same page and consent state, in a single load ({phase}).",
            observed="We saw {times} page_view requests to the same destination and page. This confirms repeated sending but does not prove how GA4 processed it.",
            possible="Page views and sessions may be inflated in reports.",
            ask="Review page_view sending: check simultaneous installs in site code and GTM and whether a manual page_view exists besides the automatic one; repeat the test.",
            confirm="Filter /g/collect with en=page_view in the Network tab: one hit per page load.")},
    "GA4_DUPLICATE_PURCHASE": {
        "owner": "development",
        "pt": dict(
            title="O mesmo transaction_id foi enviado mais de uma vez",
            found="Foram observados {times} envios de purchase com o mesmo transaction_id na mesma página.",
            observed="Vimos as requisições repetidas.",
            possible="Receita e número de compras podem ficar duplicados nos relatórios.",
            ask="Disparar purchase uma única vez por transaction_id (inclusive ao recarregar a página de confirmação).",
            confirm="Recarregar a página de confirmação em ambiente de teste e verificar que não há novo purchase."),
        "en": dict(
            title="The same transaction_id was sent more than once",
            found="{times} purchase hits with the same transaction_id were observed on the same page.",
            observed="We saw the repeated requests.",
            possible="Revenue and purchase counts may be duplicated in reports.",
            ask="Fire purchase only once per transaction_id (including when reloading the confirmation page).",
            confirm="Reload the confirmation page in a test environment and verify no new purchase is sent.")},
    "META_PIXEL_DUPLICATE_INIT": {
        "owner": "agency",
        "pt": dict(
            title="Meta Pixel inicializado mais de uma vez",
            found="fbq('init') foi chamado {times} vezes para o pixel {pixel} em uma única carga.",
            observed="Vimos as chamadas no navegador.",
            possible="Eventos podem ser contados em dobro nas campanhas.",
            ask="Garantir uma única inicialização por pixel (verificar instalação direta e via GTM).",
            confirm="Uma única chamada fbq('init') por pixel."),
        "en": dict(
            title="Meta Pixel initialised more than once",
            found="fbq('init') was called {times} times for pixel {pixel} in a single load.",
            observed="We saw the calls in the browser.",
            possible="Events may be counted twice in campaigns.",
            ask="Ensure a single initialisation per pixel (check direct and GTM installs).",
            confirm="A single fbq('init') call per pixel.")},
    "META_PIXEL_DUPLICATE_PAGEVIEW": {
        "owner": "agency",
        "pt": dict(
            title="PageView do Meta enviado mais de uma vez",
            found="Mais de um PageView para o pixel {pixel} foi observado em uma única carga ({times}).",
            observed="Vimos as requisições repetidas para o mesmo pixel.",
            possible="Visualizações podem ser contadas em dobro nas campanhas.",
            ask="Revisar instalações simultâneas do pixel (código do site e GTM).",
            confirm="Um único PageView por carga na aba Rede."),
        "en": dict(
            title="Meta PageView sent more than once",
            found="More than one PageView for pixel {pixel} was observed in a single load ({times}).",
            observed="We saw the repeated requests to the same pixel.",
            possible="Views may be counted twice in campaigns.",
            ask="Review simultaneous pixel installs (site code and GTM).",
            confirm="A single PageView per load in the Network tab.")},
    "DATALAYER_REASSIGNED_AFTER_GTM": {
        "owner": "development",
        "pt": dict(
            title="dataLayer reatribuído depois do snippet do GTM (ordem no código)",
            found="`dataLayer = [...]` aparece depois do snippet do GTM no HTML. Se executar depois, substitui a lista que o GTM observa e envios seguintes podem ser ignorados.",
            observed="",
            possible="A ordem no HTML não prova o efeito em tempo de execução.",
            ask="Usar `window.dataLayer = window.dataLayer || [];` antes de qualquer push.",
            confirm="Procurar `dataLayer = [` após o snippet do GTM; não deve existir."),
        "en": dict(
            title="dataLayer re-assigned after the GTM snippet (source order)",
            found="`dataLayer = [...]` appears after the GTM snippet in the HTML. If it runs later it replaces the array GTM listens to and later pushes may be ignored.",
            observed="",
            possible="HTML order does not prove the runtime effect.",
            ask="Use `window.dataLayer = window.dataLayer || [];` before any push.",
            confirm="Search for `dataLayer = [` after the GTM snippet; it should not exist.")},
    # ── events ─────────────────────────────────────────────────────────────
    "EVENT_MISSING_REQUIRED_PARAMS": {
        "owner": "development",
        "pt": dict(
            title="Evento \"{event}\" observado sem parâmetros obrigatórios",
            found="O evento {event} foi observado com os seguintes itens ausentes: {missing}. Exigências conforme a referência oficial do GA4 para esse evento.",
            observed="O evento foi capturado em execução; a ausência refere-se ao que foi capturado.",
            possible="Relatórios de receita ou produtos podem ficar incompletos para esse evento.",
            ask="Enviar os parâmetros obrigatórios de {event} (veja a referência oficial de eventos do GA4) e repetir o teste.",
            confirm="No DebugView do GA4, o evento aparece com todos os parâmetros exigidos."),
        "en": dict(
            title="Event \"{event}\" observed without required parameters",
            found="Event {event} was observed with these items missing: {missing}. Requirements follow the official GA4 reference for this event.",
            observed="The event was captured at runtime; the absence refers to what was captured.",
            possible="Revenue or product reports may be incomplete for this event.",
            ask="Send the required parameters for {event} (see the official GA4 events reference) and repeat the test.",
            confirm="In GA4 DebugView the event appears with all required parameters.")},
    "EVENT_CODE_CANDIDATES_NOT_FIRED": {
        "owner": "agency",
        "pt": dict(
            title="Eventos presentes só no código, sem disparo confirmado",
            found="Nomes de evento foram encontrados no código, mas não foram observados disparando: {events}. Candidato de implementação detectado; disparo em execução não confirmado.",
            observed="",
            possible="Eles podem depender de ações do usuário (adicionar ao carrinho, finalizar compra). \"Não observado neste cenário\" não é \"ausente\".",
            ask="Validar esses eventos em um roteiro de teste que execute as ações correspondentes.",
            confirm="Evento visível no DebugView ao executar a ação."),
        "en": dict(
            title="Events present only in code, firing not confirmed",
            found="Event names were found in code but not observed firing: {events}. Implementation candidate detected; runtime firing not confirmed.",
            observed="",
            possible="They may depend on user actions (add to cart, checkout). \"Not observed in this scenario\" is not \"absent\".",
            ask="Validate these events in a test script that performs the corresponding actions.",
            confirm="Event visible in DebugView when performing the action.")},
    # ── privacy ────────────────────────────────────────────────────────────
    "PII_VALUE_SENT_TO_THIRD_PARTY": {
        "owner": "privacy",
        "pt": dict(
            title="Valor com formato de dado pessoal observado em requisições a terceiros",
            found="Um valor com padrão validado de {kind} apareceu em requisição(ões) para {domains}. O valor foi mascarado e nunca armazenado.",
            observed="Observamos o valor em requisições reais; não armazenamos o conteúdo.",
            possible="Pode configurar compartilhamento de dados pessoais com terceiros; a licitude depende de finalidade, base legal e contratos. Requer revisão jurídica/manual.",
            ask="Remover dados pessoais de URLs e payloads enviados a ferramentas de analytics/mídia; avaliar recursos de dados do usuário com hash e consentimento.",
            confirm="Reproduzir o fluxo e conferir nas requisições que o valor não é mais enviado."),
        "en": dict(
            title="Value shaped like personal data observed in third-party requests",
            found="A value matching a validated {kind} pattern appeared in request(s) to {domains}. The value was masked and never stored.",
            observed="We observed the value in real requests; we did not store the content.",
            possible="It may amount to sharing personal data with third parties; lawfulness depends on purpose, legal basis and contracts. Requires legal/manual review.",
            ask="Remove personal data from URLs and payloads sent to analytics/media tools; evaluate hashed, consented user-data features.",
            confirm="Reproduce the flow and check in the requests that the value is no longer sent.")},
    "PII_VALUE_IN_DATALAYER": {
        "owner": "development",
        "pt": dict(
            title="Valor com formato de dado pessoal no dataLayer",
            found="Um valor com padrão validado de {kind} estava em dados do dataLayer ou de chamadas de tags. Qualquer tag que leia o dataLayer pode encaminhá-lo. Valor mascarado.",
            observed="Observamos o valor no navegador.",
            possible="Pode ser encaminhado a terceiros por tags que leem o dataLayer.",
            ask="Não colocar dados pessoais em claro no dataLayer; enviar apenas identificadores necessários.",
            confirm="Executar `dataLayer` no console e conferir que não há dados pessoais em claro."),
        "en": dict(
            title="Value shaped like personal data in the dataLayer",
            found="A value matching a validated {kind} pattern was in dataLayer or tag-call data. Any tag reading the dataLayer can forward it. Value masked.",
            observed="We observed the value in the browser.",
            possible="It may be forwarded to third parties by tags reading the dataLayer.",
            ask="Do not put personal data in clear in the dataLayer; send only necessary identifiers.",
            confirm="Run `dataLayer` in the console and check there is no personal data in clear.")},
    "PII_VALUE_IN_BROWSER_STORAGE": {
        "owner": "development",
        "pt": dict(
            title="Valor com formato de dado pessoal em cookie ou armazenamento do navegador",
            found="Um valor com padrão validado de {kind} está guardado no navegador. Qualquer script da origem pode lê-lo. Valor mascarado.",
            observed="Observamos o valor guardado no navegador de teste.",
            possible="Aumenta a exposição a scripts de terceiros.",
            ask="Evitar guardar dados pessoais em claro em cookies/localStorage.",
            confirm="Inspecionar Aplicativo > Armazenamento."),
        "en": dict(
            title="Value shaped like personal data in cookie or browser storage",
            found="A value matching a validated {kind} pattern is stored in the browser. Any script on the origin can read it. Value masked.",
            observed="We observed the value stored in the test browser.",
            possible="It increases exposure to third-party scripts.",
            ask="Avoid storing personal data in clear in cookies/localStorage.",
            confirm="Inspect Application > Storage.")},
    "PII_VALUE_IN_FIRST_PARTY_URL": {
        "owner": "development",
        "pt": dict(
            title="Valor com formato de dado pessoal em URL ou requisição do próprio site",
            found="Um valor com padrão validado de {kind} apareceu em URL/corpo de requisição ao próprio domínio. URLs ficam em logs, referências e no page_location do analytics. Valor mascarado.",
            observed="Observamos o valor na requisição.",
            possible="Pode se propagar para ferramentas de analytics por meio da URL.",
            ask="Remover dados pessoais de URLs; usar POST ou identificadores opacos.",
            confirm="Reproduzir o fluxo e conferir que a URL não carrega mais o dado."),
        "en": dict(
            title="Value shaped like personal data in a first-party URL or request",
            found="A value matching a validated {kind} pattern appeared in the URL/body of a request to the site's own domain. URLs end up in logs, referrers and analytics page_location. Value masked.",
            observed="We observed the value in the request.",
            possible="It may propagate to analytics tools through the URL.",
            ask="Remove personal data from URLs; use POST or opaque identifiers.",
            confirm="Reproduce the flow and check the URL no longer carries the data.")},
    "HASHED_IDENTIFIER_SENT": {
        "owner": "privacy",
        "pt": dict(
            title="Identificadores com hash enviados",
            found="Foram observados valores com hash em chaves como {keys} (por exemplo, correspondência avançada). Hash é pseudonimização: o dado geralmente continua sendo pessoal.",
            observed="Vimos os valores com hash nas requisições.",
            possible="Requer base legal e transparência adequadas para esse tratamento.",
            ask="Confirmar com privacidade se a correspondência avançada está prevista e amparada.",
            confirm="Conferir os parâmetros ud[...] nas requisições do pixel."),
        "en": dict(
            title="Hashed identifiers sent",
            found="Hashed values were observed under keys such as {keys} (for example advanced matching). Hashing is pseudonymisation: the data generally remains personal data.",
            observed="We saw the hashed values in the requests.",
            possible="Requires an adequate legal basis and transparency for this processing.",
            ask="Confirm with privacy that advanced matching is planned and supported.",
            confirm="Check the ud[...] parameters in pixel requests.")},
    "CREDENTIAL_LIKE_PARAMETER": {
        "owner": "development",
        "pt": dict(
            title="Parâmetro com aparência de credencial observado",
            found="Chaves como {keys} com valores não vazios foram observadas. Valores mascarados.",
            observed="Observamos as chaves em requisições.",
            possible="Credenciais em URLs ou payloads podem ser registradas em logs de terceiros.",
            ask="Confirmar se é uma chave pública do SDK; caso contrário, remover o segredo do navegador.",
            confirm="Revisar a requisição e a documentação do fornecedor."),
        "en": dict(
            title="Credential-like parameter observed",
            found="Keys such as {keys} with non-empty values were observed. Values masked.",
            observed="We observed the keys in requests.",
            possible="Credentials in URLs or payloads may be logged by third parties.",
            ask="Confirm whether it is a public SDK key; otherwise remove the secret from the browser.",
            confirm="Review the request and the vendor's documentation.")},
    "PII_KEY_PATTERN": {
        "owner": "development",
        "pt": dict(
            title="Chaves que costumam carregar dados pessoais foram observadas",
            found="Foram observadas chaves como {keys}, mas seus valores NÃO corresponderam a padrões validados de dado pessoal (valores ocultados). Isso não é evidência de que dado pessoal foi enviado.",
            observed="",
            possible="Se esses campos receberem dados reais em algum fluxo, a exposição seria possível.",
            ask="Verificar nos fluxos reais se essas chaves recebem dados pessoais em claro.",
            confirm="Reproduzir o fluxo (ex.: formulário) e inspecionar o valor real dessas chaves."),
        "en": dict(
            title="Keys that usually carry personal data were observed",
            found="Keys such as {keys} were observed, but their values did NOT match validated personal-data patterns (values hidden). This is not evidence that personal data was sent.",
            observed="",
            possible="If these fields receive real data in some flow, exposure would be possible.",
            ask="Check in real flows whether these keys receive personal data in clear.",
            confirm="Reproduce the flow (e.g. form) and inspect the real value of these keys.")},
    "POLICY_LINK_NOT_OBSERVED": {
        "owner": "privacy",
        "pt": dict(
            title="Link para política de privacidade/cookies não observado na página inicial",
            found="Não vimos link cujo texto ou endereço pareça política de privacidade/cookies na página inicial renderizada.",
            observed="",
            possible="Links em imagens, iframes ou só após interação não são detectados.",
            ask="Confirmar que há link visível para a política (rodapé ou menu).",
            confirm="Link visível na página inicial."),
        "en": dict(
            title="Privacy/cookie policy link not observed on the home page",
            found="We saw no link whose text or address looks like a privacy/cookie policy on the rendered home page.",
            observed="",
            possible="Links in images, iframes or only after interaction are not detected.",
            ask="Confirm a visible link to the policy exists (footer or menu).",
            confirm="Visible link on the home page.")},
    # ── scan ───────────────────────────────────────────────────────────────
    "SCAN_STATIC_ONLY": {
        "owner": "development",
        "pt": dict(
            title="Somente o HTML foi analisado: execução no navegador não verificada",
            found="JavaScript em tempo de execução, cookies e rede não foram verificados. O navegador não concluiu a carga e apenas o código-fonte inicial foi inspecionado.",
            observed="",
            possible="Tags carregadas dinamicamente e todo o comportamento de consentimento podem não aparecer.",
            ask="Repetir a auditoria; se persistir, verificar se o site bloqueia navegadores automatizados.",
            confirm="Nova auditoria com cobertura de execução no navegador."),
        "en": dict(
            title="Only the HTML was analysed: browser execution not verified",
            found="Runtime JavaScript, cookies and network behaviour were not verified. The browser did not complete the load and only the initial source was inspected.",
            observed="",
            possible="Dynamically loaded tags and all consent behaviour may not appear.",
            ask="Repeat the audit; if it persists, check whether the site blocks automated browsers.",
            confirm="New audit with browser-execution coverage.")},
    "POSSIBLE_BOT_PROTECTION": {
        "owner": "development",
        "pt": dict(
            title="A página inicial respondeu com HTTP {http_status}",
            found="O site pode ter entregue uma página de proteção contra robôs ou de erro ao teste; as observações podem não refletir o que visitantes reais recebem.",
            observed="Observamos o código HTTP da resposta.",
            possible="Resultados desta auditoria podem estar incompletos.",
            ask="Liberar o teste no firewall/WAF para uma auditoria representativa ou realizar a verificação manualmente.",
            confirm="Nova auditoria com código HTTP 200 e página real."),
        "en": dict(
            title="The home page answered with HTTP {http_status}",
            found="The site may have served a bot-protection or error page to the test; observations may not reflect what real visitors receive.",
            observed="We observed the HTTP status of the response.",
            possible="This audit's results may be incomplete.",
            ask="Allow the test in the firewall/WAF for a representative audit or verify manually.",
            confirm="New audit with HTTP 200 and the real page.")},
    "REQUESTS_BLOCKED_BY_SSRF_GUARD": {
        "owner": "development",
        "pt": dict(
            title="Algumas requisições foram bloqueadas pela proteção de rede do scanner",
            found="{n} requisição(ões) para destinos privados ou reservados foram bloqueadas ({hosts}). O comportamento que depende delas não foi observado.",
            observed="",
            possible="Páginas que chamam endereços internos não podem ser totalmente avaliadas por um scanner público.",
            ask="Nenhuma ação obrigatória; avaliar se a página deveria chamar endereços internos.",
            confirm="—"),
        "en": dict(
            title="Some requests were blocked by the scanner's network protection",
            found="{n} request(s) to private or reserved destinations were blocked ({hosts}). Behaviour depending on them was not observed.",
            observed="",
            possible="Pages calling internal addresses cannot be fully assessed by a public scanner.",
            ask="No mandatory action; consider whether the page should call internal addresses.",
            confirm="—")},
    "REJECT_TIMING_AMBIGUOUS": {
        "owner": "privacy",
        "pt": dict(
            title="Algumas requisições coincidiram com o clique de recusa",
            found="{n} requisição(ões) de rastreamento ocorreram durante o clique e não são atribuídas a antes nem depois da interação.",
            observed="",
            possible="Não indica problema por si só.",
            ask="Nenhuma ação; repetir o teste se houver dúvida.",
            confirm="—"),
        "en": dict(
            title="Some requests overlapped the reject click",
            found="{n} tracking request(s) happened during the click and are not attributed to before or after the interaction.",
            observed="",
            possible="Not a problem by itself.",
            ask="No action; repeat the test if in doubt.",
            confirm="—")},
}

OWNER_LABELS = {
    "pt-BR": {"marketing": "Marketing", "agency": "Agência", "development": "Desenvolvimento", "privacy": "Privacidade"},
    "en": {"marketing": "Marketing", "agency": "Agency", "development": "Development", "privacy": "Privacy"},
}

STATUS_LABELS = {
    "pt-BR": {"OBSERVED": "Confirmado", "INFERRED": "Suspeita", "NOT_OBSERVED": "Não observado",
              "UNVERIFIABLE": "Não verificado", "NOT_APPLICABLE": "Não aplicável"},
    "en": {"OBSERVED": "Confirmed", "INFERRED": "Suspected", "NOT_OBSERVED": "Not observed",
           "UNVERIFIABLE": "Not verified", "NOT_APPLICABLE": "Not applicable"},
}

STATUS_CONDITION = {
    "pt-BR": {
        "OBSERVED": "Confirmado: há evidência direta coletada neste teste.",
        "INFERRED": "Suspeita: deduzido por regra a partir de evidências; confirme manualmente antes de agir.",
        "NOT_OBSERVED": "Não observado: procuramos com a capacidade disponível e não encontramos nesta janela; isso não prova ausência.",
        "UNVERIFIABLE": "Não verificado: este teste não conseguiu checar este ponto; requer verificação manual ou outra fonte de dados.",
        "NOT_APPLICABLE": "Não aplicável a este site ou cenário.",
    },
    "en": {
        "OBSERVED": "Confirmed: direct evidence was collected in this test.",
        "INFERRED": "Suspected: derived by rule from evidence; confirm manually before acting.",
        "NOT_OBSERVED": "Not observed: we looked with the available capability and found nothing in this window; this is not proof of absence.",
        "UNVERIFIABLE": "Not verified: this test could not check this point; requires manual verification or another data source.",
        "NOT_APPLICABLE": "Not applicable to this site or scenario.",
    },
}

PRIORITY_LABELS = {
    "pt-BR": {"critical": "Crítica", "high": "Alta", "medium": "Média", "low": "Baixa",
              "info": "Informativa", "needs_manual_review": "Revisão manual"},
    "en": {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low",
           "info": "Informational", "needs_manual_review": "Manual review"},
}

PRIORITY_REASON = {
    "pt-BR": {
        "critical": "Envio de dado com forma de dado pessoal ou rastreamento publicitário após recusa: maior potencial de impacto, confirmado por evidência.",
        "high": "Comportamento observado que afeta a confiabilidade dos dados ou a gestão de consentimento.",
        "medium": "Problema observado que pode distorcer relatórios; corrigir no próximo ciclo.",
        "low": "Ajuste recomendado; baixo impacto observado.",
        "info": "Informação de contexto; não exige ação imediata.",
        "needs_manual_review": "Depende de decisão da empresa (base legal, região ou configuração) que o teste não conhece.",
    },
    "en": {
        "critical": "Personal-data-shaped values or advertising tracking after rejection: highest potential impact, confirmed by evidence.",
        "high": "Observed behaviour affecting data reliability or consent management.",
        "medium": "Observed issue that may distort reports; fix in the next cycle.",
        "low": "Recommended adjustment; low observed impact.",
        "info": "Context information; no immediate action required.",
        "needs_manual_review": "Depends on a company decision (legal basis, region or configuration) the test does not know.",
    },
}


class _Safe(dict):
    def __missing__(self, key):
        return "—"


def _fmt(template: str, params: Dict[str, Any]) -> str:
    try:
        return template.format_map(_Safe(params))
    except (IndexError, ValueError, KeyError):
        return template


def normalize_lang(lang: Optional[str]) -> str:
    l = (lang or "pt-BR").strip()
    if l.lower().startswith("pt"):
        return "pt-BR"
    if l.lower().startswith("es"):
        return "es"
    return "en" if l.lower().startswith("en") else "pt-BR"


def render_rule(rule_id: str, lang: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    spec = RULES.get(rule_id)
    if not spec:
        return None
    nl = normalize_lang(lang)
    key = "pt" if nl == "pt-BR" else "en"
    fallback = nl == "es"           # Spanish falls back to English (explicit, flagged)
    tpl = spec[key]
    return {
        "title": _fmt(tpl["title"], params), "found": _fmt(tpl["found"], params),
        "impact_observed": _fmt(tpl["observed"], params), "impact_possible": _fmt(tpl["possible"], params),
        "ask": _fmt(tpl["ask"], params), "confirm": _fmt(tpl["confirm"], params),
        "owner": spec["owner"], "translation_fallback": fallback,
    }
