# Manuella testfall för modellval

Fallen provar modellval och resonemangsnivå i appens text- och röstläge.
Anteckna commit, webbläsare och resultat. Kontrollerade leverantörer
verifierar produktkontraktet; verklig modellkvalitet ingår inte.

## Konfigurerade användare

Alex Exempel är administratör i ett eget testhushåll och loggar in med
Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
2. Skapa ett tomt hushåll. Aktivera båda modellerna med alla tre nivåer.
   Återställ inte användardata mellan valen.

## Samma val i text och röst

### MODELLVAL-01: välj modell och nivå med tangentbord och pekknappar

**Syfte:** Text och röst visar samma val och modellbyte behåller nivån.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett nytt samtal utan sparat modellval.

**Automatiskt motsvarande test:**
[conversation-model-choice.spec.ts](../../tests/integration/conversation-model-choice.spec.ts).

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-model-choice.spec.ts",
    "caseId": "MODELLVAL-01"
  },
  "reference": "Dator och mobilbredd 390. Riktig server och databas.",
  "outcomes": [
    "Text och röst delar modellval",
    "Tre resonemangsnivåer går att välja utan dragning",
    "Modellbyte behåller nivån",
    "Escape återför fokus"
  ]
}
```
-->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**.
2. Fokusera **Modell och resonemang: GPT-6.1 Terra, Hög** och tryck Enter.
3. Läs att GPT-Live 1 fortsätter lyssna och tala. Fokusera slidern och
   tryck Home och sedan högerpil. Läs Låg respektive Medium.
4. Välj modellnamnet och markera **GPT-6.1 Sol**. Vänta på sparbeskedet.
   Tryck Escape och kontrollera fokus på öppningsikonen och nivån Medium.
5. Slå på mikrofonen. Öppna ikonen vid röstrutan och välj knappen **Hög**.
   Tryck Escape. Läs Sol/Hög vid båda ikonerna och kontrollera fokus.
6. Använd mobilbredd. Öppna textvyns ikon och välj knappen **Låg**.

**Förväntat resultat:** Alla tre nivåer går att välja utan dragning.
Text och röst visar samma val; modellbytet behåller nivån. Dialogerna
visar när valet börjar gälla, och fokus återgår efter Escape.

### MODELLVAL-03: välj en aktiverad kombination efter ändrad installation

**Syfte:** Ett otillgängligt sparat val bevaras och ett annat kan väljas.

**Användare:** Alex Exempel och installationsansvarig för förberedelsen.

**Förutsättningar:** Alla sex kombinationer är först aktiverade.

**Automatiskt motsvarande test:**
[conversation-model-choice.spec.ts](../../tests/integration/conversation-model-choice.spec.ts).

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-model-choice.spec.ts",
    "caseId": "MODELLVAL-03"
  },
  "reference": "Riktig serveromstart med bara Sol/hög aktiverad.",
  "outcomes": [
    "Sparat Terra/medium behålls med förklaring",
    "Användaren kan uttryckligen välja Sol/hög",
    "Text och röst delar det nya valet med fungerande fokusåtergång"
  ]
}
```
-->

**Steg:**

1. Börja ett textsamtal och öppna **Modell och resonemang**. Välj Medium.
2. Installationsansvarig ändrar aktiveringen till bara Sol/hög och startar
   om enligt [aktiveringsguiden](../operations/conversation-models.md).
3. Ladda om och börja ett nytt textsamtal. Öppna ikonen Terra, Medium.
4. Läs varför valet inte är tillgängligt. Välj **Välj GPT-6.1 Sol, Hög**.
   Kontrollera att fokus finns på dialogens rubrik när valknappen försvinner.
5. Tryck Escape och kontrollera fokus vid textvyns ikon. Slå på
   mikrofonen, öppna röstrutans ikon och läs Sol/Hög. Tryck Escape och
   kontrollera fokus vid röstrutans ikon.

**Förväntat resultat:** Terra/Medium visas fram till det uttryckliga valet.
Sol/Hög blir därefter samtalets val. Ingen reservmodell väljs automatiskt.

### MODELLVAL-04: stäng modelldialogen medan arbete och kö fortsätter

**Syfte:** Escape stänger dialogen utan att avbryta samtalets arbete.

**Användare:** Alex Exempel.

