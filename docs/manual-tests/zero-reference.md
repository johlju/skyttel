# Manuella testfall för nollreferens

Testfallen omfattar nollreferensens val, gemensamma reglage och personliga
beständighet. Anteckna commit, webbläsare, enhet och resultat vid körning.
Automationen provar kontrollernas tillstånd och sparade val. Faktisk
uppläsning och fysisk pekning kräver separata mänskliga observationer.

## Konfigurerade användare

Alex Exempel har tillgång till Linden och Eken. Robin Exempel har egen
tillgång till Linden i en separat webbläsarprofil. Alex har två profiler
eller enheter för kontroll av beständighet. Använd bara påhittade uppgifter.

## Allmän förberedelse

1. Starta en isolerad installation enligt
   [utvecklingsguiden](../development/devcontainer.md#disposable-local-database).
2. För NOLLREFERENS-01 räcker ett nytt hushåll med Alex. För
   NOLLREFERENS-02: följ
   [offlineförberedelsen för två hushåll](../development/testing.md#offline-map-fixtures).
   Låt Robin vara installationens administratör som skapar Linden och låt
   Alex vara den andra verifierade identiteten utan medlemskap. Kör
   förberedelsens `second-household` för Alex; återstarta sedan samma
   installation och bjud in Alex till Linden. Öppna hushållens fullständiga
   adresser uttryckligen. Alex har då tillgång till Linden och Eken.
   Börja varje fall med oförändrade personliga visningsval.
3. Öppna Inställningar → Rymdkartan → Bakgrund. Ingen objektflytt behövs
   för förberedelsen eller dessa testfall.

## Inställningar och beständighet

### NOLLREFERENS-01: val och gemensamma reglage genom navigering och återställning

**Syfte:** Kontrollera alla behållna val, separat bakgrund och samma
synlighetsval i Inställningar och Navigera.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll. Börja med normal datorbredd och
systemtema. Prova sedan 390 × 844 CSS-pixlar.

**Automatiskt motsvarande test:**
[zero-reference-settings.spec.ts](../../tests/integration/zero-reference-settings.spec.ts),
NOLLREFERENS-01. Chromium använder riktig serverlagring. Provet bedömer
reglage och val utan att hävda verifierad grafisk återgivning.

**Ytterligare underlag:** Det kontrollerade Chromium-provet
[personal-view.test.tsx](../../tests/browser/personal-view.test.tsx),
`tint retains values through delayed and failed saves`,
prövar fördröjt svar, misslyckat sparande och reglagens bevarade värde.
Det ersätter inte beständighetsprovet mot riktig server.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/zero-reference-settings.spec.ts",
    "caseId": "NOLLREFERENS-01"
  },
  "reference": "Tolv kombinationer, båda teman, dator och 390 × 844.",
  "outcomes": [
    "Förvalen är Cirkel, Diskret, båda synlighetsval av och 0 procent.",
    "Alla varianter och styrkor kan väljas med dekorativ bakgrund av.",
    "Inställningar och Navigera visar samma sparade synlighetsval.",
    "Nollreferens har synlig etikett i miniläge på liten skärm.",
    "Kamera- och rörelseåterställning behåller nollreferensens val.",
    "Tangentbordsfokus behålls efter sparande.",
    "Tonstyrkans talfält och reglage visar samma värde i enprocentsteg.",
    "Linjer inaktiverar båda tonreglagen med förklaring och behåller värdet.",
    "Synlig vid dragning behålls inaktivt med läsbar hjälp vid Alltid synlig."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/personal-view.test.tsx",
      "title": "tint retains values through delayed and failed saves",
      "purpose": "Kontrollerat fördröjt svar och sparfel utan grafiska påståenden."
    }
  ]
}
```
-->

**Steg:**

1. Läs förvalen Cirkel, Diskret, Alltid synlig av, Synlig vid dragning av
   och Tonstyrka 0 procent. Stäng av Visa bakgrund. Kontrollera att
   Nollreferens fortfarande går att ändra.
   Läs hjälpen om dragning, flyttknappar, koordinater och musens primära
   knapp i 1,5 sekunder. Aktivera Synlig vid dragning med mellanslag,
   invänta sparandet och kontrollera att fokus är kvar.
2. Skriv 37 i **Tonstyrka i procent** och läs samma värde i reglaget.
   Lämna talfältet, invänta sparbekräftelsen och fokusera **Tonstyrka**.
   Tryck högerpil en gång. Läs 38 i båda reglagen och invänta sparandet.
3. Prova Kvadrat, Oval, Cirkel och Linjer med Diskret, Ursprunglig och
   Framträdande. Upprepa med ljust och mörkt systemtema. Läs det sparade
   valet och kontrollera att fokus stannar på väljaren. Tonstyrka är 38
   procent hela tiden. Linjer gör båda tonreglagen inaktiva och visar
   förklaringen att värdet finns kvar. Planvarianterna aktiverar dem igen.
4. Lämna Linjer och Framträdande valda. Aktivera Alltid synlig. Läs att
   Synlig vid dragning är inaktivt med markerat val och förklaring om att
   valet finns kvar. Återgå till
   kartan och öppna Navigera. Kontrollera att Nollreferens är markerad.
   Panorera höger och välj Återställ vy. Reglaget är fortfarande markerat.
5. Välj Visa mininavigering och byt till den smala bredden. Läs den synliga
   etiketten Nollreferens. Fokusera reglaget och avmarkera med mellanslag.
   Kontrollera att fokus är kvar. Återgå till normal navigering och stäng.
6. Öppna inställningarna igen. Alltid synlig är av och Synlig vid dragning
   är aktivt och markerat. Linjer och Framträdande finns kvar och
   Tonstyrka är 38 procent. Slå på Visa bakgrund, ändra
   Zoomstyrka och välj Återställ rörelse. Kontrollera att Synlig vid
   dragning och Tonstyrka är kvar.

**Förväntat resultat:** Båda ytorna visar samma val. Bakgrundens av/på,
miniläge, skärmbredd och återställning ändrar inte referensens övriga val.

### NOLLREFERENS-02: egna val följer med mellan enheter och hålls åtskilda

**Syfte:** Kontrollera beständig lagring utan att dela val mellan
användare eller hushåll.

**Användare:** Alex i två profiler och Robin i en egen profil.

**Förutsättningar:** Nya hushåll Linden och Eken. Robin har tillgång till
Linden. Båda börjar med referensens förval.

**Automatiskt motsvarande test:**
[zero-reference-settings.spec.ts](../../tests/integration/zero-reference-settings.spec.ts),
NOLLREFERENS-02. Separata Chromium-kontexter och omstart provar riktig
serverlagring; de ersätter inte mänsklig observation på fysiska enheter.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/zero-reference-settings.spec.ts",
    "caseId": "NOLLREFERENS-02"
  },
  "reference": "Alex i två profiler, Robin i en; två hushåll och omstart.",
  "outcomes": [
    "Alex återfår de fem egna referensvalen efter omstart.",
    "En annan enhet med Alex visar samma val i Linden.",
    "Robin har egna förval och kan ändra dem utan att ändra Alex val.",
    "Alex val i Eken är separata från Linden."
  ]
}
```
-->

