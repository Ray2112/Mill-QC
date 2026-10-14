# Moagem — Controlo de Qualidade (auto-controlo) + Produção · v1.6.0

> **v1.6.0 (13-10-2026) — operadores dos limites editáveis.** No editor de limites (Definições → Limites, PIN) o supervisor escolhe agora **≤ ou <** no máximo e **≥ ou >** no mínimo; a alteração fica registada. Permite, por exemplo, “3,00 % máx.” (3,00 passa) em vez de “< 3,0”.
> - **Especificações internas Carrinho (confidenciais) não estão no código** — este repositório é público. Os limites de especificações internas introduzem-se em cada telemóvel no editor de limites, com PIN; ficam no telemóvel e nas cópias de segurança.

> **v1.5.0 (09-10-2026) — vários produtos na mesma ordem.**
> - Uma ordem pode fazer **vários produtos ao mesmo tempo** (ex.: Fuba 2 + grits cervejeira), sem limite fixo. Cada produto tem a sua **extracção alvo** e os seus **silos de destino**; a soma das extracções não pode passar 100 %. Um silo só pode ser de um produto na ordem; capacidade verificada por produto.
> - **CQ:** cada produto em curso tem os seus controlos horários e por turno, e os seus atrasos. A linha mostra “Produtos em curso (ordem de produção)”.
> - **Retenções:** continuam a ser da linha, mas só fecham quando **cada produto rejeitado** tem uma re-amostra aceite/aviso depois da acção correctiva. Uma amostra boa de outro produto não liberta a linha.
> - Ordens iniciadas na v1.4.0 (um produto) continuam a aparecer e a fechar normalmente.

> **v1.4.0 (09-10-2026) — receita e extracção por ordem; códigos de paragem v2.**
> - **Não há receita fixa.** Em cada ordem o chefe de turno indica a **receita da ordem** (cor(es) e grau(s) de milho, conforme instrução do Chefe Moleiro) e a **extracção alvo (%)**. Ambas obrigatórias; o produto esperado = grão × extracção alvo.
> - Silo de milho sujo com cor ou grau **fora da receita da ordem**: aviso e registo na ordem (“Fora da receita da ordem”), **não bloqueia** e não pede autorização. Outro cereal ou silo sem designação **continua a bloquear**.
> - Definições → Produção já não tem extracção nem receitas por produto (valores antigos ficam guardados, sem uso).
> - Códigos de paragem **v2**: nomes EN corrigidos e nomes PT revistos (pré-AO90). Telemóveis com a lista antiga **nunca editada** passam automaticamente para a v2 ao abrir (registado nas alterações, "app 1.4.0"). Listas já editadas no telemóvel não são alteradas.
> - Excel do turno: novas colunas “Receita da ordem” e “Fora da receita”.
> - **Molhador por linha:** máximo C 2 500 L/h, D 1 500 L/h (Zhax, 09-10-2026), editável em Definições → Produção (PIN). A ordem bloqueia acima do máximo da linha; a humidade por turno usa o máximo actual da linha, também em ordens iniciadas antes da v1.4.0.
> - As descrições das secções abaixo referentes a receitas por produto e autorização de mistura aplicam-se só até à v1.3.0.

