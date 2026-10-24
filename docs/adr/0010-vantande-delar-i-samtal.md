# Väntande delar har egen identitet i samtalet

Beslutet riktar sig till utvecklare som underhåller samtalets tillstånd,
verktyg och verifiering. Det beskriver ansvar och villkor för väntande
delar; faktisk språkförståelse kräver separat modellutvärdering.

En väntande del ska ha en stabil identitet som är skild från frågans
ordalydelse, så att omformuleringar inte skapar fler väntande delar.
Oberoende arbete ska kunna fortsätta medan användaren förtydligar en annan
del av sin begäran.

Samtalets sparande av hela utkastet ska invänta att begärda ändringar som
är oklara blir lösta eller uttryckligen återtagna av användaren.
En oberoende fråga som bara gäller läsning ska inte hindra ett giltigt
sparande. Att lösa en fråga ska inte återuppliva en upphävd sparbegäran.
Detta kompletterar beslutet om
[samlat sparande av utkast](0005-utkast-sparas-samlat.md).

Att stoppa pågående bearbetning ska bevara väntande delar och ändringar
som redan finns i utkastet, men upphäva en väntande sparbegäran.
Användaren ska uttryckligen återta en väntande del för att överge den;
ett stopp ska inte innebära att hela begäran överges.

Väntande delar ska följa samtalets livslängd. Sammanfattning, vanliga fel,
stängd textvy och byte mellan text och röst ska bevara dem. Nytt samtal,
omladdning, utloggning och serveromstart ska avsluta dem och ta bort deras
hinder för sparande; utkastets förslag och vanliga validering ska finnas
kvar. Detta bevarar gränsen mellan tillfälliga samtal och beständiga utkast.

Att kasta utkastet ska avsluta väntande ändringar och frågor som beror på
de kastade förslagen, men bevara oberoende begäranden om information.
Ett senare svar ska inte återskapa kastat arbete utan en ny begäran.
Ett tydligt återtagande ska avsluta endast berörd väntande del och behålla
redan genomförda ändringar. En tydlig ersättning ska avsluta den ersatta
delen och påbörja den nya. Vid oklar hänvisning ska Skyttel fråga vilken
del som avses; tystnad, ämnesbyte och ett svar om att användaren inte vet
ska inte räknas som återtagande.

Modellen ska tolka vilken del användaren besvarar eller återtar och ange
vilken användaruppgift tolkningen bygger på. Servern ska styra
tillståndsändringarna, avvisa okända identiteter och inaktuella resultat,
bevara övriga delar och kontrollera att nödvändiga ändringar lyckas innan
en del markeras som klar. Sparmedgivande ska kontrolleras separat.

Hindret från väntande ändringar ska gälla både samtalets sparverktyg och
manuellt sparande i webbläsaren som äger samtalet. Andra klienter och
externa assistenter ska behålla sina befintliga sparregler; tillfälliga
samtal ska inte införa ett globalt sparhinder. Alla sparvägar ska fortsatt
kontrollera utkastets vanliga villkor.

Innan en väntande del fortsätter efter andra klienters ändringar eller
sparande ska Skyttel kontrollera aktuellt utkast och sparade uppgifter.
Endast delar vars begärda resultat kan verifieras ska avslutas som klara.
Övriga delar ska bevaras, och ändringar som gör en begäran oklar ska leda
till en fråga. Ett verifierat kastat utkast ska avsluta berörda väntande
delar. Genomförda ändringar ska inte upprepas, och ett annat sparande ska
inte ge medgivande till ett nytt.

Befintliga text- och röstkontroller ska användas, med återtagande uttryckt
i vanligt språk. Nya eller ändrade frågor ska visas, en begäran att spara
ska få besked om blockerande delar och användaren ska kunna fråga vad som
återstår. Vänteläget ska vara synligt utan att alla gamla frågor upprepas
efter varje oberoende svar. En separat uppgiftspanel ingår inte.

## Utgångspunkt och avvägning

Textservern lämnar `pendingParts` med serverägda identiteter till modellen.
`questions` och `pendingQuestions` visar frågetext men styr inte avslut.
`ask_questions.updates` använder identitet, revision och aktuell
användaruppgift. Sparkvitton avslutar inte oberoende informationsfrågor.