**Steg:**

1. Välj Oval, Ursprunglig och Synlig vid dragning som Alex i Linden.
   Aktivera sedan Alltid synlig. Vänta på sparbekräftelsen efter varje val.
   Ange sedan Tonstyrka 23 procent, lämna talfältet och invänta sparandet. Gå till
   kartan och öppna inställningarna igen.
2. Starta om provinstallationen och ladda om sidan. Läs samma fem val.
   Synlig vid dragning är markerat men inaktivt med läsbar förklaring.
   Logga in som Alex på den andra enheten och läs valen i Linden.
3. Öppna Linden som Robin. Kontrollera Cirkel, Diskret, Alltid synlig
   av, Synlig vid dragning av och Tonstyrka 0 procent. Välj Kvadrat och
   vänta på sparbekräftelsen. Ladda om Alex vy: de fem egna valen är kvar.
4. Öppna Eken som Alex. Kontrollera Cirkel, Diskret, Alltid synlig av,
   Synlig vid dragning av och Tonstyrka 0 procent. Återgå till Linden och
   läs de sparade egna valen igen.

**Förväntat resultat:** Valen sparas per Skyttel-användare och hushåll och
återkommer över återbesök, webbläsarsessioner, omstart och enheter.

### NOLLREFERENS-03: faktisk uppläsning och fysisk kontroll i båda teman

