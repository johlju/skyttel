import { conversationConsentText } from '../shared/conversation-consent.js';
import { FullMapLegend } from './MapLegend.js';
import { microphoneShortcut } from './use-microphone-press.js';

/** Help for the same conversation's voice and text controls. */
export function ConversationHelp() {
  return (
    <>
      <FullMapLegend />
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
        ändringarna i kartan och utkastet. Utkastet är sparat och kvittot under Rapporter,
        Ändringshistorik, bekräftar vad som verkligen har sparats.
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
      {conversationConsentText.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        Återkalla medgivandet i Inställningar, Samtal med Skyttel, under Medgivande. Välj Återkalla
        medgivandet och, om ett samtal pågår, Återkalla och avsluta samtalet. Dina samtal i
        hushållet avslutas på alla dina enheter, samtalstexten töms och utkastet ligger kvar. Ett
        redan påbörjat sparande slutförs. Återkallandet tar inte tillbaka uppgifter som OpenAI eller
        LangSmith redan har fått.
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
        samtalsmedgivande. Välj Tabell för att läsa, lägga till och rätta objekt och samband.
        Förslagen samlas i ditt utkast. Välj Skriv till Skyttel och Visa utkastet för att granska
        dem utan att starta ett samtal. Spara hela utkastet när du vill dela ändringarna med
        hushållet. Genomförda sparanden finns under Rapporter, Ändringshistorik.
      </p>
      <p>
        Kartan kan också styras med tangentbord genom Navigera. Stäng textvyn med krysset; ditt
        pågående samtal och oskickade samtalsmeddelande finns kvar även när du byter mellan Karta
        och Tabell.
      </p>
      <p>
        Ett ändrat formulär visar en förlustvarning när du lämnar det. Fortsätt redigera behåller
        formulärändringarna. Kasta ändringarna och fortsätt kastar bara de formulärändringar som
        inte lagts i utkastet. Redan lagda förslag och ditt oskickade samtalsmeddelande finns kvar.
      </p>
    </>
  );
}