Att bara behålla strängar ger varken säker omformulering eller tillräckligt
underlag för selektivt avslut. En beständig uppgiftslista skulle i stället
utöka produktens livslängd och krav på synkronisering. Valet är därför ett
strukturerat, tillfälligt tillstånd inom det befintliga samtalet, utan ny
uppgiftspanel eller beständig samtalshistorik.

## Tillstånd och ansvar

Varje väntande del ska innehålla följande underlag på servern:

- Ett serverägt `id`, en stigande `revision` och ursprungligt
  `messageId`. Identiteten återanvänds aldrig inom samtalet.
- `kind`: `change` för en begärd ändring eller `information` för läsning.
  En ändring blockerar sparande tills den är slutförd eller återtagen.
- Användarens begärda resultat, den kvarstående oklarheten och aktuell
  frågetext. Frågetexten får ändras utan att identiteten ändras.
- Referenser till berörda objekt, samband eller förslag när de är kända,
  samt om delen beror på utkastet. Okänt beroende behandlas försiktigt
  som utkastberoende tills aktuellt underlag visar annat.
- Bekräftade utförda operationer och återstående arbete, så att en delvis
  genomförd batch kan fortsätta utan att dess lyckade steg upprepas.
- Status: `waiting`, `ready`, `completed`, `withdrawn`, `superseded`
  eller `discarded`. `ready` betyder att förtydligandet är tillräckligt
  men att resultatet ännu inte är verifierat. En ändring i detta läge
  blockerar fortfarande sparande.

Modellen ska tolka naturligt språk och välja berörd identitet. Servern
ska kontrollera identitet, revision, tur, behörighet och faktiska
verktygsresultat. Servern kan inte bevisa den språkliga tolkningen genom
att enbart validera ett schema. Otydlig hänvisning ska därför ge en fråga,
och modellens tolkning ska kunna granskas mot aktuell användaruppgift.
Regler för enskilda testmeningar ska inte avgöra övergångar.

Avslutade delar behålls under samtalets livslängd,
så att återlevererade anrop inte återupplivar dem. Nya samtal får ny
identitet genom `contextRevision` och nya del-ID. Tillståndet ligger
utanför den text som sammanfattas och
bifogas på nytt inför varje modellomgång.

## Verktyg och övergångar

`ask_questions` och `submit_changes` ska använda samma kontrakt för
väntande delar. En ny del anger `kind`, begärt resultat, beroenden och
frågetext; servern returnerar dess identitet. Ett nytt anrop efter ett
förlorat verktygssvar ska återge samma skapade del genom kombinationen
av samtal, meddelande och verktygsanropets identitet.

Ändringar av befintliga delar ska ange `id`, förväntad `revision`,
åtgärd och evidens: aktuellt `messageId` med ett ordagrant utdrag ur
användarens meddelande. Servern tillför samtalets identitet och aktiva
tur från exekveringen; modellen får inte välja en äldre tur som auktoritet.
Utdraget ska finnas i den aktuella användartexten. Verktygssvar och
assistenttext ska inte räknas som användarens svar eller återtagande.

- `rephrase` ändrar frågan för samma del och ökar dess revision.
- `clarify` registrerar ett helt eller delvis svar. Kvarstående oklarhet
  behåller `waiting`; ett tillräckligt svar ger `ready`.
- `withdraw` avslutar endast angiven del efter ett uttryckligt
  återtagande. Redan utförda ändringar ligger kvar i utkastet.
- `replace` avslutar den ersatta delen och skapar ersättningen i samma
  validerade övergång. Omfattningen får inte ändras genom omformulering.
- Slutförande av `ready` görs av servern efter verifierat resultat,
  inte genom ett fritt `completed`-påstående från modellen.

En ändring ska koppla sina återstående operationer till delens identitet.
Servern markerar delen som klar först när dessa operationer lyckas och
aktuellt utkast visar deras avsedda resultat. Vid fel bevaras lyckade
steg och delen förblir ofärdig. Ett nytt försök ska först läsa aktuellt
underlag och endast utföra återstående steg. För en informationsdel
krävs att den begärda läsningen lyckas och att svaret registreras för
leverans i samtalet; ett förtydligande ensamt är inte ett färdigt svar.

När resultatet redan finns kan `clarify.expected` ange konkreta värden
för identifierade objekt, samband eller typer. Servern jämför värdena
med aktuellt utkast eller sparade uppgifter före avslut. Modellen
ansvarar fortfarande för att välja resultatet som motsvarar begäran;
fältjämförelsen bevisar inte att den språkliga tolkningen är riktig.
För informationsdelar registrerar `clarify.answer` svaret för leverans.