**Syfte:** Bedöma reglagens faktiska tillgänglighet utöver automationen.

**Användare:** Alex.

**Förutsättningar:** Följ
[förberedelsen för fysiska enheter](workspace-preparation.md#fysiska-enheter-och-egen-provdata).
Använd skärmläsare på dator och en fysisk telefon med samma provhushåll.

**Kräver mänsklig observation:** Hör reglagens namn, värden, markerade och
inaktiva tillstånd med faktisk skärmläsare. Prova fysisk pekning och
förstoring i ljust och mörkt tema. Anteckna utrustning och resultat.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör namn, värden och tillstånd i båda navigeringslägena."
  },
  "reference": "Skärmläsare och fysisk telefon; båda teman och lägen.",
  "outcomes": [
    "Kontrollernas namn, värden och markerade tillstånd går att förstå.",
    "Fokus, kontrast, omflöde och pekmål medger att valen ändras.",
    "Reglagens etiketter kräver inte att användaren skiljer färger åt.",
    "Automatisk visning är tyst, behåller fokus och bevarar fysisk pekning och koordinatåtkomst."
  ]
}
```
-->

**Steg:**

1. Utför valen i NOLLREFERENS-01 med tangentbord och faktisk skärmläsare.
   Läs gruppnamnet, hjälptexten och varje aktuellt värde och tillstånd.
2. Prova samma val med fysisk pekning och med förstoring i båda teman.
   Läs hela etiketten Nollreferens i båda navigeringslägena.
3. Ändra Tonstyrka med tangentbord och fysisk pekning. Hör det aktuella
   procentvärdet, förklaringen och inaktiveringen för Linjer. Prova 0 och
   85 procent med planvarianterna i båda teman och bakgrunderna av och på.
   Välj objekt och samband, läs deras text och kontrollera att symboler,
   markering och fokus fortfarande går att använda. Använd de namngivna
   koordinaterna för att förstå positionen utan att urskilja färger.
4. Slå av Alltid synlig och på Synlig vid dragning. Dra ett objekt med
   mus eller penna och sedan med finger på en fysisk telefon. Referensen
   visas under draget och en sekund efter släpp; nästa drag behåller den
   synlig. Ett vanligt klick och kamerarörelser startar inte visningen.
   Håll musens primära knapp stilla över objektet i 1,5 sekunder och
   släpp: referensen döljs efter en sekund. Samma håll på tom karta visar
   den inte. Långtryck med finger öppnar fortfarande objektets åtgärder.
5. Med faktisk skärmläsare: flytta med Navigeras knappar och giltiga
   koordinater. Hör flyttresultatet, men inget extra besked när referensen
   visas eller döljs. Fokus är kvar och koordinaterna går att läsa.
   Ofärdig inmatning förlänger inte visningen. Börja dra och växla till en
   annan app så att gesten avbryts. Återgå och byt till Tabell och tillbaka:
   automatisk visning börjar dold. Alltid synlig
   behåller sitt val också vid avbrott. Prova båda navigeringslägena.
6. Anteckna synligt fokus, kontrast, omflöde och eventuella hinder.

**Förväntat resultat:** Användaren kan förstå och ändra samma personliga
val utan att urskilja färger eller använda visuell navigering i kartan.
