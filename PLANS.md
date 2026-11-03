# Planos, cotas e visibilidade — DataTrust Audit

Fonte única: [`datatrust/plans.py`](datatrust/plans.py) (padrões, versão 1) + versões publicadas pelo admin em
`plan_config_versions` ([`datatrust/plan_config.py`](datatrust/plan_config.py)). O frontend só exibe o que
`/api/plans` e `/api/me` retornam. Valores monetários em **centavos**, moeda **BRL**, ciclo **mensal**.

## Oferta de lançamento (proposta do proprietário, 28/10/2026)

| Item | Free | Pro | Premium | Administrador |
|---|---|---|---|---|
| Mensalidade (`price_cents`) | 0 | 9700 (R$ 97) | 24700 (R$ 247) | uso interno (papel, não plano) |
| Visibilidade do plano | 30% | 70% | 100% | 100% |
| Análises por mês | 3 | 30 | 150 | sem limite comercial |
| Domínios distintos por período | 1 | 5 | 30 | sem limite comercial |
| Limite diário | 1 por dia | — | — | — |
| Usuários da conta | 1 | 1 | até 3 quando o recurso estiver operacional (`seats_operational=false`) | conta proprietária |
| Varredura de várias páginas | não | até 5 páginas | até 10 páginas | até 10 páginas |
| Histórico visível | 5 | 100 | 1000 | 1000 |
| Conta verificada para analisar | sim | sim | sim | sim |

Os preços são proposta de lançamento, editáveis no admin (`PUT /api/admin/plans` publica uma **nova versão**;
assinaturas existentes guardam `price_cents`/`plan_config_version` e não são re-precificadas). Limites de
segurança (concorrência, tempo máximo, até 10 páginas) continuam ativos inclusive para o admin.

**Pagamento desativado** (`billing.enabled = false`): escolher um plano não concede recursos pagos. O admin
mostra o que falta para ativar (`GET /api/admin/billing`).

## Definição de análise
Uma **análise** é uma execução nova para uma URL e um perfil de teste. Reabrir relatório, trocar idioma,
alternar visão, recolher seções ou exportar novamente **não** consome. Repetir a varredura consome.

## Períodos e cotas
- Free (e assinaturas sem período de cobrança): **mês civil** em `America/Sao_Paulo`; renovação visível em `/api/me`.
- Planos pagos com período de assinatura (`current_period_start/end`): esse período.
- Reserva **atômica** antes da execução (mês, dia e domínios), confirmação quando o resultado é útil
  (`completed`, ou `partial` com navegador real), liberação em falha/tempo esgotado/parcial só estático.
  Retry com o mesmo `audit_id` é idempotente.
- Excluir histórico ou um domínio **não** devolve análises nem domínios.
- Domínio = host sem `www.` (subdomínios distintos contam como domínios distintos nesta versão).
- Visitantes sem conta não executam análises (`401 AUTH_REQUIRED`). Free não exige cartão.

## Visibilidade 30% / 70% / 100% (servidor)
[`datatrust/visibility.py`](datatrust/visibility.py). A coleta é a mesma para todos os planos; a apresentação decide
quantos **detalhes** cada plano lê. Para cada lista protegida (achados, tags, eventos, candidatos em código, cookies,
storage, links de política, domínios de rede, padrões de PII), ordenada de forma estável por prioridade e ID:

released = min(N, max(1, floor(N × p))) para N > 0; 0 para N = 0.

Exemplo: 10 achados → Free 3, Pro 7, Premium 10. Zero achados → nada é fabricado. Com 1 registro a amostra mínima
libera 1 (o percentual real difere do nominal; isso é informado). Evidências: só as citadas pelos registros
liberados (+ navegação do escopo). Os registros retidos **não saem do servidor** (nem em IDs de páginas). Contagens
agregadas, escopo, estado da execução, limitações e notas continuam visíveis. Reabrir/exportar segue o plano atual;
os conjuntos são aninhados (Free ⊂ Pro ⊂ Premium) e os IDs não mudam.

"Visibilidade do plano" ≠ "Cobertura da auditoria" ≠ "Condição da mensuração". 100% significa todos os detalhes
desta auditoria, não certeza sobre configurações internas do site.

## Contexto de teste do administrador
`POST /api/admin/test-context` com `plan` = `admin` | `free` | `pro` | `premium`, `quota_state` = `available` |
`exhausted`, `subscription_state` = `active` | `expired` | `payment_failed`. Guardado no servidor (não há cabeçalho
de simulação). No contexto de teste o admin é medido **exatamente** como o plano escolhido, com saldo de teste
separado (`credit_ledger.is_test = 1`) e reiniciável (`/reset-balance`). Assinatura vencida ou falha de pagamento
fazem o plano efetivo cair para Free. Nada altera clientes, assinaturas, saldos reais ou cobrança. Cada troca é
registrada em `admin_audit_log` (ator, horário, escopo). `plan = admin` volta ao administrador.

## Recursos ainda não implementados (não vendidos)
Exportação XLSX/PDF, importação de contêiner GTM, comparação, integrações, assentos de equipe e pagamento.
