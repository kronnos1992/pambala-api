# Conformidade com a Lei n.º 22/11 (Protecção de Dados Pessoais) — Pambala

Mapa prático das obrigações da **Lei de Protecção de Dados Pessoais (LPDP)** aplicáveis ao
Pambala (marketplace): registo, compras, comprovativos de pagamento e validação por IA.

Legislação relacionada: Lei 23/11 (comunicações electrónicas / e-commerce), Lei 7/17
(cibersegurança) e Aviso BNA n.º 2/2021 (TIC em instituições financeiras, aplicável se houver
fluxo de pagamentos integrado).

> Aviso: este documento é orientativo, não substitui aconselhamento jurídico.

## Âmbito e risco

- A LPDP aplica-se a qualquer tratamento de dados pessoais realizado em/para Angola (art. 2.º-3.º).
- Contravenções: multas de **USD 75.000–150.000** (art. 51.º); crimes até **18 meses de prisão**
  por omitir autorização da APD (art. 55.º) e **2 anos** por acesso indevido (art. 56.º).
- Dados que o Pambala recolhe: nome, email, telefone, morada/província (envio), credenciais,
  histórico de encomendas, comprovativos de pagamento (imagens com metadados EXIF/GPS) e
  veredictos automáticos sobre esses comprovativos.

## Estado das implementações

| Obrigação LPDP | Estado | Onde |
|---|---|---|
| Consentimento específico para análise IA (art. 7.º/10.º) | ✅ implementado | Checkbox no registo + toggle em "Minha conta" → `User.aiValidationConsent`; agente **não envia** a terceiros sem consentimento (flag `NO_CONSENT_LLM`). |
| Minimização antes de transferência (arts. 7.º/23.º) | ✅ implementado | `receipt_agent/llm.py` remove EXIF/GPS/XMP (Pillow) antes do envio ao LLM; recusa enviar se impossível. |
| Human-in-the-loop em decisão automatizada | ✅ no design | Estados `REVIEW` + confirmação final por admin (nunca é só a IA a aprovar pagamento). |
| Retenção limitada | ⏳ pendente | Definir política (comprovativos 5 anos p/ fiscal; contas até eliminação) e apagar por job. |
| Direitos do titular (acesso/rectificação/eliminação) | 🔶 parcial | Edição de perfil existe; falta "exportar dados" e "apagar conta" que remova dados pessoais. |
| Notificação/autorização prévia à APD | ⏳ pendente | Ação operacional antes de produção. |
| Contrato/DPA com subcontratados + notificação APD (art. 23.º-24.º) | ⏳ pendente | DPA com o provider do LLM (OpenRouter/OpenAI) e host; notificar transferência internacional. |
| Segurança (arts. 30.º-31.º) | 🔶 parcial | E2E encryption da API, passwords hasheadas, HTTPS; faltam logs de acesso, backups e plano de incidentes (Lei 7/17). |

## Plano de acção (pendentes, antes de produção)

1. **Registo do tratamento na APD** — notificar a APD do tratamento "gestão de contas e
   validação de comprovativos"; pedir autorização se qualificar como dados de
   crédito/solvabilidade (art. 16.º).
2. **DPA e notificação de transferência internacional** — contrato escrito com o processador
   do LLM (art. 23.º) e notificação da transferência à APD (art. 24.º).
3. **Política de retenção** — job que apaga comprovativos após X anos e dados de conta após
   pedido de eliminação; documentar prazos.
4. **Direitos do titular** — endpoints/UI de exportar, corrigir e apagar dados pessoais.
5. **Segurança** — logs de acesso, backups, plano de resposta a incidentes (Lei 7/17).

## Decisão automatizada (visão IA)

O comprovativo é avaliado por um modelo de visão externo. Regras atuais que já mitigam risco:

- Envio ao LLM **apenas** com `User.aiValidationConsent = true`;
- O ficheiro enviado é **sanitizado** (sem EXIF/GPS/XMP) — o processador externo só recebe pixels;
- Score e limites (PASS ≥ 80, FAIL ≤ 40, senão REVIEW) com revisão humana/revisão manual;
- Confirmação final é sempre do administrador.