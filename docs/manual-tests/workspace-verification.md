# Verifieringsrapport för hushållets nya arbetsytor

Denna rapport är ett historiskt observationsunderlag för de uttryckligen
angivna provversionerna. Resultat, bilder och äldre modellbeteenden gäller
dessa versioner. Rapporten godkänner inte den senare fria egenskapsmodellen,
ändrade formulär eller borttagna typfält och mållösa samband. Aktuella
körbara scenarier finns i områdesmanualerna. Mänskliga observationer som
anges som ej utförda behåller den statusen; inga nya utfall har observerats
vid denna dokumentationsändring.

Redan bekräftade mänskliga observationer kan återanvändas för oförändrad
omfattning när provversion, miljö, kontokategori, utrustning, ansvarig och
observerat utfall passar. En äldre provversion kräver inte ensam ett omprov.
Ändrade egenskapskontroller följer de befintliga människoprovens ansvar;
rapporten inför ingen ny mänsklig restlista eller nytt godkännande.

Rapporten hjälper testare och granskare att följa de 25 kravområdena och
de åtta fullständiga arbetskedjorna som beskrivs nedan.
Den länkar faktisk kod, offentliga provgränser och befintliga manuella fall.
Områdesfallen anger körbara steg och förväntade resultat.

**Status för angivna provversioner: slutkontroller och slutgranskningar
GODKÄNDA.**
Den rena produktionskällans visuella jämförelse och mätning redovisas nedan.
Fysiska hjälpmedels-, telefon- och förstoringstester är **INTE UTFÖRDA**.