**Förutsättningar:** Datorbredd och ett nytt textsamtal. Använd
[köförberedelsens hållna modellsvar](conversation-queue.md#allmän-förberedelse).

**Separat förberedelse:** Vid steg 4, kör `pending` i installationens
terminal och `reply REQUEST "Första svaret"` med det första anropets ID.
Kör därefter `pending` och `reply REQUEST "Andra svaret"` med nästa ID.

**Automatiskt motsvarande test:**
[conversation-model-choice.spec.ts](../../tests/integration/conversation-model-choice.spec.ts).

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-model-choice.spec.ts",
    "caseId": "MODELLVAL-04"
  },
  "reference": "Dator, riktig server och kontrollerat fördröjt modellsvar.",
  "outcomes": [
    "Escape stänger modelldialogen och återför fokus",
    "Pågående och köat uppdrag slutförs i ordning"
  ]
}
```
-->

**Steg:**

1. Börja ett textsamtal och skicka **Första uppdraget**. Skicka sedan
   **Andra uppdraget** medan Skyttel arbetar.
2. Öppna **Modell och resonemang** och tryck Escape.
3. Kontrollera att dialogen stängs och att fokus återgår till ikonen.
4. Följ den separata förberedelsen för att släppa svaren. Läs
   **Första svaret** och därefter **Andra svaret** i samtalstexten.

**Förväntat resultat:** Dialogen stängs utan att något uppdrag avbryts.
Det andra uppdraget ligger kvar i kön och besvaras efter det första.

### MODELLVAL-05: välj mellan aktiverade par utan en gemensam nivå

**Syfte:** Alla aktiverade kombinationer går att nå med ett uttryckligt val.

**Användare:** Alex Exempel; installationsansvarig förbereder aktiveringen.

**Förutsättningar:** Bara Terra/hög och Sol/låg är aktiverade enligt
[aktiveringsguiden](../operations/conversation-models.md). Nytt textsamtal.

**Automatiskt motsvarande test:**
[conversation-model-choice.spec.ts](../../tests/integration/conversation-model-choice.spec.ts).

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-model-choice.spec.ts",
    "caseId": "MODELLVAL-05"
  },
  "reference": "Terra/hög och Sol/låg är installationens enda aktiverade par.",
  "outcomes": [
    "Ett tillgängligt val hindrar inte byte till ett annat aktiverat par",
    "Användaren väljer uttryckligen både modell och nivå"
  ]
}
```
-->

**Steg:**

1. Öppna **Modell och resonemang**. Läs att Terra/hög är aktuellt.
2. Öppna modellvalet via **GPT-6.1 Terra**. Välj uttryckligen
   **Välj GPT-6.1 Sol, Låg** och vänta på sparbeskedet.
3. Stäng dialogen och kontrollera Sol/Låg vid ikonen. Öppna modellvalet
   igen och välj uttryckligen **Välj GPT-6.1 Terra, Hög**.

**Förväntat resultat:** Båda aktiverade par går att välja. De vanliga
modellvalen behåller resonemangsnivån; det särskilda parvalet anger
uttryckligen båda inställningarna. Avstängda mellanval behövs inte.

### MODELLVAL-02: skärmläsare, förstoring och visuell bedömning

**Syfte:** Bedöm hela flödet med verkliga hjälpmedel och förstoring.

**Användare:** Alex Exempel.

**Kräver mänsklig observation:** Genomför stegen i MODELLVAL-01 med
skärmläsare på dator och mobil, samt 200 och 400 procents förstoring.
Kontrollera namn, sliderns upplästa nivå, statusbesked, fokusordning,
fokusåtergång, kontrast, pekmål och att text och kontroller kan nås utan
förlust eller överlappning. Stäng dialogen innan ett fördröjt sparbesked
kommer och kontrollera att både framgång och fel läses upp. Bedöm ikon
och dialoger visuellt i appen.
Detta kräver separat utförd observation och är inte visuellt godkänt.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Modellval med skärmläsare, zoom och visuell bedömning."
  },
  "reference": "Dator och mobil, skärmläsare och 200/400 procents zoom.",
  "outcomes": [
    "Namn och nivå läses upp",
    "Status och fokus kan följas",
    "Kontroller och text fungerar vid förstoring"
  ]
}
```
-->
