# Moagem — Controlo de Qualidade (auto-controlo) + Produção · v1.2.0

**PT** · [EN abaixo](#english)

App offline (PWA) para o auto-controlo de qualidade nas linhas de moagem. Separada da app de Silos (`Mill-App`): repositório, endereço, base de dados (`moagem-cq`) e cache próprios.

Endereço (depois de publicada): https://ray2112.github.io/Mill-QC/

## O que faz
- **Tipo de moagem:** Milho (configurado) · Trigo e Arroz (ainda sem produtos/limites).
- **Turma A/B/C/D** escolhida no topo; turno **Dia 07–19 / Noite 19–07** automático pela hora.
- **Linhas:** Moinho C e Moinho D (nomes editáveis com PIN). Para cada linha: produto em produção, arrancar/parar, controlos previstos e em atraso.
- **Decisão automática por amostra:** Aceite · Aviso · Rejeitado (o pior parâmetro manda). Rejeitado → **linha RETIDA**.
- **Retenção:** fecha só com PIN de supervisor + acção correctiva **e** uma re-amostra posterior Aceite/Aviso. Re-amostra rejeitada volta a pedir acção.
- **Alertas:** alarme no ecrã, som, vibração, notificação (com a app aberta) e botão **Enviar por WhatsApp** com o texto preenchido.
- **Relatório diário 07:00–07:00:** Excel com folhas Resumo, Amostras, Alertas, Retenções, Limites em vigor, Alterações de limites. A partir das 07:00, ao abrir a app aparece "Relatório do dia … pronto".
- **Correcções:** os registos nunca são editados; a correcção é um novo registo com motivo e o original fica "SUBSTITUÍDA".
- **Limites editáveis** só com PIN, supervisor e motivo; cada alteração fica registada (valor anterior/novo).

## Produção (novo em v1.1.0) — separador ▶ Produção
- **Ordens de produção:** produto, linha, grão a moer (kg), silos de grão por ordem de descarga, silos de produto de destino, humidade inicial, impurezas, humidade alvo do grão temperado, caudal de grão (vazio = capacidade ÷ 24 h).
- **Cálculos:** água = grão sujo × (alvo − inicial) ÷ (100 − alvo), total (L) e caudal (L/h); duração; produto esperado = grão × extracção alvo (só se definida).
- **A ordem é bloqueada se:** a receita do produto (cores e graus de milho permitidos) não está definida ou o silo não cumpre; o grão disponível não chega (seleccione mais silos — esvazia o 1.º, depois o seguinte); um silo de grão tem evento de armazenagem Vermelho/Emergência aberto; um silo de produto já contém outro produto ou não é alimentado pela linha; a água necessária excede o molhador (2 500 L/h); a linha já tem ordem em curso; falta o stock de silos.
- **Stock de grão:** importado da cópia de segurança da app de Silos (`Mill-App`). Ordens criadas depois da exportação descontam o grão (ordens fechadas pela quantidade real). O chefe de turno confirma que nenhum silo está retido na app de Silos.
- **Integração com o CQ:** iniciar uma ordem põe a linha em produção no CQ com esse produto; os alertas e retenções do CQ aparecem na ordem. Fechar a ordem pára a linha no CQ.
- **Silos de produto:** estado (vazio / produto) a partir das ordens; "Marcar vazio" com nome; "Definir conteúdo" (estado inicial) com PIN.
- **Diário de turno:** ocorrências (categoria, linha, equipamento, paragem em min, acção; abertas até serem fechadas com resolução) e actividades (limpeza e arrumação por piso, reprocessamento em kg, limpeza de equipamento, manutenção, outra). Nada é editado: anula-se com motivo. Excel por turno (Ordens, Ocorrências, Actividades, Alertas, Silos de produto) e resumo por WhatsApp.
- **Definições → Produção (PIN, supervisor, motivo, registado):** capacidade das linhas (C 500 t/dia, D 300 t/dia), molhador máx. 2 500 L/h, extracção alvo e receita por produto (**vazias por defeito**), lista de silos de produto, pisos.
- **Silos de produto em uso (v1.2.0):** 34 C/D 60 t · 35 C/D 60 t · 40 C 188 t · 43 D 188 t · 44 C 188 t · 45 C 188 t · 46 C 188 t · 47 C 188 t (lista e capacidades: Zhax; linhas: ecrã "Flour Silos"). A ordem é bloqueada se o produto esperado não couber nos silos de produto vazios escolhidos; silo já com o mesmo produto = nível desconhecido (aviso).
- **Mistura (v1.2.0):** modo Sequência (silo a silo) ou Mistura (% por silo, soma 100, humidade e impurezas por silo → média ponderada). Silos de outra cor/grau fora da receita só com autorização de supervisor (nome, motivo, PIN), registada na ordem. Outro cereal nunca. Mudar os silos anula a confirmação e a autorização.
- **Humidade do milho por turno (v1.2.0):** em cada ordem em curso, cada turno regista a humidade do milho; a app recalcula o caudal de água para o alvo e avisa se exceder o molhador. Aviso no Início e na ordem enquanto faltar a leitura do turno. Folha própria no Excel do turno.
- **Códigos de paragem FMO:** as ocorrências usam os 60 códigos de `Downtime_Codes.xlsx` (08-10-2026), agrupados P/A/O. Com paragem (min > 0) o código é obrigatório; cada registo guarda código, nome, V1, V2, Tier 3 e Decisão como no ficheiro. O diário mostra a paragem por Tier 3. O ficheiro não tem coluna "Tratamento OEE": não foi inventada.
- **Identificadores:** registos de produção com UUID (`crypto.randomUUID`) + `deviceId`.
- **Formato preparado para sincronização:** registos de produção com `uid` único (identificador do dispositivo + hora), turma, turno e dia de produção. Cópia de segurança formato 2 (inclui produção); o identificador do dispositivo e o PIN nunca são exportados.

## Produtos e limites iniciais
Fonte: *Maize Product Quality Matrix — FMO / Carrinho v1.0 (06-10-2026)*, valores **SA R.63 (2016)** adoptados provisoriamente. 13,5 % de humidade é alvo **FMO proposto**; 13 % para ração é referência de indústria de rações.

| Produto | Classe SA | Gordura % | Fibra % | Granulometria | Humidade % |
|---|---|---|---|---|---|
| Super Fuba | Super Maize Meal | < 2,0 | ≤ 0,8 | ≥ 90 % passa 1,40 mm; < 90 % passa 0,30 mm | ≤ 13,5 OK · > 13,5–14,0 aviso · > 14,0 rejeita |
| Fuba 1 | Special Maize Meal | 2,0 – < 3,0 | ≤ 1,2 | ≥ 90 % passa 1,40 mm | idem |
| Fuba 2 | Sifted Maize Meal | 3,0 – < 4,0 | ≤ 1,2 | ≥ 90 % passa 1,40 mm | idem |
| Integral | No.1 Straight-Run | ≥ 3,7 | 1,8 – 2,5 | ≥ 90 % passa 2,36 mm | idem |
| Ração Animal | Hominy Chop | só registo | só registo | — | ≤ 13,0 (acima rejeita) |
| Grits Cervejeira | Brewing Grits | ≤ 1,5 | ≤ 0,8 | ≥ 90 % passa 4,0 mm; ≤ 5 % passa 0,50 mm | idem humano |
| Grits Snack | Snack Grits | ≤ 1,5 | ≤ 0,8 | ≥ 90 % passa 2,0 mm; ≤ 5 % passa 0,850 mm | idem humano |
| Arroz de Milho | Maize Rice | ≤ 1,5 | ≤ 0,8 | ≥ 90 % passa 4,0 mm; ≤ 5 % passa 1,18 mm | idem humano |

**Regras escolhidas:** gordura/fibra **abaixo** do mínimo da classe = Aviso (não retém). Sem banda de aviso para gordura, fibra e granulometria até o supervisor a definir. Qualquer defeito físico (odor, cor, bolor, insectos, matéria estranha) = Rejeitado.

**Frequências:** horária — humidade, gordura, físico, e granulometria dos grits. Por turno (= 1 lote, definição da app) — fibra e granulometria das fubas. Proteína, cinzas, amido, brancura, pintas, aflatoxinas, fumonisinas — quando aplicável, só registo (a matriz não define limites). Tolerância antes de "em atraso": 10 min (definição da app, editável).

## Limitações
- Dados só no telemóvel — exportar cópia de segurança regularmente.
- Sem servidor: não envia SMS; as notificações só funcionam com a app aberta. O relatório das 07:00 é gerado ao abrir a app.
- O PIN é um dissuasor, não segurança forte, e não pode ser recuperado.
- Não testado ainda em iPhone/Safari.
- Produção: o estado de retenção dos silos de grão só é lido parcialmente da cópia da app de Silos (eventos abertos); a confirmação do chefe de turno é obrigatória. Capacidade dos silos de produto não é verificada (não definida). Base de conhecimento e recomendações a partir dos resultados do laboratório: versão 2.

## Técnico
JS simples, sem compilação. `js/logic.js` regras puras (testes: `node tests/logic.test.js`, `node tests/prod.test.js`; chaves de texto: `node tests/keys.check.js`). `js/db.js` IndexedDB. `js/i18n.js` PT/EN. `sw.js` cache `moagem-cq-v…` (mudar em cada versão). SheetJS CE 0.18.5 (Apache-2.0) em `vendor/`.

---

<a id="english"></a>
## English

Offline PWA for in-process quality control (auto-control) on the mill lines. Separate from the Silos app (`Mill-App`): its own repo, address, database (`moagem-cq`) and cache.

- **Mill type:** Maize (configured) · Wheat and Rice (no products/limits yet).
- **Crew A/B/C/D** selected at the top; **Day 07–19 / Night 19–07** set from the clock.
- **Lines:** Mill C and Mill D (renamable with PIN): running product, start/stop, due and overdue checks.
- **Per-sample decision:** Accept · Warning · Reject (worst parameter wins). Reject → **line ON HOLD**.
- **Hold release:** supervisor PIN + corrective action **and** a later re-sample that is Accept/Warning. A rejected re-sample asks for a new action.
- **Alerts:** on-screen alarm, sound, vibration, notification (app open) and **Send via WhatsApp** with pre-filled text.
- **Daily report 07:00–07:00:** Excel with Summary, Samples, Alerts, Holds, Limits in force, Limit changes. After 07:00 the app shows "Report for … is ready".
- **Corrections:** records are never edited; a correction is a new record with a reason, the original shows as SUPERSEDED.
- **Limits** editable only with PIN, supervisor name and reason; every change is logged.

Products and limits: see the table above (source: FMO Maize Quality Matrix v1.0, SA R.63 values adopted for now). Rules chosen: fat/fibre **below** class minimum = Warning; no warning band for fat/fibre/granulation until set; any physical defect = Reject. Frequencies: hourly — moisture, fat, physical, grits granulation; per shift (= one lot, app definition) — fibre and meal granulation; other tests record-only.

**Production (new in v1.1.0, ▶ Production tab):** jobs with product, line, grain kg, grain silos in discharge order, destination bins, initial moisture, impurities, target tempered-grain moisture and grain feed rate (blank = capacity ÷ 24 h). Calculates water on dirty grain (total L and L/h), duration, and expected product from target extraction (only when set). A job is **blocked** when the product recipe (allowed maize colours/grades) is not set or a silo does not match, grain is short (select more silos), a grain silo has an open Red/Emergency storage event, a bin holds another product or is not fed by the line, the water rate exceeds the 2,500 L/h dampener, the line already has a running job, or no silo stock is imported. Grain stock comes from the Silos app backup; later jobs deduct grain. Starting a job sets the QC line running with that product, QC alerts/holds show on the job, closing it stops the QC line. Shift log: issues (downtime, action, open/closed) and activities (housekeeping by floor, reprocessing kg, cleaning, maintenance); entries are voided with a reason, never edited; Excel per shift and WhatsApp summary. Production settings (PIN, logged): line capacity, dampener max, target extraction and recipe per product (**blank by default**), bin list, floors. Bins in use (v1.2.0): 34, 35 (C/D, 60 t), 40, 44–47 (C, 188 t), 43 (D, 188 t); capacity is checked against expected product. Blend mode (% per silo, weighted moisture/impurities); off-recipe colour/grade only with supervisor authorisation. Each shift records maize moisture on running jobs and the water rate is recalculated. Issues use the 60 FMO downtime codes from Downtime_Codes.xlsx (required when there is downtime); downtime is summed by Tier 3. The file has no OEE-treatment column, so none is invented. Records carry a unique `uid` for future sync; backup format 2.

Limitations: data on the phone only (export backups); no SMS, notifications only while open; report generated on opening after 07:00; PIN is a deterrent and cannot be recovered; not yet tested on iPhone/Safari; grain-silo hold status is only partly read from the Silos backup (open events), so the shift leader must confirm; bin capacity not checked; knowledge bank and lab-result recommendations come in version 2.
