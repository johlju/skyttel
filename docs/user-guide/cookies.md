# Kakor och lagring

[Till användarguidens innehåll](README.md)

Öppna **Kakor och lagring** längst ned på inloggningssidan. Du behöver
inte logga in för att läsa sidan eller öppna `/cookies` direkt.
Informationen vid första besöket kan stängas med **Stäng informationen**.
Stängningen gäller bara medan appen är öppen. Varken stängningen eller
fortsatt användning registrerar något aktivt lagringsval.

När du är inloggad öppnar du profilikonen, **Din profil**, och väljer
**Kakor och lagring** under **Ditt konto**. Välj **Tillbaka till kartan**
för att återgå till ditt arbete. Även du som ännu saknar ett hushåll kan
nå sidan genom **Din profil**.

Under **Nödvändig lagring** kan du öppna **Visa nödvändig lagring** och
läsa namn, plats, innehåll, ändamål och tider. Den lagringen behövs för
funktioner du begär, till exempel säker inloggning och återhämtning av en
import eller permanent radering. Den har inget avstängningsreglage.
Rensa inte flikens återhämtningsuppgifter om du behöver kontrollera en
pågående åtgärd.

Under **Uppgifter på Skyttels server** öppnar du
**Visa serverns lagringsposter** för namn, innehåll och gallring av
inloggningsuppgifter, resultatkontroll och installationens säkerhetsgeneration.
Tillfällig samtalstext och transportstatus i arbetsminnet beskrivs separat
från kakor och fliklagring. En transportkvittens bevisar inte att du har
läst eller hört svaret.

**Ihågkommen inloggning** är valfri och gäller den aktuella
webbläsarbindningen. Markera **Kom ihåg mig** innan du fortsätter till
Google eller Microsoft för högst sju dygn från inloggningen. Valet börjar
avmarkerat vid varje ny inloggning. Vanlig inloggning gäller högst åtta
timmar. Ingen av tiderna förlängs vid läsning eller återbesök.
På lagringssidan kan du läsa den versionsbundna informationen och valflödet.
En sessionskaka garanterar inte att du loggas ut när
du stänger ett fönster: webbläsaren kan återställa sessionen. Logga ut på
en delad dator.

Stäng av **Ihågkommen inloggning** på lagringssidan och välj
**Spara inställningar**. Snabbåtgärden **Stäng av ihågkommen inloggning**
ändrar bara formuläret. **Ångra ändring** återgår till det senast
bekräftade valet. Om du lämnar osparade ändringar får du välja mellan att
fortsätta redigera och att kasta ändringarna. Servern avslutar den gamla
nyckeln och äldre
påbörjade inloggnings- och kontokopplingsförsök i samma bindning. Dina
andra webbläsare och redan kopplade konton påverkas inte. Återstående
session gäller längst till det tidigare slutet eller åtta timmar från
avstängningen, med 30 minuters inaktivitet. Upprepad avstängning
förlänger inte tiden. Ny aktivering kräver ny inloggning och ett nytt
aktivt **Kom ihåg mig**-val.

**Återställ valfri lagring** öppnar en separat bekräftelse innan någon
ändring begärs. Återställningen stänger av ihågkommen inloggning i den
aktuella webbläsarbindningen genom samma säkra avstängning som sparknappen.
Kontots tema, personliga vyer, hushållets information och samtalsmedgivande
bevaras. Flikens återhämtningsuppgifter för import och permanent radering
med osäkert utfall bevaras också. **Avbryt** lämnar både formuläret och
servervalet oförändrade. Andra webbläsarbindningar påverkas inte.

**Ihågkommen inloggning är avstängd.** bekräftar serverändringen.
**Du är fortfarande inloggad.** visas bara efter en separat kontroll av
den nya inloggningsnyckeln. Annars visas **Logga in igen för att fortsätta.**
Avstängningen gäller även om ett sent svar lämnar en gammal beständig
kaka i webbläsaren; kakan ger ingen återställd åtkomst.

Vid **Ändringen kunde inte sparas. Försök igen.** ligger ditt begärda
val kvar som osparat. **Sparstatus okänd** betyder att svaret förloras
och att ändringen kan vara genomförd. Valet ligger kvar utan besked om
att det tidigare valet fortfarande gäller. Sidan skickar inget nytt
sparande automatiskt och erbjuder inget nytt sparande medan utfallet
är okänt.

Flikar med samma bekräftade webbläsarbindning delar aktuell inloggning.
Den första lyckade nya inloggningen ersätter den tidigare och avslutar
andra redan påbörjade försök. En misslyckad inloggning byter inte användare.
Utloggning avslutar inloggningen och pågående försök i bindningen; andra
enheter och webbläsare påverkas inte. Ett sent svar kan lämna en gammal
kaka i webbläsaren. Den återställer ingen avslutad åtkomst och kan kräva
att du loggar in igen.

Sidan skiljer webbläsarens kakor och fliklagring från serveruppgifter och
säkerhetskopior. En utgången kaka eller avslutad behörighet betyder inte
att alla serverkopior är fysiskt raderade. Beslutade gallringsfrister ska
inte läsas som redan verifierade driftfakta.

Programmet gallrar vid serverstart och varje minut medan tjänsten körs,
även utan besök. Avslutade sessioner och förbrukade eller utgångna
inloggningsförsök ska försvinna inom 24 timmar från avslut respektive
förbrukning eller utgång. Minimala spärruppgifter får bara finnas tills
de berörda försöken och nycklarna är ogiltiga, högst sju dygn från
återkallelse eller utloggning och högst ytterligare 24 timmar för gallring.
Fristerna är tak och startar inte om vid serveromstart. Resultatfönstrets
24 timmar räknas från ändringen. För säkerhetskopior gäller högst 30 dygn
från den ursprungliga kopieringen; faktisk radering kräver separat
driftkontroll.

Google och Microsoft styr lagringen på sina egna webbplatser.
**Samtalsmedgivande** till OpenAI är ett separat val under
**Samtal med Skyttel**; information om kakor ger inget sådant medgivande.

## Kontrollera en okänd sparstatus

Välj **Kontrollera igen** vid **Sparstatus okänd**. Kontrollen läser
resultatet av samma åtgärd och skickar inget nytt sparande. Om kontrollen
kräver det, logga in igen som samma användare i samma flik och återgå till
**Kakor och lagring**. Det ursprungliga resultatet går att kontrollera
under 24 timmar från ändringen, även efter en serveromstart.

Fliken behåller en referens till den begärda åtgärden i `sessionStorage`.
Referensen ger ingen åtkomst och är ingen kopia av ditt lagringsval.
Den tas bort när resultatet blir känt. Rensa inte fliklagringen innan du
har kontrollerat resultatet. Om uppgifterna försvinner kan fliken inte
identifiera den tidigare åtgärden; Skyttel gissar inte utfallet och
upprepar inte sparandet. När fliken inte kan spara referensen stoppas
ändringen innan den skickas. Kontrollera webbläsarens lagringsinställningar
och försök sedan spara igen.

Ett saknat eller utgånget resultat betyder att utfallet fortfarande är
okänt. Ett nätverksfel bevisar varken avvisning eller återställning.
Inget nytt sparande erbjuds medan det tidigare utfallet är okänt.

Efter ny inloggning gäller resultatet fortfarande den tidigare begäran.
Det ändrar inte ett nytt aktivt **Kom ihåg mig**-val. Sidan hämtar det
aktuella valet separat och skiljer det från resultatet av din gamla åtgärd.