**PT** · [EN abaixo](#english)

App offline (PWA) para o auto-controlo de qualidade nas linhas de moagem. Separada da app de Silos (`Mill-App`): repositório, endereço, base de dados (`moagem-cq`) e cache próprios.

Endereço (depois de publicada): https://ray2112.github.io/Mill-QC/

## O que faz
- **Tipo de moagem:** Milho (configurado) · Trigo e Arroz (ainda sem produtos/limites).
- **Turma A/B/C/D** deduzida da data e hora pela rotação de 8 turnos (ancora 14-10-2026 07:00 = C); não se escolhe. Turno **Dia 07–19 / Noite 19–07** automático pela hora.
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
- **Dados mestre — IDs canónicos (v1.3.0, Zhax 09-10-2026):** silos de grão **S01–S21** (app de Silos); silos de milho sujo **B01–B04** (linhas C e D, 130 t); milho temperado **B05–B06** (linha C, 95 t) e **B07–B08** (linha D, 55 t); silos de fuba e grits **B34, B35** (C/D, 60 t), **B40, B44, B45, B46** (C, 188 t), **B43** (D, 188 t), **B47** (C, 145 t). Editáveis em Definições → Produção (PIN, registado); o mesmo ID não pode estar em duas listas.
- **Chefes de turno (v1.3.0):** um por turma (A–D), introduzidos em Definições → Produção (PIN, registado). Ficam só no telemóvel e nas cópias de segurança — não estão no código, que é público. Com a lista preenchida, "Chefe de turno" é escolhido da lista (por defeito o chefe da turma seleccionada) e o registo guarda nome e turma.
- **Separador Grão (v1.3.0):** importar o stock da app de Silos; **transferência** silo(s) de grão → silo de milho sujo (esvazia o 1.º silo, depois o seguinte). Bloqueia: ID fora da lista S01–S21 (renomear na app de Silos), outro cereal, silo sem designação, evento de armazenagem Vermelho, stock insuficiente, silo de milho sujo cheio. Aviso se o silo de moagem ficar com mistura de cores/graus. "Marcar vazio" com nome e PIN (o saldo no registo fica gravado).
- **Ordens a partir dos silos de milho sujo (v1.3.0):** a ordem tira grão de B01–B04 (sequência ou mistura em %) e indica o silo de milho temperado da linha. A receita é verificada contra o conteúdo de cada silo de moagem (cores/graus dos silos de grão que o encheram); fora da receita só com autorização de supervisor. A ordem guarda o conteúdo de cada silo no arranque (rastreabilidade).
- **Silos de produto:** a ordem é bloqueada se o produto esperado não couber nos silos de produto vazios escolhidos; silo já com o mesmo produto = nível desconhecido (aviso).
- **Mistura (v1.2.0):** modo Sequência (silo a silo) ou Mistura (% por silo, soma 100, humidade e impurezas por silo → média ponderada). Silos de outra cor/grau fora da receita só com autorização de supervisor (nome, motivo, PIN), registada na ordem. Outro cereal nunca. Mudar os silos anula a confirmação e a autorização.
- **Humidade do milho por turno (v1.2.0):** em cada ordem em curso, cada turno regista a humidade do milho; a app recalcula o caudal de água para o alvo e avisa se exceder o molhador. Aviso no Início e na ordem enquanto faltar a leitura do turno. Folha própria no Excel do turno.
- **Códigos de paragem FMO (versão 2):** as ocorrências usam os 60 códigos de `Downtime_Codes.xlsx` (08-10-2026), agrupados P/A/O. Com paragem (min > 0) o código é obrigatório. **V2 é a categoria de referência**; a paragem do turno é somada por V2 e por tratamento OEE. Cada registo guarda uma cópia do código como estava (nome EN/PT, V1, V2, Tier 3, OEE). A coluna "Decisão" foi retirada.
- **Editor de códigos (Definições → Códigos de paragem):** nome PT (tradução), V2, Tier 3, tratamento OEE, activo/inactivo e novos códigos, com supervisor, motivo e PIN; cada alteração fica registada. Códigos não se apagam (desactivam-se). **Tratamento OEE vem vazio**; a lista de opções (paragem planeada / perda de disponibilidade / perda de desempenho) é proposta da app, não do ficheiro FMO. P17 e P24 não têm V2 no ficheiro.
- **Identificadores:** registos de produção com UUID (`crypto.randomUUID`) + `deviceId`.
- **Formato preparado para sincronização:** registos de produção com `uid` único (identificador do dispositivo + hora), turma, turno e dia de produção. Cópia de segurança formato 2 (inclui produção); o identificador do dispositivo e o PIN nunca são exportados.

## Novidades na v1.5.0

- **Códigos de paragem** pelo ficheiro `2026-09-30_FMO_Downtime_Codes_v2.xlsx` (folha Folha1): 61 códigos (inclui P25), categoria **Tier 3** e **tratamento OEE** de cada código (Counted as loss / Excluded - Planned / Excluded - External). Colunas V1, V2 e Decisão retiradas. P17 renomeado FUBA BIN FULL (decisão de Zhax). Os nomes PT e a activação já definidos mantêm-se; a migração avisa os códigos que deixam de existir.
- **Unidades em kg**: capacidades de linha (kg/dia), de silos de produto e de silos de milho sujo/temperado (kg); caudal de grão em kg/h. Trabalhos anteriores (feedTph em t/h) continuam válidos e são lidos ×1000. A configuração guardada é convertida uma vez (`unitsVersion`).
- **Turnos**: D = 07:00–19:00, N = 19:00–07:00 (dia de produção = data em que começa o turno). Cada registo guarda o turno, a turma (A–D) e o operador.
- Registos de amostras, alertas e retenções passam a guardar o turno, quando têm hora.

Nota: os registos criados antes de v1.5.0 guardam o código de paragem como estava (OEE "não definido"); não foram reclassificados.

## Novidades na v1.4.0
- **Chaves UUID nos registos de CQ:** amostras, retenções, alertas, alterações de limites e relatórios passam a ter identificador UUID. A migração corre sozinha na primeira abertura e reescreve as ligações (correcções, retenções, alertas). Cópias de formato 3 e anteriores são migradas ao importar.
- **Código curto:** as amostras mostram 8 caracteres do identificador (ex.: `#3f9a1c2e`) em vez de um número. A exportação para Excel usa o mesmo código curto; o identificador completo fica na cópia de segurança.
- **Mestre partilhado de limites:** Definições → Limites partilhados. Exporta um ficheiro com os limites do tipo de moagem e a versão (instante da última alteração). Cada telemóvel importa o ficheiro com o PIN de supervisor. Só uma versão mais nova é aplicada; as alterações ficam registadas. Cada amostra nova guarda a versão dos limites em vigor. **Confidencial:** o ficheiro com os limites não vai para o repositório.
- Correcção: a importação do mestre pode ser repetida com o mesmo ficheiro após um PIN errado.

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
- **Crew A/B/C/D** derived from date and time by the 8-slot rotation (anchor 2026-10-14 07:00 = C); not chosen. **Day 07–19 / Night 19–07** set from the clock.
- **Lines:** Mill C and Mill D (renamable with PIN): running product, start/stop, due and overdue checks.
- **Per-sample decision:** Accept · Warning · Reject (worst parameter wins). Reject → **line ON HOLD**.
- **Hold release:** supervisor PIN + corrective action **and** a later re-sample that is Accept/Warning. A rejected re-sample asks for a new action.
- **Alerts:** on-screen alarm, sound, vibration, notification (app open) and **Send via WhatsApp** with pre-filled text.
- **Daily report 07:00–07:00:** Excel with Summary, Samples, Alerts, Holds, Limits in force, Limit changes. After 07:00 the app shows "Report for … is ready".
- **Corrections:** records are never edited; a correction is a new record with a reason, the original shows as SUPERSEDED.
- **Limits** editable only with PIN, supervisor name and reason; every change is logged.

Products and limits: see the table above (source: FMO Maize Quality Matrix v1.0, SA R.63 values adopted for now). Rules chosen: fat/fibre **below** class minimum = Warning; no warning band for fat/fibre/granulation until set; any physical defect = Reject. Frequencies: hourly — moisture, fat, physical, grits granulation; per shift (= one lot, app definition) — fibre and meal granulation; other tests record-only.

> **v1.6.0 (13-10-2026) — editable limit operators.** In the limits editor (PIN) the supervisor now chooses ≤ or < for the maximum and ≥ or > for the minimum; changes are logged. Confidential internal Carrinho specifications are not in the code (public repository): they are entered per phone in the limits editor and stay on the phone and in backups.

> **v1.5.0 (09-10-2026) — several products per job.** A job can make several products at once (e.g. Fuba 2 + brewing grits), no fixed limit; each product has its own target extraction and destination bins, extractions may not exceed 100 % in total, a bin belongs to one product, capacity is checked per product. QC tracks hourly/shift checks and overdue status for each running product. Holds stay per line but close only when every rejected product has a passing re-sample after corrective action; a good sample of another product does not release the line. v1.4.0 single-product jobs still display and close normally.

> **v1.4.0 (09-10-2026) — per-job recipe and target extraction; downtime codes v2.** No fixed recipe: at each job the shift leader enters the job recipe (maize colour(s) and grade(s), as instructed by the Chief Miller) and target extraction (%), both required. Dirty-bin content outside the job recipe is recorded as a warning on the job and does not block or need authorisation; other cereal or an undesignated silo still blocks. Production settings no longer hold extraction or recipes per product. Downtime codes v2 (corrected EN names, revised pre-AO90 PT names); phones whose old list was never edited upgrade automatically on opening (logged), edited lists are left unchanged. Shift Excel gains "Job recipe" and "Off recipe" columns. Dampener limit per line: C 2,500 L/h, D 1,500 L/h (editable with PIN); jobs block above the line limit and shift moisture readings use the current line limit, including jobs started before v1.4.0. Earlier notes about per-product recipes and blend authorisation apply up to v1.3.0 only.

**Production (new in v1.1.0, ▶ Production tab):** jobs with product, line, grain kg, grain silos in discharge order, destination bins, initial moisture, impurities, target tempered-grain moisture and grain feed rate (blank = capacity ÷ 24 h). Calculates water on dirty grain (total L and L/h), duration, and expected product from target extraction (only when set). A job is **blocked** when the product recipe (allowed maize colours/grades) is not set or a silo does not match, grain is short (select more silos), a grain silo has an open Red/Emergency storage event, a bin holds another product or is not fed by the line, the water rate exceeds the 2,500 L/h dampener, the line already has a running job, or no silo stock is imported. Grain stock comes from the Silos app backup; later jobs deduct grain. Starting a job sets the QC line running with that product, QC alerts/holds show on the job, closing it stops the QC line. Shift log: issues (downtime, action, open/closed) and activities (housekeeping by floor, reprocessing kg, cleaning, maintenance); entries are voided with a reason, never edited; Excel per shift and WhatsApp summary. Production settings (PIN, logged): line capacity, dampener max, target extraction and recipe per product (**blank by default**), bin list, floors. Canonical IDs (v1.3.0): grain silos S01–S21; dirty maize bins B01–B04 (C and D, 130 t); tempered B05–B06 (C, 95 t), B07–B08 (D, 55 t); fuba/grits bins B34, B35 (C/D, 60 t), B40, B44, B45, B46 (C, 188 t), B43 (D, 188 t), B47 (C, 145 t). Shift leaders per crew (A–D) are entered on the phone in Settings → Production (PIN, logged) and kept out of the public code; once set, "Shift leader" is a pick-list defaulting to the selected crew's leader. Grain tab: transfers from grain silos into dirty bins (refused for IDs outside S01–S21, other cereal, Red storage event, short stock, full bin). Jobs draw from dirty bins and name the line's tempered bin; recipe checked against bin contents; product-bin capacity checked against expected product. Blend mode (% per silo, weighted moisture/impurities); off-recipe colour/grade only with supervisor authorisation. Each shift records maize moisture on running jobs and the water rate is recalculated. Issues use the 60 FMO downtime codes (v2) from Downtime_Codes.xlsx, required when there is downtime; V2 is the reference category and downtime is summed by V2 and OEE treatment. Codes are editable with supervisor, reason and PIN (PT name, V2, Tier 3, OEE treatment, active, new codes); every change is logged. OEE treatment starts blank and its option list is the app's proposal, not from the FMO file. 'Decisão' removed. Records carry a unique `uid` for future sync; backup format 2.

Limitations: data on the phone only (export backups); no SMS, notifications only while open; report generated on opening after 07:00; PIN is a deterrent and cannot be recovered; not yet tested on iPhone/Safari; grain-silo hold status is only partly read from the Silos backup (open events), so the shift leader must confirm; bin capacity not checked; knowledge bank and lab-result recommendations come in version 2.

## New in v1.5.0

- **Downtime codes** from `2026-09-30_FMO_Downtime_Codes_v2.xlsx` (sheet Folha1): 61 codes (includes P25), **Tier 3** category and **OEE treatment** per code (Counted as loss / Excluded - Planned / Excluded - External). V1, V2 and Decision columns removed. P17 renamed FUBA BIN FULL (decision by Zhax). Existing PT names and active flags are kept; the migration reports codes that no longer exist.
- **Quantities in kg**: line capacities (kg/day), product silos and dirty/tempered bins (kg); grain feed rate in kg/h. Older jobs (feedTph in t/h) remain valid and are read ×1000. Stored configuration is converted once (`unitsVersion`).
- **Shifts**: D = 07:00–19:00, N = 19:00–07:00 (production day = the date the shift starts). Each record stores shift, crew (A–D) and operator.
- Samples, alerts and holds store the shift when they have a time.

Note: records created before v1.5.0 keep the downtime code as it was (OEE "not set"); they were not reclassified.

## New in v1.4.0
- **UUID keys on QC records:** samples, holds, alerts, limit changes and reports now have UUID identifiers. The migration runs on first open and rewrites the links (corrections, holds, alerts). Backups of format 3 and older are migrated on import.
- **Short code:** samples show 8 characters of the identifier (e.g. `#3f9a1c2e`) instead of a number. The Excel export uses the same short code; the full identifier stays in the backup.
- **Shared limits master:** Settings → Shared limits. Exports one file with the limits of the mill type and its version (the instant of the last change). Each phone imports it with the supervisor PIN. Only a newer version is applied; changes are logged. Each new sample stores the limits version in force. **Confidential:** the limits file must not go into the repository.
- Fix: the master can be re-imported with the same file after a wrong PIN.

