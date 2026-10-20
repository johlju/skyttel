# Manuella testfall för fria egenskaper

Fallen gäller objektets och sambandets fria egenskaper genom redigering,
ditt utkast och samlat sparande. Anteckna commit, webbläsare och resultat
vid körning.

## Konfigurerade användare

Använd en inloggad Skyttel-användare i ett syntetiskt hushåll. Följ
[installationsguiden](../operations/installation.md) för miljön.
Använd inga verkliga hushållsuppgifter.

## Allmän förberedelse

1. Starta en separat testinstallation enligt
   [installationsguiden](../operations/installation.md). Skapa ett tomt
   hushåll. Börja varje fall med en ny testdatabas.
2. Öppna hushållet. **Nytt objekt** öppnar objektformuläret.
   **Tabell → Redigera [namn]** öppnar ett befintligt objekt.
3. **Skriv till Skyttel → Visa utkastet** öppnar utkastvyn.
   **Visa förslaget: [namn]** visar hela förslaget.
   Stäng förslaget och välj **Spara hela utkastet** för samlat sparande.
4. Behåll databasen vid omstart inom fallet. Stäng textvyn efter sparandet.

## Redigering och beständighet

### EGENSKAP-01: redigera, ordna och rätta egenskaper på dator

**Syfte:** Bevara separata egenskaper med samma etikett, ogiltig inmatning
och skillnaden mellan tömning och borttagning.

**Användare:** Den inloggade Skyttel-användaren.

**Förutsättningar:** Fönsterbredd 1440 bildpunkter, tomt hushåll och
testinstallation som kan startas om med samma databas.