Servern ska validera samtliga tillståndsändringar i ett anrop före
mutation. En okänd, avslutad eller inaktuell identitet avvisar anropet
utan att påverka andra delar. En återleverans med samma anropsidentitet
återger sitt registrerade resultat. Två olika frågor får ha samma
ordalydelse; deduplicering ska använda identitet, inte textlikhet.

`submit_changes` ska registrera nya väntande delar innan dess operationer
körs, så att ett senare batchfel inte tappar bort olösta delar. Oberoende
operationer får fortsätta även när andra delar väntar. Ett svar på en
del får varken avsluta en annan del eller återställa sparmedgivande.

## Sparande och andra klienter

Samtalets `prepare_save`, `save_draft` och
`submit_changes` med `completion: save` ska använda samma kontroll av
ofärdiga ändringsdelar. Kontrollen ska göras efter aktuella läsningar
och före registrering av sparförsöket. Även serverns fortsatta sparande
i `beginMessage`, som anropar sparverktygen efter `run`, ska omfattas.
Ett blockerat försök ska ange
vilka delar som återstår och upphäva dess sparbegäran. En senare lösning
kräver en ny uttrycklig sparbegäran; denna får finnas i samma meddelande
som lösningen. Vanliga identitets-, konflikt- och versionsvillkor gäller
fortfarande. En väntande informationsdel får finnas kvar efter sparande.

Manuellt sparande ska förmedla den öppna konversationens identitet från
klienten. Servern ska kontrollera att den tillhör samma inloggning,
hushåll och ägande klient, och kontrollera dess ofärdiga ändringar i
samma kritiska förlopp som sparförsöket registreras. Ett gammalt eller
felaktigt angivet samtal ska ge omläsning eller fel, inte en väg runt
kontrollen. UI-spärren ska spegla serverns besked. Klienter utan detta
samtal och externa MCP-klienter följer sina befintliga sparregler;
samtalsidentiteten utgör inte ett nytt globalt behörighetskrav.

Vid ändrad utkastversion ska servern läsa om utkast, relevanta sparade
uppgifter och sparoperationer innan delen fortsätter. Ett tomt utkast
eller en ny version bevisar inte att begäran är uppfylld eller kastad.
Verifierade resultat kan avsluta berörda delar; annat arbete ska bevaras
eller få en ny fråga. För att skilja kastande från sparande ska den
gemensamma utkastmutationen meddela aktiva samtal om ett lyckat kastande,
med ägare, hushåll, innehållsversion och berörd utkastversion. Detta
gäller även kastande via andra klienter och MCP. Meddelandet behövs bara
i processen: serveromstart avslutar redan alla samtal.

## Livscykel och presentation

Stopp, tidsgräns och vanliga fel ska avbryta turens fortsättning och
upphäva dess sparbegäran. De ska bevara väntande delar och bekräftade
operationer. Ett registrerat sparförsök ska fortfarande återhämtas via
dess kvitto; stopp får inte påstå att genomfört sparande är ogjort.
Kastande ska avsluta ändringsdelar och beroende informationsdelar först
när kastandet är verifierat. Ett misslyckat kastande ska bevara dem.
Kastande utan nytt samtal ska bevara oberoende informationsdelar.

Nytt samtal, omladdning, utloggning, behörighetsförlust, serveromstart
och samtalets utgång ska avsluta tillståndet. Sammanfattning och stängd
textvy ska bevara det. Ett byte av inmatningssätt använder samma tillstånd.

Text och röst ska få en gemensam serverbild med delarnas identiteter och
revisioner. `questionPending` ska härledas från delar som väntar på svar;
sparhindret ska härledas separat från ofärdiga ändringar. Frågetext i
`questions` kan behållas som presentation, men får inte styra identitet.
Nya och omformulerade frågor ska levereras en gång. Oberoende svar ska
inte automatiskt få hela den kvarvarande frågelistan tillagd.

En köad tur ska läsa aktuell delstatus när den börjar. Modellsvar ska
kontrolleras mot aktiv tur och varje berörd dels revision efter varje
väntan. Röstens ankare ska dessutom identifiera samtalet och den fråga
som var aktuell när talet samlades in. En oförändrad fråga ska inte få
en ny gräns för insamlat tal enbart för att en oberoende tur är klar.
Automatiska och delegerade röstsvar ska bära dessa delreferenser genom
mottagning och köstart. Ett inaktuellt svar ska lämna nyare arbete orört.
Sent ljud eller svar från ett ersatt samtal ska ignoreras. Återlevererade
slutbesked får visas enligt befintliga leveransregler men ska aldrig
skriva tillbaka gammalt tillstånd.

