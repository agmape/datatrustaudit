# 📚 Descobertas e Lições Aprendidas - GTM Audit

Este arquivo documenta bugs encontrados, soluções aplicadas e instruções importantes descobertas durante o desenvolvimento.

---

## 🐛 Bug: Deep Scan - "Invalid URL" Error (2026-02-05)

### Problema
O Deep Scan (Navegação Completa do Site) falhava com o erro:
```
TypeError: Failed to construct 'URL': Invalid URL
```

### Causa Raiz
O serviço `siteNavigationService.ts` usava `new URL(baseUrl)` para extrair o hostname, mas quando o usuário digitava URLs sem protocolo (ex: `uol.com.br`), o construtor `URL` falhava porque precisa de protocolo para ser válido.

### Solução Aplicada
1. **Função `normalizeUrl()`** adicionada ao serviço:
   ```typescript
   private normalizeUrl(url: string): string {
     if (!url) return '';
     let normalizedUrl = url.trim();
     normalizedUrl = normalizedUrl.replace(/\/+$/, '');
     if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
       normalizedUrl = `https://${normalizedUrl}`;
     }
     return normalizedUrl;
   }
   ```

2. **Try-catch em `discoverSitePages()`** com fallback manual:
   ```typescript
   let domain = '';
   try {
     domain = new URL(baseUrl).hostname;
   } catch (error) {
     domain = baseUrl.replace(/^https?:\/\//, '').split('/')[0];
   }
   ```

### Arquivos Modificados
- `static/src/services/siteNavigationService.ts`

### Lição Aprendida
> **Sempre validar e normalizar inputs de URL do usuário** antes de usar `new URL()`. Usuários frequentemente omitem `https://` ao digitar URLs.

---

## 📋 Padrões e Boas Práticas

### PowerShell vs Bash
- No Windows/PowerShell, usar `;` ao invés de `&&` para encadear comandos
- Exemplo: `cd static; npm run build` (correto no PowerShell)

### Frontend Build
- Após modificar arquivos TypeScript no frontend, **sempre executar `npm run build`** para gerar novo bundle
- O arquivo de build fica em `static/dist/`
- O servidor Python serve arquivos estáticos do diretório `static/dist`

---

## 🔧 Comandos Úteis

```powershell
# Reconstruir frontend
cd static; npm run build

# Iniciar servidor
python run.py

# Desenvolvimento com hot-reload
cd static; npm run dev
```

---

## ✨ Melhoria: Análise Expandida de Tags (2026-02-05)

### O que foi adicionado

**17 novos padrões de detecção (total 31 tags):**
- Pinterest Tag, Twitter/X Pixel, Snapchat Pixel
- Segment, Amplitude, Mixpanel, Heap Analytics
- HubSpot, Salesforce Pardot
- Adobe Analytics
- Taboola, Outbrain, Criteo
- Quora Pixel, Reddit Pixel
- Usercentrics (CMP), Quantcast Choice (CMP)

**Detecção de Consent Mode v2:**
- Detecta configuração `gtag('consent', 'default', {...})`
- Valida sinais v2: `ad_user_data`, `ad_personalization`
- Alerta se não está com default 'denied'
- Penaliza score se Consent Mode não configurado

### Arquivos Modificados
- `main.py` - TAG_PATTERNS expandido, função `detect_consent_mode_v2()` adicionada

### Resultado
- UOL.com.br: antes ~8 tags → agora **21 tags** detectadas

---

*Última atualização: 2026-02-05*