**Automatiskt motsvarande test:**
[free-object-properties.spec.ts](../../tests/integration/free-object-properties.spec.ts),
EGENSKAP-01. Provet använder riktiga formulär, HTTP och SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/free-object-properties.spec.ts",
    "caseId": "EGENSKAP-01"
  },
  "reference": "Chromium, 1440 × 900, syntetiskt hushåll. Felaktigt tal efter datatypbyte skyddar inmatning och utkast; upprepade etiketter skyddar oberoende redigering.",
  "outcomes": [
    "Fel bevarar inmatning och lämnar utkastet orört.",
    "Tangentbordets ordningsknappar bevarar Nej och noll genom sparande och omstart.",
    "Tömning behåller etikett och datatyp; separat borttagning och objekttypbyte påverkar endast avsedda uppgifter."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/object-properties-http.test.ts",
      "title": "ordered independent properties survive draft, atomic receipt and SQLite restart without label side effects",
      "purpose": "Verifierar mer än 100 egenskaper, alla datatyper, tomt med och utan datatyp, tom text, historik, identiteter och frånvaro av etikettstyrda bieffekter genom publik HTTP."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-work.test.ts",
      "title": "MCP allocates property identities and edits, clears, removes and orders the returned identities",
      "purpose": "Verifierar samma ordning, separata identiteter, rättelse och tömning genom den gemensamma MCP-ingången."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/property-editor.test.tsx",
      "title": "invalid number input retains raw text and blocks the parent form from staging accepted old values",
      "purpose": "Chromium verifierar att redigerarens ogiltiga råtext blockerar hela objektformuläret, behåller övriga uppgifter och skyddas av varningen när formuläret lämnas. Styrd formulärbekräftelse ersätter inte SQLite-underlaget."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/property-editor.test.tsx",
      "title": "keyboard ordering and separate clear/delete actions preserve identities, focus and announced positions at 320px",
      "purpose": "Verifierar tangentbordets ordning, fokus, status, separat tömning och borttagning samt skillnaden mellan tomt, tom text, noll och Nej i den gemensamma redigeraren."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/property-editor.test.tsx",
      "title": "new blank labels block staging and deleting the last row returns focus to add without altering existing form work",
      "purpose": "Verifierar etikettfel och återfokus när sista egenskapen tas bort utan att objektets övriga formulärarbete påverkas."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Nytt objekt**, ange **Egenskapscykeln** som namn och öppna
   **Fria egenskaper**. Välj **Lägg till egenskap**. Kontrollera fokus på
   **Etikett**.
2. Ange etiketten **Pris**, datatypen **Text** och värdet **Gratis idag**.
   Byt datatyp till **Tal** och välj **Lägg i utkastet och stäng**.
   Kontrollera felsammanfattning, bevarad text och att inget läggs i utkastet.
3. Rätta värdet till **0**. Lägg till en andra egenskap med etiketten
   **Pris**, datatypen **Ja/nej** och värdet **Nej**.
4. Fokusera den andra egenskapens **Flytta upp** och tryck Enter.
   Kontrollera ordningsbeskedet och fokus på den flyttade postens etikett.
   Lägg till **Beskrivning** som Text med **Egen anteckning**, **Slutdatum**
   som Datum med **2000-01-01**, **Tomt tal** som Tal utan värde och
   **Tomt utan datatyp** utan datatyp eller värde. Lägg i utkastet och stäng.
5. Öppna förslaget i utkastvyn. Kontrollera **Nej** före **0**,
   anteckningen, datumet och båda tomma egenskaperna.
   Stäng förslaget, spara hela utkastet, starta om servern med samma
   databas och ladda om sidan.
6. Öppna objektets redigering och **Fria egenskaper**. Kontrollera samma
   ordning och värden. Byt första egenskapens datatyp till **Tal** utan att
   ändra värdet. Försök lägga i utkastet och kontrollera felet. Tryck Escape,
   välj **Fortsätt redigera** och kontrollera att texten **false** finns kvar.
   Byt tillbaka till **Ja/nej** och välj första egenskapens **Töm värdet**.
   Kontrollera etiketten **Pris** och datatypen **Ja/nej**, med tomt värde.
7. Välj andra egenskapens **Ta bort egenskapen**. Öppna
   **Grunduppgifter**, byt objekttyp och lägg ändringen i utkastet.
   Öppna redigeringen igen och kontrollera den kvarvarande tomma egenskapen.

**Förväntat resultat:**

- Fel visas och får fokus utan att inmatning går förlorad.
- Upprepade etiketter behåller sina separata värden och den valda ordningen.
- Sparat och föreslaget innehåll är åtskilda. Omstart bevarar sparade värden.
- Tömning bevarar egenskapen; borttagning tar endast bort den valda posten.
  Objekttypbyte bevarar den kvarvarande egenskapen.

### EGENSKAP-02: samma redigering och omstart på mobil

**Syfte:** Utför samma fullständiga egenskapsarbete vid smal skärmbredd.

**Användare:** Den inloggade Skyttel-användaren.

**Förutsättningar:** Fönsterbredd 320 bildpunkter, höjd 900 bildpunkter.
Använd ett tomt syntetiskt hushåll och samma omstartsförberedelse som ovan.

**Automatiskt motsvarande test:**
[free-object-properties.spec.ts](../../tests/integration/free-object-properties.spec.ts),
EGENSKAP-02. Provet använder riktig server och SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/free-object-properties.spec.ts",
    "caseId": "EGENSKAP-02"
  },
  "reference": "Chromium, 320 × 900, syntetiskt hushåll; samma avgränsade fel och egenskaper som datorfallet.",
  "outcomes": [
    "Alla egenskapskontroller, fel och sparåtgärder kan användas vid smal skärmbredd.",
    "Ordning och Nej respektive noll bevaras genom utkast, sparande och omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:** Utför steg 1–7 i EGENSKAP-01 vid den angivna smala bredden.

**Förväntat resultat:** Samma innehåll och återfokus som i datorfallet.
Kontrollerna kan nås utan dragning och utan horisontell sidrullning.

Automatiska prov verifierar semantiska namn, tangentbordsordning,
fokus, fel, status och formulärarbete i Chromium. Verklig uppläsning med
skärmläsare, förstoring och fysisk mobilinmatning behöver fortfarande
mänsklig observation; dessa prov fastställer inte fullständig överensstämmelse.

**Tekniskt webbläsarunderlag:**
[property-editor.test.tsx](../../tests/browser/property-editor.test.tsx)
provar redigeraren i det verkliga objektformuläret med styrd
formulärbekräftelse. Ogiltiga tal, datum, ja/nej, text utan datatyp och
för lång text behåller råtexten och blockerar tillägg av gamla accepterade
värden. Provet kontrollerar också fokus och status vid ordning, etikettfel,
tömning och borttagning. Detta underlag använder ingen server;
beständighet verifieras separat genom integrations- och HTTP-proven ovan.

## Sambandets fria egenskaper

### EGENSKAP-03: redigera sambandets egenskaper vid 1440 bildpunkter

**Syfte:** Bevara sambandets upprepade etiketter, ordning och ändpunkter
vid typbyte, felrättelse, tömning, borttagning och samlat sparande.

**Användare:** Den inloggade Skyttel-användaren.

**Förutsättningar:** Fönsterbredd 1440 bildpunkter. Skapa objekten Alex
och Blå cykeln i ett nytt hushåll och lägg dem i ditt utkast. Behåll samma
databas vid omstart.

**Automatiskt motsvarande test:**
[free-relationship-properties.spec.ts](../../tests/integration/free-relationship-properties.spec.ts),
EGENSKAP-03. Provet använder formulär, HTTP och riktig SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/free-relationship-properties.spec.ts",
    "caseId": "EGENSKAP-03"
  },
  "reference": "Chromium, 1440 × 900. Ogiltigt tal efter datatypbyte skyddar råtext och övrigt utkast. Upprepade etiketter skyddar självständig redigering.",
  "outcomes": [
    "Fel fokuserar sammanfattningen, bevarar råtext och lämnar utkastet orört.",
    "Ordning, noll och Nej bevaras efter byte av sambandstyp, samlat sparande och omstart.",
    "Tömning behåller etikett och datatyp, borttagning tar bara avsedd post och ändpunkterna bevaras."
  ],
  "evidence": [
    {
      "kind": "technical", "runner": "vitest", "suite": "server",
      "spec": "tests/unit/server/relationship-properties-http.test.ts",
      "title": "relationship properties preserve ordered identities, empty values and type independence through atomic save, history and restart",
      "purpose": "Publik HTTP verifierar fler än 100 egenskaper, fyra datatyper, tomma tillstånd, stabila identiteter och historik utan etikettstyrd status."
    },
    {
      "kind": "technical", "runner": "vitest", "suite": "server",
      "spec": "tests/unit/server/assistant-work.test.ts",
      "title": "MCP allocates relationship property identities and preserves precise edits, empty values and ordering",
      "purpose": "Gemensam MCP-ingång verifierar identiteter, ordning, rättelse och tömning med bevarat övrigt utkast."
    },
    {
      "kind": "technical", "runner": "vitest", "suite": "browser",
      "spec": "tests/browser/relationship-properties.test.tsx",
      "title": "relationship invalid property input blocks staging, preserves dirty work and survives type changes at 320px",
      "purpose": "Chromium med styrd formulärbekräftelse verifierar fel, varning när formuläret lämnas, tangentbord, fokus och omflöde. Beständighet verifieras separat mot server."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell → Samband för Alex → Nytt samband**. Välj sambandstyp,
   Alex som **Från objekt** och Blå cykeln som **Till objekt**.
2. Välj **Lägg till egenskap**. Kontrollera fokus på **Etikett**. Ange
   Pris, välj Text och skriv Gratis idag. Byt till Tal och välj
   **Lägg i utkastet**. Kontrollera fokuserad felsammanfattning och
   bevarad text. Rätta värdet till 0.
3. Lägg till en andra egenskap med etiketten Pris, datatyp Ja/nej och
   värdet Nej. Fokusera **Flytta upp** och tryck Enter. Kontrollera
   meddelandet om position 1 och fokus på den flyttade etiketten.
4. Byt sambandstyp. Lägg i utkastet, stäng sambandet och spara hela
   utkastet. Starta om installationen och öppna **Samband för Alex**.
   Kontrollera att Nej och 0 visas. Öppna **Redigera samband** och
   kontrollera den valda typen och egenskapernas ordning.
5. Välj **Töm värdet** på första egenskapen. Kontrollera att etiketten
   och datatypen finns kvar. Ta bort andra egenskapen med
   **Ta bort egenskapen**. Lägg i utkastet, stäng och spara hela utkastet.
6. Läs sambandet igen. Kontrollera Tomt (Ja/nej), öppna redigering och
   kontrollera att endast första egenskapen finns kvar och båda
   ändpunkterna är oförändrade. Kontrollera att sidan inte kräver
   horisontell rullning.

**Förväntat resultat:**

- Felaktig inmatning finns kvar och hindrar att formuläret läggs i utkastet.
- Typbyte behåller uppgifter och ändpunkter. Ordning, noll och Nej består
  efter samlat sparande och omstart.
- Tömning och borttagning ger skilda, beständiga resultat.

### EGENSKAP-04: redigera sambandets egenskaper vid 320 bildpunkter

**Syfte:** Bevara sambandets upprepade etiketter, ordning och ändpunkter
vid typbyte, felrättelse, tömning, borttagning och samlat sparande.

**Användare:** Den inloggade Skyttel-användaren.

**Förutsättningar:** Fönsterbredd 320 bildpunkter. Skapa objekten Alex
och Blå cykeln i ett nytt hushåll och lägg dem i ditt utkast. Behåll samma
databas vid omstart.

**Automatiskt motsvarande test:**
[free-relationship-properties.spec.ts](../../tests/integration/free-relationship-properties.spec.ts),
EGENSKAP-04. Provet använder formulär, HTTP och riktig SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/free-relationship-properties.spec.ts",
    "caseId": "EGENSKAP-04"
  },
  "reference": "Chromium, 320 × 900. Ogiltigt tal efter datatypbyte skyddar råtext och övrigt utkast. Upprepade etiketter skyddar självständig redigering.",
  "outcomes": [
    "Fel fokuserar sammanfattningen, bevarar råtext och lämnar utkastet orört.",
    "Ordning, noll och Nej bevaras efter byte av sambandstyp, samlat sparande och omstart.",
    "Tömning behåller etikett och datatyp, borttagning tar bara avsedd post och ändpunkterna bevaras."
  ],
  "evidence": [
    {
      "kind": "technical", "runner": "vitest", "suite": "server",
      "spec": "tests/unit/server/relationship-properties-http.test.ts",
      "title": "relationship properties preserve ordered identities, empty values and type independence through atomic save, history and restart",
      "purpose": "Publik HTTP verifierar fler än 100 egenskaper, fyra datatyper, tomma tillstånd, stabila identiteter och historik utan etikettstyrd status."
    },
    {
      "kind": "technical", "runner": "vitest", "suite": "server",
      "spec": "tests/unit/server/assistant-work.test.ts",
      "title": "MCP allocates relationship property identities and preserves precise edits, empty values and ordering",
      "purpose": "Gemensam MCP-ingång verifierar identiteter, ordning, rättelse och tömning med bevarat övrigt utkast."
    },
    {
      "kind": "technical", "runner": "vitest", "suite": "browser",
      "spec": "tests/browser/relationship-properties.test.tsx",
      "title": "relationship invalid property input blocks staging, preserves dirty work and survives type changes at 320px",
      "purpose": "Chromium med styrd formulärbekräftelse verifierar fel, varning när formuläret lämnas, tangentbord, fokus och omflöde. Beständighet verifieras separat mot server."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell → Samband för Alex → Nytt samband**. Välj sambandstyp,
   Alex som **Från objekt** och Blå cykeln som **Till objekt**.
2. Välj **Lägg till egenskap**. Kontrollera fokus på **Etikett**. Ange
   Pris, välj Text och skriv Gratis idag. Byt till Tal och välj
   **Lägg i utkastet**. Kontrollera fokuserad felsammanfattning och
   bevarad text. Rätta värdet till 0.
3. Lägg till en andra egenskap med etiketten Pris, datatyp Ja/nej och
   värdet Nej. Fokusera **Flytta upp** och tryck Enter. Kontrollera
   meddelandet om position 1 och fokus på den flyttade etiketten.
4. Byt sambandstyp. Lägg i utkastet, stäng sambandet och spara hela
   utkastet. Starta om installationen och öppna **Samband för Alex**.
   Kontrollera att Nej och 0 visas. Öppna **Redigera samband** och
   kontrollera den valda typen och egenskapernas ordning.
5. Välj **Töm värdet** på första egenskapen. Kontrollera att etiketten
   och datatypen finns kvar. Ta bort andra egenskapen med
   **Ta bort egenskapen**. Lägg i utkastet, stäng och spara hela utkastet.
6. Läs sambandet igen. Kontrollera Tomt (Ja/nej), öppna redigering och
   kontrollera att endast första egenskapen finns kvar och båda
   ändpunkterna är oförändrade. Kontrollera att sidan inte kräver
   horisontell rullning.

**Förväntat resultat:**

- Felaktig inmatning finns kvar och hindrar att formuläret läggs i utkastet.
- Typbyte behåller uppgifter och ändpunkter. Ordning, noll och Nej består
  efter samlat sparande och omstart.
- Tömning och borttagning ger skilda, beständiga resultat.
