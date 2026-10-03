import { microphoneShortcut } from './use-microphone-press.js';

/** Help for the same conversation's voice and text controls. */
export function ConversationHelp() {
  return (
    <>
      <h3>Röst och text i samma samtal</h3>
      <p>
        Prata med Skyttel slår på och av mikrofonen. Skriv till Skyttel öppnar och stänger textvyn
        utan att avsluta samtalet. Röst och text är samma samtal, med samma privata utkast, och kan
        användas samtidigt. Med mikrofonen på får också skrivna meddelanden svar med rösten. Med
        mikrofonen av får de svar bara som text.
      </p>
      <p>
        Det du och Skyttel säger och skriver finns i samtalstexten, också när du öppnar textvyn
        senare. Skyttel kan höra och förstå fel, så samtalstexten kan innehålla fel. Kontrollera
        ändringarna i kartan och utkastet. Sparat och kvittot i Utkast och historik bekräftar vad
        som verkligen har sparats.
      </p>
      <h3>Håll in för att tala</h3>
      <p>
        Ett kort tryck på Prata med Skyttel växlar mikrofonen på och av. När mikrofonen är av och
        medgivandet gäller kan du hålla knappen längre än 0,45 sekunder för att tala tills du
        släpper. Släpp stänger av ny inspelning direkt; Skyttel arbetar med det sagda och talar
        klart. Ett systemavbrott räknas som att du släpper.
      </p>
      <p>
        Tal från starten kan vänta tillfälligt i webbläsaren och skickas när anslutningen är klar,
        även efter släpp. Avbryter du starten kasseras det väntande talet. Mikrofonen börjar lyssna
        först när medgivandet gäller och ljuduppspelningen fungerar. Utan giltigt medgivande visar
        både kort och långt tryck medgivanderutan.
      </p>
      <p>
        Tangentkombinationen på den här enheten är {microphoneShortcut()}. Den gör samma sak: tryck
        kort för att växla på och av, eller håll för att tala tills du släpper. Kort tryck räcker
        alltid, även med skärmläsare på pekskärm.
      </p>
      <h3>Uppgifter och medgivande</h3>
      <p>
        Med ditt medgivande behandlar OpenAI ljud som spelas in medan din mikrofon är på, det du
        skriver, hela ditt utkast och de uppgifter i hushållets karta som behövs. Skyttel föreslår
        ändringar i ditt utkast och sparar dem först när du ber om det. Skyttel sparar inte
        samtalet. Säg eller skriv inga lösenord, koder eller fullständiga konto- och kortnummer.
      </p>
      <p>
        Återkalla medgivandet i Inställningar, Samtal med Skyttel, under Medgivande. Välj Återkalla
        medgivandet och, om ett samtal pågår, Återkalla och avsluta samtalet. Dina samtal i
        hushållet avslutas på alla dina enheter, samtalstexten töms och utkastet ligger kvar. Ett
        redan påbörjat sparande slutförs. Återkallandet tar inte tillbaka uppgifter som OpenAI redan
        har fått.
      </p>
      <h3>Vad OpenAI kan behålla</h3>
      <p>
        Skyttel begär att OpenAI inte lagrar samtalet. OpenAI kan ändå behålla uppgifter tillfälligt
        för att driva tjänsten och uppgifter ur samtalet i loggar för att förebygga missbruk och
        uppfylla rättsliga krav. Det garanterar inte behandling enbart i EU eller omedelbar radering
        av alla kopior hos leverantören.
      </p>
      <a href="https://developers.openai.com/api/docs/guides/your-data">Läs OpenAI:s datavillkor</a>
      <h3>Arbeta med kartans formulär</h3>
      <p>
        Kartans formulär finns kvar som alternativ till samtalet, utan mikrofon eller
        samtalsmedgivande. Välj Lista för att läsa, lägga till och rätta objekt och samband. Alla
        förslag samlas i ditt privata utkast. Spara hela utkastet när du vill dela ändringarna med
        hushållet.
      </p>
      <p>
        Kartan kan också styras med tangentbord genom Navigera. Stäng arbetsytan för att återgå till
        kartan; din oskickade text finns kvar.
      </p>
    </>
  );
}
