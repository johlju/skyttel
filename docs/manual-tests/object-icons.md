# Manuella testfall för objektikoner

Testfallen omfattar ikonval, sökning, bildens företräde, beständighet och
tangentbord i smala vyer. Anteckna commit, webbläsare och godkänt eller
underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i testhushållet och använder Google.

## Allmän förberedelse

1. Använd en isolerad installation med påhittade uppgifter. Följ
   [ingångarna till arbetsytorna](README.md#öppna-arbetsytor). Förbered en
   giltig PNG-bild enligt [bildfallen](profile-images.md#allmän-förberedelse).
2. Börja varje fall med ett nytt hushåll eller motsvarande återställt läge.
   Behåll inloggning och databas vid normal serveromstart.
3. Redigera genom **Tabell → Redigera [objektnamn]**. För separat sparande,
   öppna **Skriv till Skyttel → Visa utkastet**, välj utkastets sparikon och
   läs **Utkastet är sparat**. Stäng textvyn innan nästa tabell- eller kartsteg.

## Ikonval och visning

### IKON-01: Bevara ikon genom typbyte, bildval och omstart

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-01"
  },
  "reference": "1280×720; Fordon behåller ikon genom typbyte, bildföreträde, sparande och omstart.",
  "outcomes": [
    "Cykelval och text bevaras; profilbilden har företräde och standardikonen delas först efter sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevara ikon, text och bild i samma kompletta objektförslag.

**Användare:** Alex.

**Förutsättningar:** Hushållet saknar Min cykel. Ha en giltig PNG-bild.

**Integrationstest:**
[object-icons.spec.ts](../../tests/integration/object-icons.spec.ts),
testfallet “IKON-01: icon choice survives type and image changes, save and
restart before explicit reset”.

**Steg:**

1. Välj **Nytt objekt**. Skriv Min cykel och Bevara texten i Grunduppgifter.
   Öppna **Livscykel och utseende**, sök cykel och välj **Cykel**.
2. Öppna **Grunduppgifter**, byt typ till **Fordon** och återgå till
   **Livscykel och utseende**. Kontrollera ikonvalet. Välj PNG-bilden och
   kontrollera förklaringen att profilbilden visas före ikonen. Välj
   **Lägg i utkastet och stäng**. Kontrollera bilden i kartans symbol.
3. Redigera objektet. Öppna **Livscykel och utseende** och välj **Ta bort
   profilbilden ur formuläret**. Kontrollera att förklaringen nu anger
   ikonen som synlig. Lägg hela formuläret i utkastet och
   kontrollera cykelikonen i kartan.
4. Redigera beskrivningen till Bevara mer text, lägg hela formuläret i
   utkastet och spara hela utkastet separat. Starta om servern och ladda om.
5. Kontrollera ikon och beskrivning. Redigera, välj **Typens standardikon**
   och lägg hela formuläret i utkastet. Spara utkastet separat.

**Förväntat resultat:**

- Lokala ikon-, bild- och typval ändrar inga förslag före komplett tillägg.
- Bilden har företräde. Borttagningen återger Cykel. Typbytet behåller valet.
- Ikon och text finns kvar efter sparande och omstart. Standardvalet delas
  först efter komplett tillägg och separat sparande.

### IKON-02: Sök hela katalogen med tangentbord i smala teman

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-02"
  },
  "reference": "1440/390/320×900 i ljust och mörkt tema inom ett test; smala vyer skyddar omflöde och teman läsbara val.",
  "outcomes": [
    "Katalogsökning, tomma resultat, rensning och sidval behåller rätt fokus och nåbara kontroller."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Verifiera sökresultat, sidval, fokus och tillgängliga kontroller.

**Användare:** Alex.

**Förutsättningar:** Objektet Lo finns i det privata utkastet.

**Integrationstest:**
[object-icons.spec.ts](../../tests/integration/object-icons.spec.ts),
testfallet “IKON-02: full catalog search, empty results and keyboard
pagination work in narrow themes”.

**Steg:**

1. Redigera Lo och öppna **Livscykel och utseende**. Upprepa steg 2–4 vid 1440,
   390 och 320 CSS-pixlars bredd, 900px höjd, i ljust och mörkt
   systemtema. Smala vyer skyddar omflöde; båda teman skyddar läsbara val.
2. Sök telescope. Gå till valet med tangentbord och tryck Enter. Kontrollera
   markeringen. Sök ingen-symbol-xyz och läs beskedet.
3. Välj **Rensa sökningen**. Kontrollera fokus i sökfältet. Välj **Nästa** och
   kontrollera fokus på första ikonen. Välj **Föregående**.
4. Sök bike. Kontrollera att Cykel går att välja, att text och fokus syns
   och att kontrollerna ryms utan vågrät sidrullning.

**Förväntat resultat:**

- Ikonnamn och svenska benämningar går att söka genom hela katalogen.
- Tomma resultat erbjuder återgång. Tangentbord kan välja ikon och byta sida.
- Fokus stannar i arbetsflödet. Resultat och valt läge har tillgängliga namn.
- Smala vyer och båda teman behåller läsbara, åtkomliga kontroller.

### IKON-03: Nå ikonval och sparande i ett kort fönster

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-03"
  },
  "reference": "320×250; kort höjd skyddar ikonval, oskickad text och separat sparande.",
  "outcomes": [
    "Val, standardåtergång och sparande går att nå utan vågrät sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Verifiera att kort höjd inte gör formuläret oåtkomligt.

**Användare:** Alex.

**Förutsättningar:** Hushållet saknar Lilla cykeln. Använd ett fönster på
320 × 250 CSS-bildpunkter. Verklig zoom provas separat i IKON-06.

**Integrationstest:**
[object-icons.spec.ts](../../tests/integration/object-icons.spec.ts),
testfallet “IKON-03: a short viewport keeps icon controls, unsent text and
shared save reachable”.

**Steg:**

1. Välj **Nytt objekt**. Skriv Lilla cykeln och Min oskickade text.
2. Rulla till **Livscykel och utseende**. Sök cykel och välj **Cykel**.
3. Välj **Typens standardikon**. Kontrollera markeringen och att
   egenskapen Beskrivning i Fria egenskaper finns kvar.
4. Rulla till **Lägg i utkastet och stäng** och välj den. Spara hela
   utkastet separat. Kontrollera sparat namn, beskrivning och standardikon.

**Förväntat resultat:**

- Fält, ikonval, sidval och knappar går att nå genom att rulla. Ingen fast
  rubrik eller knapp täcker den kontroll som används.
- Oskickad text bevaras. Återgången till standard sparas med objektet.
- Innehållet kräver ingen vågrät sidrullning.

### IKON-04: Behåll tangentbordsfokus under lokalt ikonval

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-04"
  },
  "reference": "1280×720; lokala ikonval med tangentbord före komplett tillägg.",
  "outcomes": [
    "Vald knapp behåller fokus och först komplett tillägg skapar ett cykelikonförslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla fokus utan att lägga ett ofärdigt formulär i utkastet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll.

**Integrationstest:**
[object-icons.spec.ts](../../tests/integration/object-icons.spec.ts),
testfallet “IKON-04: local keyboard icon choice and reset preserve the chosen
focus until complete staging”.

**Steg:**

1. Välj **Nytt objekt**, skriv Lo och öppna **Livscykel och utseende**.
2. Sök cykel. Välj Cykel, Typens standardikon och Cykel igen med Enter.
   Kontrollera markering och fokus efter varje val.
3. Flytta fokus till **Sök ikon**. Kontrollera att fokus stannar där och
   att utkastet ännu saknar förslag.
4. Välj **Lägg i utkastet och stäng**. Granska objektförslaget.

**Förväntat resultat:**

- Lokala val lämnar fokus på använd knapp och bevarar ett senare fokusval.
- Först komplett tillägg skapar ett privat förslag med vald cykelikon.

### IKON-05: Bevara ikon och text vid avvisat eller okänt tillägg

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-05"
  },
  "reference": "1280×720; känd avvisning och tappat svar efter tillämpat komplett tillägg.",
  "outcomes": [
    "Ikon och text bevaras; kontrollen återhämtar ett förslag utan gemensam ändring."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återhämta ett komplett objektförslag utan dubbla tillägg.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll. Använd kontrollerade svar enligt
[KARTA-17 och KARTA-18](map.md#karta-17-spärra-väntande-tillägg-och-behåll-ett-avvisat-formulär).

**Integrationstest:**
[object-icons.spec.ts](../../tests/integration/object-icons.spec.ts),
testfallet “IKON-05: rejected and lost complete icon staging preserve the
local choice and recover one proposal”.

**Separat operatörsförberedelse:**

Följ KARTA-17:s befintliga kontroll för avslag och KARTA-18:s transport.
Efter inskickningen i UI-steg 2: invänta hållningen och kör
`releaseObjectStage()` i konsolen. Meddela **Avslaget är släppt**.
Inför nästa tillägg i steg 3: armera `stage:drop-after` och meddela
**Nästa verkliga tillägg får tappat svar**. Kräv faktiskt lyckat
genomförande separat innan användaren kontrollerar det okända utfallet.
Stäng konsolen inför tangentbordsprovet och återställ HTTPS-ingången
före `quit` enligt de befintliga förberedelserna.

**Steg:**

1. Välj **Nytt objekt**, skriv Lo och Bevarad ikontext. Öppna **Livscykel och
   utseende**, sök cykel och välj Cykel med Enter.
2. Be operatören förbereda avvisningen enligt KARTA-17 och invänta
   installationen. Aktivera **Lägg i utkastet och stäng** med Enter. Be
   operatören släppa samma avslag enligt förberedelsen och invänta bekräftelse.
   Vänta på det synliga avslaget och kontrollera text och ikonmarkering.
3. Be operatören förbereda nästa tappade svar enligt KARTA-18 och invänta
   bekräftelse före nästa tillägg. Försök igen och läs beskedet om okänt utfall.
   Kontrollera att vanligt tillägg är spärrat.
4. Fokusera **Kontrollera om ändringen lades i utkastet** och tryck Enter.
   Granska utkastet och historiken. Be operatören återställa HTTPS-ingången och
   avsluta transporten enligt förberedelsen. Invänta bekräftelse.

**Förväntat resultat:**

- Avvisat tillägg lämnar ikon och text kvar, utan något nytt förslag.
- Okänt utfall behåller ikonvalet och kräver kontroll före nytt försök.
- Bekräftad kontroll stänger formuläret och visar exakt ett privat
  objektförslag med text och cykelikon. Kartan och historiken är oförändrade.

## Mänsklig observation

Symbolernas verkliga utseende och fysisk inmatning observeras av människan.
Automationen använder namngivna val, valt tillstånd och DOM-symboler; den
fastställer inte att en människa känner igen teckningen som en cykel.

### IKON-06: Nå ikonval med fysisk inmatning och verklig zoom

**Syfte:** Kontrollera testdatorns verkliga 400-procentszoom.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll och ett datorfönster på ungefär
1280 × 1000 bildpunkter före zoom.

**Kräver mänsklig observation:** Ställ in 400 procent i webbläsarens
zoomreglage, använd datorns tangentbord och pekare, och kontrollera att
fokus och ikonval går att nå utan att minska zoom.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Använd fysiskt tangentbord och pekare vid verklig 400-procentszoom; nå ikonval och separat sparande."
  },
  "reference": "Datorfönster cirka 1280×1000 före 400 procent verklig zoom.",
  "outcomes": ["Ikonval och sparande är nåbara och den oskickade texten bevaras."],
  "evidence": [{
    "kind": "overlap", "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-03", "purpose": "Automatiskt kort CSS-fönster utan fysisk inmatning eller verklig zoom."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ in 400 procents zoom och utför IKON-03:s steg 1–4 med
   tangentbord och pekare. Rulla när det behövs.
2. Läs sparbekräftelsen och sparat namn, text och standardval.
3. Återställ zoom till 100 procent.

**Förväntat resultat:**

- Sökfält, ikonval och sparande är nåbara utan täckande rubrik eller
  sidfot. Texten finns kvar och objektet sparas med standardikon.

### IKON-07: Känn igen cykelikonen när profilbilden tas bort

**Syfte:** Skilja symbolens mänskligt igenkännbara utseende från dess namn.

**Användare:** Alex.

**Förutsättningar:** IKON-01:s nya hushåll och giltiga PNG-bild.

**Kräver mänsklig observation:** Titta på cykelteckningen i ikonväljaren
och i kartan efter bildborttagningen. Bedöm att den går att känna igen
som en cykel. DOM-symbolens identifierare och knappens namn bevisar inte
denna igenkänning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "visual-symbol-recognition",
    "observation": "Känn visuellt igen den valda cykelteckningen i kartan efter att profilbilden tagits bort."
  },
  "reference": "Datorvy 1280×720, ljust tema; verklig symboligenkänning.",
  "outcomes": ["Cykelns betydelse går att känna igen när ikonen åter blir synlig."],
  "evidence": [{
    "kind": "overlap", "spec": "tests/integration/object-icons.spec.ts",
    "caseId": "IKON-01", "purpose": "Automatisk ikonidentitet och bildens företräde, utan mänsklig symboligenkänning."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför IKON-01:s steg 1–3 en gång. Under steg 1, innan profilbilden
   läggs till, titta på det valda cykeltecknet i ikonväljaren.
2. Efter profilbildens borttagning, öppna kartan och hitta Min cykel.
   Jämför teckningen med ikonvalet och bedöm dess betydelse visuellt.

**Förväntat resultat:**

- Kartans teckning känns igen som cykel. Resultatet antecknas separat
  från automationens kontroll av vald ikon och bildens företräde.