## Sammanhängande förändringsgränser

1. Samla tillstånd och övergångar i `src/server/pending-parts.ts`.
   Koppla den till `text-assistant.ts` och de gemensamma vytyperna i
   `src/shared/text-assistant.ts`. Ersätt textmatchningen i båda
   frågekällorna. Klar när omformulering, partiellt svar, återtagande
   och ersättning behåller rätt identiteter genom oberoende turer.
2. Koppla operationernas verifierade resultat, avbrott, sammanfattning,
   återhämtning och kastande till samma övergångar. Klar när ett fel
   efter en lyckad operation kan fortsätta utan dubbelt arbete och när
   ett sent svar aldrig avslutar en ny eller ersatt del.
3. Koppla gemensam sparkontroll till samtalsverktygen och den manuella
   sparvägen i `map-routes.ts`, `use-household-work.ts` och
   `HouseholdMap.tsx`. Anslut signalen från gemensamt kastande och
   verifiera andra klienters ändringar. Klar när alla berörda sparvägar
   skiljer ändringshinder från informationsfrågor och gammalt medgivande.
4. Uppdatera `voice-work.ts`, samtalets presentation och
   `assistant-instructions.ts` tillsammans med verktygskontraktet.
   Använd `writing-for-agents` för modellinstruktionerna. Klar när
   text och röst kan svara på samma kvarvarande del efter en mellantur
   utan upprepade gamla frågor eller tillstånd från gamla resultat.
5. Synkronisera manuella fall och automatiska motsvarigheter i samma
   beteendeändring. Kontrollera berörd användarvägledning om samtal och
   utkast. Leverera delarna tillsammans; en övergång där gamla strängar
   och nya identiteter konkurrerar om sparhindret ingår inte i planen.

## Verifiering av implementationen

Testgränserna är samtalets publika HTTP-gräns med riktig databas
och kontrollerad modell, samt webbläsarens text- och röstflöden genom
publika kontroller. Tekniska
fel- och kapplöpningsfall hör till server- eller webbläsartester;
integrationstester ska ha motsvarande manuellt användarflöde.

- Utöka `tests/unit/server/text-assistant.test.ts` för båda frågekällorna,
  flera samtidiga delar, identiska frågetexter med olika identiteter,
  omformulering, partiella och oklara svar, återtagande och ersättning.
  Prova alla tre sparvägarna, inklusive ett direkt sparanrop från
  modellen medan en ändringsdel återstår, samt serverns fortsatta sparande
  i `beginMessage` när en förtydligad ändring ännu inte är klar.
  Kontrollera att ett svar eller
  en oberoende tur aldrig ensamt ger nytt sparmedgivande.
- Prova sena resultat, köade meddelanden, återleverans, avbruten batch,
  sammanfattning, kastande och samtalets avslut via publika servergränser.
  Inkludera externt sparande, verifierat externt kastande och att en
  vanlig extern ändring inte kan misstolkas som något av dessa.
- Utöka frågeflöden i `tests/integration/conversation-questions.spec.ts`
  och motsvarande område `docs/manual-tests/conversation-questions.md`.
  Skydda oberoende arbete följt av selektivt svar, återtagande och nytt
  sparande. Prova även manuell sparning med blockerande ändring och
  tillåten sparning medan en oberoende informationsfråga väntar.
- Täck växling mellan text och röst samt kö och stopp i befintliga
  samtalsområden. Använd kontrollerade leverantörer för reproducerbara
  övergångar. Dessa tester verifierar serverns regler och presentation,
  inte en verklig modells förståelse av varierande språk.

Kör typkontroll och berörda enskilda testfiler under implementationen.
Kör `npm run check` och välj berörda integrationstester med
`select-integration-tests` efter sista ändringen. Bedöm resultaten med
samma färdighet innan arbetet rapporteras som verifierat. Riktiga modell-
och röstkörningar kräver separat uttrycklig auktorisering för betalda
API-anrop. Funktionens språkförståelse och verkliga ljudleverans ska
redovisas som overifierade tills sådana prov faktiskt genomförs.
