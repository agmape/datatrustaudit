interface FetchResult {
  html: string;
  success: boolean;
  method: string;
  error?: string;
}

export class WebsiteFetchService {
  private static instance: WebsiteFetchService;
  
  static getInstance(): WebsiteFetchService {
    if (!WebsiteFetchService.instance) {
      WebsiteFetchService.instance = new WebsiteFetchService();
    }
    return WebsiteFetchService.instance;
  }

  async fetchWebsiteContent(url: string): Promise<FetchResult> {
    console.log(`🌐 Tentando conectar com: ${url}`);
    
    // Estratégia 1: AllOrigins
    try {
      const result = await this.fetchWithAllOrigins(url);
      if (result.success) {
        console.log(`✅ Sucesso com AllOrigins: ${url}`);
        return result;
      }
    } catch (error) {
      console.log(`❌ AllOrigins falhou:`, error);
    }

    // Estratégia 2: CORS Anywhere
    try {
      const result = await this.fetchWithCorsAnywhere(url);
      if (result.success) {
        console.log(`✅ Sucesso com CORS Anywhere: ${url}`);
        return result;
      }
    } catch (error) {
      console.log(`❌ CORS Anywhere falhou:`, error);
    }

    // Estratégia 3: ThingProxy
    try {
      const result = await this.fetchWithThingProxy(url);
      if (result.success) {
        console.log(`✅ Sucesso com ThingProxy: ${url}`);
        return result;
      }
    } catch (error) {
      console.log(`❌ ThingProxy falhou:`, error);
    }

    // Se todas falharam, retornar erro
    console.log(`❌ Todas as estratégias de fetch falharam para: ${url}`);
    return {
      html: '',
      success: false,
      method: 'none',
      error: 'Todas as estratégias de fetch falharam'
    };
  }

  private async fetchWithAllOrigins(url: string): Promise<FetchResult> {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000) // 10 segundo timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('Conteúdo vazio retornado');
      }

      return {
        html: data.contents,
        success: true,
        method: 'allorigins'
      };
    } catch (error) {
      throw new Error(`AllOrigins falhou: ${error}`);
    }
  }

  private async fetchWithCorsAnywhere(url: string): Promise<FetchResult> {
    try {
      const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (compatible; LGPD-Audit-Tool/1.0)'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      if (!html || html.length < 100) {
        throw new Error('Conteúdo HTML muito pequeno ou vazio');
      }

      return {
        html,
        success: true,
        method: 'cors-anywhere'
      };
    } catch (error) {
      throw new Error(`CORS Anywhere falhou: ${error}`);
    }
  }

  private async fetchWithThingProxy(url: string): Promise<FetchResult> {
    try {
      const proxyUrl = `https://thingproxy.freeboard.io/fetch/${url}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      if (!html || html.length < 100) {
        throw new Error('Conteúdo HTML muito pequeno ou vazio');
      }

      return {
        html,
        success: true,
        method: 'thingproxy'
      };
    } catch (error) {
      throw new Error(`ThingProxy falhou: ${error}`);
    }
  }
}