Slutliga Standards- och Spec-granskningar gäller
[`942267232b0644444a6904e1478871ea38b84342`](https://github.com/viscalyx/skyttel/tree/942267232b0644444a6904e1478871ea38b84342)
mot startpunkten
[`4fc7f88079d8e3dc4ef9f97171da1e1bcb1ec123`](https://github.com/viscalyx/skyttel/tree/4fc7f88079d8e3dc4ef9f97171da1e1bcb1ec123).
Båda axlarna har noll kvarstående åtgärdbara fynd inom det granskade
underlaget. Alla verifierade rättelser ingår i den hela körningen nedan.
Granskningen innebär inte att varje rad, test eller bildpixel bedöms separat.

## Provdata, miljö och metod

- Bygge och hela automatiska kontrollkörningen gäller den rena versionen
[`aa8af52e25005f5700c9841eb17dcd3bd6c36d6c`](https://github.com/viscalyx/skyttel/tree/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c).
  A/C/D-bilder, mätning och containerkontroll gäller den rena versionen
[`07f31e9cd1c957999cf223d55463d119a00a1fe3`](https://github.com/viscalyx/skyttel/tree/07f31e9cd1c957999cf223d55463d119a00a1fe3).
  Båda har samma produktionskatalog `src`:
  `43ddca812c97e9c650aa3b2227cedbe24f1cd758`.
  Skillnaden är en strikt förväntan i ett enhetsprov som kräver rätt
  samtalskontext i avbrytningen. Resultaten behåller sina faktiska
  provversioner. Rapportens publicering ändrar endast dokumentation.
- Filernas existens och de 33 primärhänvisningarnas exakta titlar
  kontrolleras mot testupptäckt och områdesmanualer på rapportens angivna
  version. Titlarna ändras inte för att passa ett resultat.
-
  [Provinstallationen](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts)
  ger riktig
  SQLite och offentlig HTTP i en isolerad databas. Syntetisk extern
  inloggning går genom riktiga återanrop och beständiga sessioner.
  Alex och Robin har de roller och hushåll som respektive områdesfall anger.
  Export, återimport och radering använder administratörsåtkomst.
- Modell-, mikrofon- och medieleverantörer ersätts endast vid sina externa
  gränser. Hållna och tappade HTTP-svar kontrollerar verklig lagring och
  återhämtning. Inga komponenttillstånd eller direkta databasändringar
  används som ersättning för arbetsflödenas observerbara utfall.
- Automatiken använder Linux, Playwright 1.63.0 och dess Chromium
  153.0.8010.12, Node 24.21.0, npm 12.0.2 och två integrationsarbetare.
  Prov med Chromium är inte fysiska Chrome-prov.
- Hela `CI=1 npm run check` är **GODKÄND**: typkontroll, lint,
  dokumentation och stavning, 140 grindprov, produktionsbygge,
  140 testfiler med 1 582 enhets- och webbläsarprov samt 719
  integrationstestfall i 106 filer. Inga testfall är underkända eller
  överhoppade. Integrationskörningen använder två arbetare och tar
  15,1 minuter.
  Resultaten gäller de lokala kommandona på angivna versioner.
-
  [GitHub-körningen](https://github.com/viscalyx/skyttel/actions/runs/37468444481)
  är **GODKÄND** på `aa8af52`: 1 582 enhets- och webbläsarprov,
  719 integrationstestfall på 16,5 minuter, 90,26 procent grentäckning
  och alla nio containersteg. Övriga obligatoriska grindar är godkända.
  Det är en separat faktisk körning från de lokala resultaten nedan.
  Publiceringen ändrar endast dokumentation och ordlistan; dess nya
  GitHub-körning redovisas separat.
- Global täckning är 93,61 procent för satser, **90,21 procent för
  grenar**, 93,13 procent för funktioner och 95,50 procent för rader.
  Kraven är oförändrade: 90 procent för grenar och 85 procent för de
  övriga måtten.
- Alla nio `npm run test:container`-steg är **GODKÄNDA** på den
  rena versionen `07f31e9cd1c957999cf223d55463d119a00a1fe3`.
  Kontrollen bygger riktiga images och prövar isolerade volymer,
  åtkomst, sparande, omstart, radering och återimport.
- Använd [testguiden](../development/testing.md) för körning och rapporter.
  Följ områdesfallens användare, förberedelser och återställning;
  [utvecklingsguiden](../development/devcontainer.md) ger provinstallationen.
  Använd syntetiska personuppgifter och separata provdatabaser.

## De 25 beslutade kravområdena

Varje primärfall är en ingång till underlaget, inte en ensam bevisning av
hela området. Kolumnen med omfattning anger även kompletterande fall.
Exakta engelska testtitlar behålls för att kunna återfinna körningarna.
Varje rads automatiska slutresultat är **GODKÄNT** i samma hela körning.
Fysiska hjälpmedels- och enhetsprov ingår inte i dessa resultat.

<!-- markdownlint-disable MD013 -->
| Beslutsområde | Exakt primärfall | Faktiska filer och manuella fall | Omfattning och slutresultat |
| --- | --- | --- | --- |
| 1. Samlat införande och ansvar | [workspace-shell.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/workspace-shell.spec.ts) — “YTA-01: map tools protect unsent object loss and preserve staged work when closed” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [client.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/client.ts); Kod: [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [WorkspaceTools.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/WorkspaceTools.tsx), [App.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/App.tsx); Manuella fall: [workspace-shell.md](workspace-shell.md), [workspace-panels.md](workspace-panels.md) | Ny nåbar plats för behållna funktioner; Inställningar innehåller typdefinitioner. Avvecklade paneler har inga produktionsingångar. Automatiskt slutresultat GODKÄNT. |
| 2. Moduler och bevarat hushållsarbete | [household-work.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-work.spec.ts) — “ARBETE-02: conversation and microphone survive navigation and end on logout” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [live-browser.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/live-browser.ts), [live-provider.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/live-provider.ts); Kod: [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [use-household-work.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/use-household-work.ts), [use-conversation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/use-conversation.ts), [SpatialMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/SpatialMap.tsx); Manuella fall: [household-work.md](household-work.md), [personal-view.md](personal-view.md) | En ägare behåller utkast, samtal, oskickad text, urval och kamera. Även ARBETE-05/06, PANEL-01–05/08 och TEXT-08 ingår. Automatiskt slutresultat GODKÄNT. |
| 3. Befintlig domän och persistens | [draft-save.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-save.spec.ts) — “UTKAST-38: a lost save response keeps proposals until the same durable attempt is checked from the table” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [draft-save.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-save.ts); Kod: [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts), [server/map-routes.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map-routes.ts), [server/map-operations.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map-operations.ts), [shared/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/map.ts); Manuella fall: [save-check.md](save-check.md), [drafts.md](drafts.md), [household-recovery.md](household-recovery.md) | Serverns åtkomst, ägare, versioner och domänvillkor; hela utkastet sparas atomiskt med ett beständigt försök och kvitto. Automatiskt slutresultat GODKÄNT. |
| 4. Bindande designreferenser | [draft-review.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-review.spec.ts) — “UTKAST-31: long unbroken field labels wrap in full draft reading at 320 CSS pixels” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [draft-review.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-review.ts), [conflict-special.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-special.ts); Kod: [ObjectDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectDialog.tsx), [HouseholdTable.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdTable.tsx), [ConflictDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ConflictDialog.tsx), [DraftReview.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftReview.tsx); Manuella fall: [map.md](map.md), [object-lists.md](object-lists.md), [drafts.md](drafts.md) | Bindande A/C/D jämförs separat. Formulär, tabell, fulla läsare, fyra utkastkolumner och stödmodaler ingår. Automatiskt slutresultat GODKÄNT. |
| 5. Tabellens läsläge | [household-table.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-table.spec.ts) — “TABELL-02: full saved and proposed details distinguish every lifecycle and proposal status” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [household-table.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/household-table.ts); Kod: [HouseholdTable.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdTable.tsx), [ObjectReadDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectReadDetails.tsx), [read-field-values.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/read-field-values.ts); Manuella fall: [object-lists.md#tabell-02-sparade-och-föreslagna-värden-har-tydliga-skilda-statusar](object-lists.md#tabell-02-sparade-och-föreslagna-värden-har-tydliga-skilda-statusar) | Sparat och föreslaget värde, bilder, dolda fält, ekonomiska uppgifter, status och skillnaden mellan okänt och saknat. Automatiskt slutresultat GODKÄNT. |
| 6. Tabellens ordning och återgång | [household-table.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-table.spec.ts) — “TABELL-01: Swedish natural sorting, pagination and expanded rows survive map visits” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [household-table.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/household-table.ts), [workspace-browser.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/workspace-browser.ts); Kod: [HouseholdTable.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdTable.tsx), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx); Manuella fall: [object-lists.md](object-lists.md) | Svensk naturlig ordning, 50 rader per sida, öppna rader, rullning och användbar återgång. LISTA-05 täcker Inställningar. Automatiskt slutresultat GODKÄNT. |
| 7. Visa i kartan | [map-exploration.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/map-exploration.spec.ts) — “SÖK-06: map search shows direct context and exploration preserves hits through return and table visits” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [map-exploration.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/map-exploration.ts); Kod: [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [SpatialMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/SpatialMap.tsx), [map-search-context.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/map-search-context.ts); Manuella fall: [object-lists.md](object-lists.md), [spatial-map.md](spatial-map.md) | Endast uttrycklig visning återställer kartans filter och kamera. SÖK-08 täcker vybredder; LISTA-04 verklig grafikförlust. Automatiskt slutresultat GODKÄNT. |
| 8. Sökningens kontrakt | [object-search.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/object-search.spec.ts) — “SÖK-01: own detail fields, every word and Swedish normalization find objects” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [object-search.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/object-search.ts); Kod: [ObjectSearch.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectSearch.tsx), [ObjectReadDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectReadDetails.tsx), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx); Manuella fall: [object-lists.md](object-lists.md) | Egna sparade och föreslagna fält, ekonomisk text, alla ord och svensk normalisering; andra objekts uppgifter ger inga falska träffar. Automatiskt slutresultat GODKÄNT. |
| 9. Filter | [object-search.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/object-search.spec.ts) — “SÖK-04: the last proposal resets only draft filters in both views and type-only proposals expose them” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [object-search.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/object-search.ts); Kod: [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [HouseholdTable.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdTable.tsx), [ObjectSearch.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectSearch.tsx); Manuella fall: [object-lists.md](object-lists.md), [drafts.md](drafts.md) | Oberoende filter, även förslag som bara ändrar typer. Sista förslagets bortfall återställer endast utkastfiltret. Automatiskt slutresultat GODKÄNT. |
| 10. Sökingångar | [object-search.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/object-search.spec.ts) — “SÖK-03: map-only character and composition entry preserve separate searches and Escape restrictions” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [object-search.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/object-search.ts); Kod: [SpatialMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/SpatialMap.tsx), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [ObjectSearch.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectSearch.tsx); Manuella fall: [object-lists.md](object-lists.md) | Tecken och komposition från kartan, åtskilda sökningar, formulär och meddelanden, Escape och behållna filter. Automatiskt slutresultat GODKÄNT. |
| 11. Kartutforskning | [map-exploration.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/map-exploration.spec.ts) — “SÖK-07: direct context ignores hit filters while ended objects and edges require inclusion” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [map-exploration.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/map-exploration.ts); Kod: [map-search-context.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/map-search-context.ts), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [SpatialMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/SpatialMap.tsx); Manuella fall: [object-lists.md](object-lists.md) | En direkt länk från träffarna, tidigare ändpunkter, upphörda uppgifter och upprepad utforskning; SÖK-06–09 ingår. Automatiskt slutresultat GODKÄNT. |
| 12. Objektdialoger | [object-dialog.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/object-dialog.spec.ts) — “KARTA-11: closed-section errors preserve all fields and focus the linked correction” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [client.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/client.ts); Kod: [ObjectDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectDialog.tsx), [object-editor.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/object-editor.ts), [form-validation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/form-validation.ts); Manuella fall: [map.md](map.md), [object-types.md](object-types.md), [profile-images.md](profile-images.md) | Hela objektformuläret, slutna avsnitt, länkade valideringsfel, egna fält, typförlust, profilbilder och atomiskt tillägg. KARTA-10–19 ingår. Automatiskt slutresultat GODKÄNT. |
| 13. Sambandsdialogen | [relationship-dialog.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-dialog.spec.ts) — “SAMBAND-05: full relationship values survive canceled type loss and absent targets keep their distinct meanings” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [relationship-fixture.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/relationship-fixture.ts); Kod: [HouseholdReadDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdReadDialog.tsx), [RelationshipForm.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/RelationshipForm.tsx), [RelationshipReadDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/RelationshipReadDetails.tsx); Manuella fall: [relationships.md](relationships.md), [relationship-types.md](relationship-types.md) | Fullständiga ändpunkter, typ, riktning, kännedom, egna fält och giltighet. Samma ordinarie dialog från objekt och tabell. Automatiskt slutresultat GODKÄNT. |
| 14. Ett samband åt gången | [relationship-dialog.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-dialog.spec.ts) — “SAMBAND-01: separate complete objects connect and remain independently editable in the shared dialog” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [relationship-fixture.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/relationship-fixture.ts); Kod: [RelationshipForm.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/RelationshipForm.tsx), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts), [shared/relationship-label.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/relationship-label.ts); Manuella fall: [relationships.md](relationships.md) | Två separata objekt före sambandet. SAMBAND-02–04/07/10 täcker oberoende förslag, dubbletter, borttagning och upphörande. Automatiskt slutresultat GODKÄNT. |
| 15. Läsning utan kartgrafik | [household-reading.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-reading.spec.ts) — “LÄS-01: keyboard follows Alex to bicycle to garage and back without graphics or lost table state” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [household-reading.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/household-reading.ts); Kod: [HouseholdReadDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdReadDialog.tsx), [ObjectReadDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectReadDetails.tsx), [RelationshipReadDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/RelationshipReadDetails.tsx); Manuella fall: [object-lists.md](object-lists.md) | Alex → cykel → garage och tillbaka utan grafik; saknat mål ger ingen falsk länk. LISTA-07 täcker textuell borttagning. Automatiskt slutresultat GODKÄNT. |
| 16. Formulärförlust och oklart tillägg | [relationship-outcome-absence.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-outcome-absence.spec.ts) — “SAMBAND-15: absent stale editing cannot overwrite or remove a later same-owner relationship proposal” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [relationship-fixture.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/relationship-fixture.ts); Kod: [FormLeave.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/FormLeave.tsx), [ObjectDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ObjectDialog.tsx), [RelationshipForm.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/RelationshipForm.tsx), [App.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/App.tsx), [server/relationship-form-attempts.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/relationship-form-attempts.ts); Manuella fall: [relationships.md](relationships.md), [map.md](map.md), [household-work.md](household-work.md) | Endast oskickade formulärändringar får kastas. KARTA-15–18 och SAMBAND-06–10/14/15 täcker väntan, oklart utfall och nyare oberoende förslag. Automatiskt slutresultat GODKÄNT. |
| 17. Utkastets ingång och utseende | [draft-review.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-review.spec.ts) — “UTKAST-91: empty and type-only drafts preserve unsent text and first send asks consent once” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [draft-review.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-review.ts), [text-model.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/text-model.ts); Kod: [DraftReview.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftReview.tsx), [ConversationDraft.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ConversationDraft.tsx), [WorkspaceTools.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/WorkspaceTools.tsx), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx); Manuella fall: [drafts.md](drafts.md), [conversation-consent.md](conversation-consent.md) | Tomt utkast och enbart typförslag; UTKAST-90 visar fyra kolumner och ikoner. Textingången startar inte AI eller medgivande. Automatiskt slutresultat GODKÄNT. |
| 18. Granskning och borttagning i utkastet | [draft-removal.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-removal.spec.ts) — “UTKAST-41: independent removal preserves other proposals and history and focuses the next control” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [draft-review.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-review.ts), [draft-removal.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-removal.ts); Kod: [DraftReview.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftReview.tsx), [DraftProposalDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftProposalDetails.tsx), [DraftDiscardDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftDiscardDialog.tsx), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts); Manuella fall: [drafts.md](drafts.md), [object-types.md](object-types.md) | Alla fyra förslagskategorier läses fullständigt. UTKAST-27/90, 42–44 och 47/48 täcker beroenden, avbrott och aktuellt underlag; TYP-12 täcker ordning, 0 och Nej. Automatiskt slutresultat GODKÄNT. |
| 19. Sparmodal och återhämtning | [draft-save.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-save.spec.ts) — “UTKAST-40: a verified receipt closes the save dialog despite a failed map refresh and never repeats its announcement” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [draft-save.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/draft-save.ts), [scripts/manual-transport.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/manual-transport.ts); Kod: [DraftSaveDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftSaveDialog.tsx), [use-household-work.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/use-household-work.ts), [use-save-toast.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/use-save-toast.ts), [server/map-operations.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map-operations.ts); Manuella fall: [drafts.md](drafts.md), [operations.md](operations.md), [save-check.md](save-check.md) | UTKAST-36–40 skiljer väntande, oklart, avvisat och genomfört utfall; samma beständiga försök, tresekunderstoast, hämtningsfel efter framgång och ingen dubbel historik. Automatiskt slutresultat GODKÄNT. |
| 20. Konfliktingång och egenskapsval | [conflict-properties.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/conflict-properties.spec.ts) — “UTKAST-29: invalid relationship property combinations keep every choice until corrected” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [conflict-properties.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-properties.ts); Kod: [ConflictDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ConflictDialog.tsx), [shared/conflict-properties.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/conflict-properties.ts), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts); Manuella fall: [drafts.md](drafts.md) | UTKAST-28–30/34/35 täcker blandade val, ogiltiga kombinationer, nytt underlag, faktiska fältnamn och verkliga aktörer per egenskap. Automatiskt slutresultat GODKÄNT. |
| 21. Konflikternas specialfall | [conflict-external-corrections.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/conflict-external-corrections.spec.ts) — “UTKAST-65: an incompatible historical field is corrected in the ordinary object form before fresh conflict assessment” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [conflict-special.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-special.ts), [conflict-archive.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-archive.ts); Kod: [SpecialConflictDetails.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/SpecialConflictDetails.tsx), [ConflictDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ConflictDialog.tsx), [shared/conflict-special.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/conflict-special.ts), [shared/conflict-effects.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/conflict-effects.ts), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts); Manuella fall: [drafts.md](drafts.md), [object-types.md](object-types.md), [relationship-types.md](relationship-types.md) | UTKAST-57–78, TYP-03 och STY-05 täcker borttagning, dubbletter, saknade referenser och typer, datatyper, vanlig rättelse och samtidiga hinder. Återställning kräver faktisk borttagen definition. Automatiskt slutresultat GODKÄNT. |
| 22. Konfliktlösningens serverkontrakt | [conflict-continuity.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/conflict-continuity.spec.ts) — “UTKAST-50: refreshed conflict data clears only choices for properties that actually changed” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [conflict-continuity.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-continuity.ts), [conflict-special.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/conflict-special.ts); Kod: [use-conflict-resolution.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/use-conflict-resolution.ts), [ConflictDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/ConflictDialog.tsx), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts), [shared/conflict-effects.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/shared/conflict-effects.ts); Manuella fall: [drafts.md](drafts.md) | UTKAST-49–56 behåller opåverkade val och kontrollerar faktisk effekt efter tappat svar. Ägare, generation och versioner förhindrar gammal begäran; löst namn, typ och nästa konflikt ingår. Automatiskt slutresultat GODKÄNT. |
| 23. Rapporter och avvecklade funktioner | [history.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/history.spec.ts) — “HISTORIK-10: a direct save link reads historical types after their definitions change” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [client.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/client.ts); Kod: [Reports.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/Reports.tsx), [HouseholdMap.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdMap.tsx), [server/map.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/map.ts), [server/text-assistant.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/text-assistant.ts), [server/assistant-instructions.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/server/assistant-instructions.ts); Manuella fall: [history.md](history.md), [operations.md](operations.md), [docs/adr/0005-utkast-sparas-samlat.md](../../docs/adr/0005-utkast-sparas-samlat.md) | HISTORIK-01/10–13 täcker senaste först, exakt kvitto, direktlänkar, historiska typer och ikoner samt bevarad återgång. Historisk ångring och objektsammanslagning är avvecklade. Automatiskt slutresultat GODKÄNT. |
| 24. Fokus, fel och semantik | [relationship-dialog-accessibility.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-dialog-accessibility.spec.ts) — “SAMBAND-13: staging cancel and explicit outcome checks retain meaningful focus without stealing later reading focus” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [relationship-fixture.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/relationship-fixture.ts), [workspace-browser.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/workspace-browser.ts); Kod: [modal-focus.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/modal-focus.ts), [HouseholdTable.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdTable.tsx), [HouseholdReadDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/HouseholdReadDialog.tsx), [FormLeave.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/FormLeave.tsx), [DraftSaveDialog.tsx](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/src/client/DraftSaveDialog.tsx); Manuella fall: [relationships.md](relationships.md), [object-lists.md](object-lists.md), [workspace-panels.md](workspace-panels.md), [drafts.md](drafts.md) | Modalfokus, Escape, länkad rättelse, försvunnen öppningskontroll och skydd för senare fokus. Fysisk hjälpmedels- och pekverifiering ingår inte i automatiken. Automatiskt slutresultat GODKÄNT. |
| 25. Dokumentation och data i samma PR | [transport-controls.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/transport-controls.spec.ts) — “SPAR-05: scoped transport holds real staging, rejects stale saves and recovers a lost committed receipt” | Provgränser: [installation.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/installation.ts), [client.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/support/client.ts), [scripts/manual-transport.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/manual-transport.ts), [scripts/manual-transport-control.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/manual-transport-control.ts); Kod: [scripts/seeds/demo.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/seeds/demo.ts), [scripts/setup-database.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/setup-database.ts), [scripts/manual-transport.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/manual-transport.ts), [scripts/manual-transport-control.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/manual-transport-control.ts); Manuella fall: [operations.md](operations.md), [docs/development/testing.md](../../docs/development/testing.md), [användarguider](../user-guide/README.md), [docs/operations/operator-upgrade-notes.md](../../docs/operations/operator-upgrade-notes.md) | DEMO-01 med båda konfigurerade administratörsleverantörerna; 16 objekt, 21 samband, Alex-kedjan, fria egenskaper, konflikt och två tillskrivna sparanden. Guider och stabila fall-ID:n ingår. Slutresultatet redovisas med hela kontrollkörningen. |
<!-- markdownlint-enable MD013 -->

## Åtta fullständiga arbetskedjor

Samtliga kedjors automatiska resultat är **GODKÄNT** på den slutliga
sammanfogade versionen. Länkarna anger verkliga primärfall; fall-ID:n och
kompletterande steg finns i områdesmanualerna ovan. Mänskliga prov med
fysiska hjälpmedel och enheter är fortfarande **INTE UTFÖRDA**.

<!-- markdownlint-disable MD013 -->
| Kedja | Exakt primärfall | Krav på det fullständiga utfallet | Automatiskt slutresultat |
| --- | --- | --- | --- |
| 1 | [household-reading.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-reading.spec.ts) — “LÄS-01: keyboard follows Alex to bicycle to garage and back without graphics or lost table state” | Hitta och läsa Alex → cykel → garage utan kartgrafik, återgå med tabellens sökning, sida, öppna rader, rullning och fokus kvar. | GODKÄNT |
| 2 | [relationship-dialog.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-dialog.spec.ts) — “SAMBAND-01: separate complete objects connect and remain independently editable in the shared dialog” | Skapa två fullständiga objekt separat, koppla ihop dem och redigera objekt och samband; giltiga och ogiltiga värden prövas. | GODKÄNT |
| 3 | [relationship-dialog.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/relationship-dialog.spec.ts) — “SAMBAND-02: invalid next input and canceled form loss retain previous complete relationship proposals” | Lägga tidigare förslag i utkastet, fortsätta redigera eller uttryckligen kasta endast oskickad formulärtext; nyare förslag får inte skrivas över. | GODKÄNT |
| 4 | [draft-removal.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-removal.spec.ts) — “UTKAST-41: independent removal preserves other proposals and history and focuses the next control” | Läsa alla fyra förslag med dolda fält, bilder och ekonomi; ta bort oberoende förslag och bekräfta eller avbryta beroenden och hela utkastet. | GODKÄNT |
| 5 | [draft-save.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/draft-save.spec.ts) — “UTKAST-38: a lost save response keeps proposals until the same durable attempt is checked from the table” | Spara med framgång, avvisning, väntan och oklart utfall; kontrollera samma försök efter omladdning, få ett kvitto och en toast utan fokusstöld. | GODKÄNT |
| 6 | [conflict-continuity.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/conflict-continuity.spec.ts) — “UTKAST-49: switching conflicts and reopening preserves choices and never clears another conflict’s stale guard” | Lösa från båda vyerna med blandade val, specialfall, vanliga rättelser och samtidiga hinder; nytt underlag, tappat svar, nästa konflikt och försvunnen öppnare ingår. | GODKÄNT |
| 7 | [history.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/history.spec.ts) — “HISTORIK-01: Reports preserves table work and lists only completed saves latest first” | Läsa gemensam historik utan samtal, AI eller kartgrafik; följa exakt sparlänk och återgå med tabellsökning och oskickad text kvar. | GODKÄNT |
| 8 | [household-work.spec.ts](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/household-work.spec.ts) — “ARBETE-06: selection and personal map view survive navigation and resizing” | Byta arbetsyta och stänga stödytor med utkast, samtal, text, separata sökningar och filter, urval, kamera och utforskning kvar. | GODKÄNT |
<!-- markdownlint-enable MD013 -->

## Verifierade rättelser

Slutgranskningens rättelser följer rapportens kravområden och arbetskedjor:

- [`650f5d2`](https://github.com/viscalyx/skyttel/commit/650f5d2):
  säkerhetsrättningen av det indirekta beroendet `source-map-js` till
  1.2.2 ändrar inga direkta versionskrav. En ny installation, granskade
  installationsskript och `npm audit` visar noll höga eller kritiska fynd.
  GitHubs beroende- och containersäkerhetskontroller är godkända.
- [`cfb53e0`](https://github.com/viscalyx/skyttel/commit/cfb53e0):
  avbruten kontextöverlämning visar den färdiga återställningen efter
  faktisk uppdatering. Riktiga MCP- och SQLite-prov håller läsningen och
  kontrollerar aktuell revision utan att ändra privata förslag.
- [`5ce3c08`](https://github.com/viscalyx/skyttel/commit/5ce3c08):
  medgivandets placeringsprov mäter både tillräckligt utrymme och verklig
  förskjutning vid för låg vy. Kravet på exakt placering bevaras.
- [`11e0a4c`](https://github.com/viscalyx/skyttel/commit/11e0a4c):
  containerproven kräver att avvecklade verktyg saknas och avvisas.
  Vanlig uttrycklig objektborttagning provas med samlat sparande,
  beständigt kvitto och oförändrat oberoende innehåll.
- [`3a9afef`](https://github.com/viscalyx/skyttel/commit/3a9afef) och
  [`c077405`](https://github.com/viscalyx/skyttel/commit/c077405):
  historikprovet inväntar den verkliga kvittoläsningen och konfliktprovet
  inväntar användbar stängning före Escape. Fullständiga sparade värden,
  förslag och historiska uppgifter kontrolleras fortfarande.
- [`cace815`](https://github.com/viscalyx/skyttel/commit/cace815):
  provet för ogiltig eller för stor bild inväntar verkligt valideringssvar
  innan felet läses. Samma formulärvärden och tidigare förslag bevaras;
  varje val gör ett tilläggsförsök och formuläret blir användbart igen.
- [`6f51f3c`](https://github.com/viscalyx/skyttel/commit/6f51f3c):
  rapportens sammanfattning och mätningens hela källträd anger samma
  faktiska underlag som metoden och den fullständiga mätfilen.
- [`a73b2cf`](https://github.com/viscalyx/skyttel/commit/a73b2cf):
  alla 19 bildtypsprov inväntar verkligt tillägg och formulärstängning.
  Fullständiga värden, tidigare förslag, kvitto och historik behålls;
  ogiltig bild ger samma avvisning med användbart formulär kvar.
- [`3af850a`](https://github.com/viscalyx/skyttel/commit/3af850a):
  navigationsprovet upprepar vanlig rullning efter ändrad vyhöjd med
  samma exakta gränser och träffkontroller.
- [`c118724`](https://github.com/viscalyx/skyttel/commit/c118724):
  konfliktprovet inväntar färdig jämförelse och kontrollerar stängning.
  Resurserna stängs utan att ersätta det ursprungliga provfelet.
  Oberoende förslag, gemensamma värden och nytt sparande kontrolleras.
- [`7c06bc6`](https://github.com/viscalyx/skyttel/commit/7c06bc6):
  den täta kartans prov kontrollerar alla 500 objekt och 1 500 samband
  genom Chromium:s riktiga tillgänglighetsträd per tabellsida.
  Alla arbetsflöden och tidsgränsen på 60 sekunder bevaras.

- [`d3474ed`](https://github.com/viscalyx/skyttel/commit/d3474ed):
  läsytan rymmer hela Samband-knappen även när dess text har flera rader
  och navigation samt samtalsnotis är öppna i ett kort fönster.
  Notisens hela text och kryss behålls utan minskad textstorlek.
  Exponering prövas mot både hela fönstret och läsytans rullningsgränser,
  med oförändrade träffkontroller och fullständiga arbetsflöden.
  Verkligt systemtypsnitt DejaVu Sans ger 24 godkända navigations- och
  markeringsprov vid upprepning.
  Grundtypsnittets 15 navigationsprov är också godkända. Det ursprungliga
  GitHub-felets typsnitt är inte fastställt; fysisk touch ingår inte.

- [`c8394cc`](https://github.com/viscalyx/skyttel/commit/c8394cc),
  [`caf5073`](https://github.com/viscalyx/skyttel/commit/caf5073) och
  [`5068e62`](https://github.com/viscalyx/skyttel/commit/5068e62):
  gammalt röstarbete stoppas innan samtalets uppgifter töms. Fördröjda
  avbrytningar hör till sitt ursprungliga samtal. Gamla lässvar får inte
  ersätta nytt utkast eller sparförsök; ett gammalt misslyckat uppdrag
  får inte stänga det nya samtalet. Fyra styrda felprov går genom riktig
  HTTP, MCP och SQLite. Samma medgivande, privata förslag, delat innehåll,
  historik och besked efter ett talat Nytt samtal behålls.
- [`84ab33d`](https://github.com/viscalyx/skyttel/commit/84ab33d):
  Avbryt från röstrutan och Escape i textvyn använder aktuell
  samtalskontext även när mikrofonen tystnar asynkront. Två riktiga
  HTTP-flöden med ReactDOM i jsdom håller avbrytningen före servern och
  kräver avvisning av den gamla begäran med det nya arbetet kvar.
  Detta är inte ett prov med installerad Chrome eller fysiskt hjälpmedel.
- [`07f31e9`](https://github.com/viscalyx/skyttel/commit/07f31e9):
  samtalsprovets läsningar delar hela provets oförändrade gräns på
  30 sekunder. Alla 205 svar, sammanfattning, kapacitet och identiska
  återförsök kontrolleras fortfarande. Ett verkligt hållet MCP-svar visar
  att färdigt arbete kan anlända efter den gamla delgränsen på en sekund.
  Det fastställer inte det ursprungliga GitHub-felets underliggande orsak.
  Feldiagnostik innehåller offentliga statusar och tider utan samtalstext.
  Rå V8-data räknas inte som applikationstäckning; hela körningens
  globala täckning och oförändrade krav gäller.
- [`aa8af52`](https://github.com/viscalyx/skyttel/commit/aa8af52):
  avbrytningsprovets exakta förväntan kräver initial samtalskontext noll.
  Kravet på exakt ett anrop, tömd privat text och behållen hushållsåtkomst
  bevaras. Produktionskoden ändras inte.

- [`eb13279`](https://github.com/viscalyx/skyttel/commit/eb13279):
  Tabellens Redigera och Visa i kartan behåller motsvarande radkontroll.
  TABELL-04/05 prövar samma öppnare, nästa rad, föregående rad och rubriken
  genom riktiga formulär, HTTP och SQLite. Sparade objekt, utkastets
  statusförslag och sökningen kontrolleras separat.
  Identiska tillgänglighetskontroller för fokusmål delas utan att ändra
  dialogernas egna återgångar.
- [`458ce0f`](https://github.com/viscalyx/skyttel/commit/458ce0f) och
  [`a53edf8`](https://github.com/viscalyx/skyttel/commit/a53edf8):
  Hjälp och körbara manuella steg använder Tabell, utkastet i textvyn och
  Rapporter med Ändringshistorik. YTA-07 skiljer bekräftad förlust av
  formulärändringar från bevarade förslag och oskickat samtalsmeddelande.
  SPARKONTROLL-05 skiljer ett avvisat försök från genomförd historik och
  jämför samma beständiga identitet, utkast och frånvaro av kvitto.
  Två delade Markdown-länkar får hela, fungerande adresser.

Följande rättelser ingår i den angivna rena versionen. De riktade proven
bevarar fullständiga värden, privata förslag, delat innehåll och historik.
De ersätter inte hela kontrollkörningen eller fysisk verifiering.

- [`8350e34`](https://github.com/viscalyx/skyttel/commit/8350e34):
  den manuella provtransporten håller och tappar rätt verkliga svar för
  konfliktlösning och borttagning; 13 offentliga HTTP-prov kontrollerar
  även loopback, ursprung, autentisering och hushållsavgränsning.
- [`e1e129f`](https://github.com/viscalyx/skyttel/commit/e1e129f):
  sambandsprovet inväntar den aktuella tabellens rader efter ett bekräftat
  kvitto. Ett hållet verkligt kartsvar skiljer beständig lagring från
  tabellens senare uppdatering utan att fördröja beskedet om sparande.
- [`b72f659`](https://github.com/viscalyx/skyttel/commit/b72f659):
  tabelläsning visar riktiga historiska fältnamn och skiljer ett saknat
  sparat fält från föreslagna värden, inklusive 0, Nej och dolda fält.
- [`7df3ea0`](https://github.com/viscalyx/skyttel/commit/7df3ea0):
  fönsteravbrott stoppar hållen mikrofonfångst direkt även om en väntande
  effekt annars skulle slå på den igen.
- [`7fee6cf`](https://github.com/viscalyx/skyttel/commit/7fee6cf):
  spar- och mikrofonprov skiljer den synliga notisen från klippt
  uppläsningstext; samma försök, medgivande och kvitto prövas fortfarande.
- [`b4b379e`](https://github.com/viscalyx/skyttel/commit/b4b379e) och
  [`c306c79`](https://github.com/viscalyx/skyttel/commit/c306c79):
  läsbar samtalsnotis får eget utrymme; faktisk pekåtkomst till återgången
  i Rapporter, läsuppgifter, kartstatus och Navigering kontrolleras.
- [`9b4f017`](https://github.com/viscalyx/skyttel/commit/9b4f017):
  fullständiga typdefinitioners uppgifter börjar på separata rader i
  jämförelsen, det valda resultatet och det bekräftade resultatet.
- [`c60a114`](https://github.com/viscalyx/skyttel/commit/c60a114) och
  [`d39a5fa`](https://github.com/viscalyx/skyttel/commit/d39a5fa):
  tabellens filter behåller C:s ram, kryss och resultatknapp;
  kryssrutor står bredvid sina etiketter och Escape fungerar vid alla
  prövade vybredder.

## Bindande beslut och låsta referenser

Kravområdena och arbetskedjorna ovan anger rapportens acceptansomfattning.
Använd följande lokala underlag för konkreta steg och förväntade resultat:

- [Arbetsytan](workspace-shell.md) och [hushållsarbetet](household-work.md)
  beskriver verktyg, benämningar, bevarat arbete och hela arbetskedjor.
- [Objektlistorna](object-lists.md) och [objektformulären](map.md)
  beskriver tabell, sökning, filter, läsning och förlustskydd.
  [Sambandsfallen](relationships.md) beskriver det fullständiga
  sambandsformuläret och dess separata förslag.
- [Utkastfallen](drafts.md) beskriver full läsning, konflikter, beroende
  borttagning och samlat sparande. [Sparutfallen](save-check.md) och
  [historiken](history.md) beskriver beständiga försök och kvitton.
- [Hjälpmedelsfallen](conversation-accessibility.md) beskriver läsordning,
  status, fokus, fysisk inmatning och förstoring. Mänskliga observationer
  redovisas separat från DOM- och webbläsarprov.

De låsta visuella referensernas kontrollpunkter och tillåtna skillnader
beskrivs i [den visuella verifieringen](workspace-visual-verification.md).
Läsbara värden i borttagna poster ska visas som statisk text. Status och
sparutfall ska vara åtkomliga utan att detaljvyer öppnas, och stängda
dialoger ska återföra fokus till en användbar kontroll.

- [Låst
  A](https://github.com/viscalyx/skyttel/tree/d28a1f94b10d3d5dc98410933667ab320be5d908)
  gäller konfliktformuläret och varje obligatorisk checkpunkt.
- [Låst
  C](https://github.com/viscalyx/skyttel/tree/cc0410566b7056bcd6b1fec2d940620a0eab3be7)
  gäller tabell, sökytor och objekt- och sambandsformulär.
- [Låst
  D](https://github.com/viscalyx/skyttel/tree/19f18f7ecaafbe87b6944284992402d8abdd46b0)
  gäller utkastets fyra kolumner, ikoner, fulla förslag och stödmodaler.

Prototypgrenarna bevaras. Simuleringar och exempeldata i prototyperna
är inte produktionsbevis. Den
[visuella verifieringen](workspace-visual-verification.md) redovisar den
angivna produktionskällan, 14 A-fall, C:s kontrollpunkter och D:s läsare och
stödmodaler. Sex utvalda bilder bevarar tre faktiska referenspar.
Jämförelsen skiljer motsvarande tillstånd från olika fiktiva provdata.

## Demodata, prestanda och kvarstående mänskliga prov

[DEMO-01](operations.md#demo-01-utvecklingshushållet-har-verkliga-uppgifter-och-läsbara-samband)
och
[databasproven](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/tests/integration/database-setup.spec.ts)
kontrollerar båda konfigurerade administratörsleverantörerna, återställning,
återstart, hushållstillgång och privata uppgifter.
[Demodata](https://github.com/viscalyx/skyttel/blob/aa8af52e25005f5700c9841eb17dcd3bd6c36d6c/scripts/seeds/demo.ts)
omfattar 16 objekt och 21 samband,
hela Alex-kedjan, fria egenskaper och två tillskrivna sparanden.
Slutligt automatiskt resultat redovisas med hela kontrollkörningen.

Den rena versionens [mätdata](workspace-measurement.json) bevarar samtliga
sex observationer och fullständig miljöinformation. Mätningen är utförd
2026-10-06 12:54 UTC med 500 objekt och 1 500 samband, 1440 × 1000
CSS-pixlar, 40 ms latens, 20 Mbit/s ned och 5 Mbit/s upp. Övriga testjobb
körs separat från denna mätning.

<!-- markdownlint-disable MD013 -->
| Prov | Cache | Öppning, ms | Sökning, ms | Sparande, ms | Etiketter | Överlapp |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Kall | 3632,85 | 31,69 | 226,59 | 23 | 0 |
| 1 | Varm | 3596,38 | 29,79 | 224,16 | 23 | 0 |
| 2 | Kall | 3795,79 | 27,74 | 230,60 | 23 | 0 |
| 2 | Varm | 3510,13 | 29,57 | 215,89 | 23 | 0 |
| 3 | Kall | 3578,06 | 35,26 | 211,33 | 23 | 0 |
| 3 | Varm | 3535,70 | 29,49 | 203,48 | 23 | 0 |
<!-- markdownlint-enable MD013 -->

Alla sex observationer når mätplanens gränser: högst 5 sekunders öppning,
1 sekunds sökning och 2 sekunders sparande, utan överlappande etiketter.
Efter varje verkligt sparande matchar innehåll, historik och kvitto.
Efter serverns återstart matchar också det beständiga försöket och dess
kvitto; utkastet är tomt. JSON-fältet `sourceTree` anger hela repots träd
`4b1f876e6aa6ddd50e7a1b30552cfe81272b30a9`, inte bara `src`-trädet ovan.

[Mätplanen](large-map-performance.md) definierar provdata och gränser.
Kall cache betyder ett nytt webbläsarsammanhang; serverns och systemets
cache hålls varm. Mätningen ger sex individuella observationer, inga
percentiler eller minimikrav på enhetens prestanda. Lokal HTTP och
nätverksemulering mäter inte fjärr-TLS, verklig internetväg, samtidig last,
stora egna bilder eller produktionens serverkapacitet. Den verifierar
inte heller fysisk touch eller faktisk hjälpmedelsanvändning.

Följ områdesmanualernas verkliga inloggning, administratörs- och
medlemsåtkomst samt syntetiska provdata. De kontrollerade transportproven
behöver redan konfigurerad HTTPS-ingång och uttryckliga hållna eller tappade
svar. Vanlig nätfrånkoppling bevisar inte att lagring sker före ett tappat
svar. Rapporten innebär ingen exponering av testserver eller publicering.

Följande är **INTE UTFÖRT** och får inte räknas som godkänt:

- Installerad Chrome på Windows, macOS, iPhone och iPad.
- NVDA på Windows och VoiceOver på macOS, iPhone och iPad.
- Fysisk touch och skärmtangentbord i fullständiga arbetskedjor.
- Verklig webbläsarförstoring på 200 och 400 procent för samtliga kedjor.
- Fullständig kontrast-, läsordnings-, fokus-, omflödes- och
  pekmålsbedömning, inklusive alternativ till dragning.

Automatiska tangentbords-, DOM-, bild-, medie- och fönsterprov är separat
underlag. De fastställer inte fullständig WCAG-överensstämmelse.
[Familjeflödenas rapport](connected-experience-verification.md) skiljer
aktuella funktionella prov från sina uttryckligen äldre bilder och
begränsade miljöobservationer; äldre bilder ommärks inte som slutbevis.

## Slutresultat

<!-- markdownlint-disable MD013 -->
| Fält | Status |
| --- | --- |
| Slutlig kod- och byggversion, webbläsare och provmiljö | `aa8af52e25005f5700c9841eb17dcd3bd6c36d6c`; Linux, Chromium 153.0.8010.12, Node 24.21.0, npm 12.0.2, Playwright 1.63.0; samma `src`-träd `43ddca812c97e9c650aa3b2227cedbe24f1cd758` som faktiska A/C/D-bilder, mätning och containerkontroll på `07f31e9cd1c957999cf223d55463d119a00a1fe3` |
| Hela `CI=1 npm run check`: typkontroll, lint, dokumentation, grindar, bygge, täckning och integration | GODKÄND på `aa8af52`; 140 grindprov, 1 582 enhets- och webbläsarprov; grentäckning 90,21 procent mot kravet 90 |
| Slutlig primärkörning, antal godkända/underkända och verifierade rättelser | 719 GODKÄNDA, 0 underkända och 0 överhoppade; 33 primärhänvisningar med 29 skilda exakta titlar och 246 lokala hänvisningar verifierade |
| Containerkontroll | GODKÄND; 9 av 9 steg på `07f31e9`, samma produktionskälla som hela kontrollkörningen; provversionen ommärks inte |
| Standards- och Spec-granskningar samt omprov av deras rättelser | 0 kvarstående åtgärdbara fynd på båda axlarna vid `9422672`; alla rättelser ingår i den godkända hela körningen |
| A/C/D-jämförelse på dator och mobil | GENOMGÅNGEN på `07f31e9` inom angivna tillstånd; A01/A02:s knappbilder begränsar påståenden om varje kontrolls läsbarhet; fysisk verifiering ingår inte |
| Prestanda för 500 objekt och 1 500 samband | GODKÄND på `07f31e9` enligt mätplanen i sex observationer; fysisk och samtidig last ingår inte |
| Fysiska hjälpmedels-, telefon- och förstoringstester | INTE UTFÖRDA |
<!-- markdownlint-enable MD013 -->

Slutresultaten anger de oförändrade källversioner som proven använder.
Rapporten skiljer hela den godkända automatiska körningen från kvarstående
mänskliga prov och innebär inget påstående om fullständig tillgänglighet.
