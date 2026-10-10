// Real content migrated from Shopify, verbatim. Shopify's legacy Page.body was empty for
// several of these -- the live theme actually stores real content in page-specific JSON
// section templates (same architecture as the homepage). Extracted from
// data/exports/pages.jsonl and data/exports/theme/templates/page.*.json.
//
// Flagged items requiring your decision (left verbatim, NOT silently corrected):
// - Integritetspolicy (anvandarvillkor) body references "popiq.se" instead of jawhara.se --
//   almost certainly a leftover from whatever privacy-policy template this was built from.
// - Köpvillkor's "BYTE" section has a mailto:support@jawhara.se link whose VISIBLE text reads
//   "support@jawharalondon.com" -- a different, unrelated address.
// - "jawhara-luxury-jewelry-landing-page" (unlinked from any menu, English copy, fabricated
//   "As Seen In VOGUE/Harper's Bazaar" press mentions and a testimonial) was NOT migrated --
//   it reads as placeholder/demo content from a page-builder app, not real approved copy.

export type HtmlPageContent = { type: "html"; title: string; bodyHtml: string };
export type FaqPageContent = { type: "faq"; title: string; items: { q: string; a: string }[] };
export type ContactPageContent = { type: "contact"; title: string; intro: string; emailNote: string };

export type PageContent = HtmlPageContent | FaqPageContent | ContactPageContent;

export const PAGES: Record<string, PageContent> = {
  "om-oss": {
    type: "html",
    title: "Om oss",
    bodyHtml: `
<p>Välkommen till Jawhara – en värld där tidlös elegans möter modern förfining. Namnet <em>Jawhara</em>, som betyder <strong>juvel</strong> på arabiska, bär på en djup symbolik: något sällsynt, värdefullt och bestående. Det är denna filosofi som genomsyrar varje detalj av vårt varumärke.</p>
<p>Jawhara föddes ur en vision att göra sofistikerad design tillgänglig utan att kompromissa med kvalitet eller känsla. Varje smycke är noggrant utvalt för att spegla en balans mellan klassisk skönhet och samtida uttryck – skapade för att bäras, älskas och bevaras över tid.</p>
<p>Vår kollektion omfattar:</p>
<p>- Äkta silversmycken med 14k och 18k guldplätering – skapade för att ge en känsla av diskret lyx och varaktig elegans<br></p>
<p>- Smycken i rostfritt stål med exklusiv guldplätering – designade för att förena hållbarhet med ett förfinat uttryck</p>
<p>Vi tror att sann lyx inte enbart handlar om pris, utan om känslan ett smycke förmedlar. Det handlar om detaljerna, hantverket och hur det får bäraren att känna sig – självsäker, elegant och unik.</p>
<p>Varje Jawhara-smycke är mer än en accessoar. Det är en subtil signatur, ett uttryck för identitet och en påminnelse om livets mest betydelsefulla ögonblick.</p>
<p><strong>Jawhara – där varje juvel bär en historia av elegans.</strong></p>`,
  },

  aterbetalningspolicy: {
    type: "html",
    title: "Köpvillkor",
    bodyHtml: `
<p>Dessa köpvillkor gäller för dina köp på, och din användning av, webbsidan <a href="/">www.jawhara.se.</a></p>
<p>Villkoren utgör ett avtal mellan dig och JAWHARA. Genom att göra köp från och använda denna webbplats förbinder du dig till nedanstående villkor.</p>
<h4>BEKRÄFTELSE</h4>
<p>När vi har tagit emot en beställning från dig kommer vi att skicka en orderbekräftelse till den angivna e-postadressen som bekräftelse på ditt köp. Det är därför viktigt att du skriver in rätt e-postadress när du gör en beställning.</p>
<p>Vi rekommenderar att du sparar bekräftelsen för att underlätta eventuell framtida kontakt med vår kundtjänst. Bekräftelsen utgör också ditt kvitto på att du har lagt en order och därmed har en betalningsförbindelse uppstått.</p>
<h4>FRAKT OCH LEVERANS</h4>
<h5>LEVERANSTID</h5>
<p>Jawhara behandlar beställningen så snart som möjligt efter lagd order. Hanteringstiden är 2–5 arbetsdagar och leveranstiden är 5–10 arbetsdagar.</p>
<p>Beroende på leveransalternativ kan det ta olika lång tid att erhålla beställningen. JAWHARA kan inte garantera exakt leveranstid eftersom eventuella förseningar hos speditörer är en faktor vi inte kan påverka. Läs mer under Force Majeure.</p>
<h4>FÖRSÄNDELSE OCH ANSVAR</h4>
<p>Om de beställda varorna mot förmodan inte kommer fram, vänligen kontakta oss via e-post på <a href="mailto:support@jawhara.se">support@jawhara.se</a>, så försöker vi hjälpa dig att söka försändelsen.</p>
<p>Reklamation av skadat emballage, felaktig vara eller utebliven leverans måste anmälas till JAWHARA inom 7 dagar efter att varorna mottagits.</p>
<p>Det är alltid kundens ansvar att adress och användardata är uppdaterade och korrekta. Var noggrann med att både för- och efternamn, adress med gata samt lägenhets- eller husnummer stämmer överens med vad som står angivet på din brevlåda eller ditt brevinkast.</p>
<p>JAWHARA ansvarar inte för leveranser där uppgifterna visar sig vara felaktiga. Vid händelse av detta kan vi komma att kontakta dig för eventuell ersättning gällande ytterligare fraktkostnad.</p>
<h4>GARANTI</h4>
<p>Våra produkter är tillverkade för att leva upp till JAWHARA höga kvalitetskrav. Tidsfristen för en enskild produktgaranti varierar beroende på produkttyp.</p>
<p>JAWHARA lagerförda produkter har 2 månaders garanti från och med inköpsdatum. När en produkt returneras inom perioden för vilken garantin är giltig kommer denna att repareras eller bytas ut mot en ny vara av JAWHARA, utan extra kostnad.</p>
<p>Om du har en vara som omfattas av garantin kan du kontakta vår kundservice genom att maila oss på <a href="mailto:support@jawhara.se">support@jawhara.se</a> för att gå vidare med ärendet.</p>
<p>JAWHARA tillförsäkrar kunden att produkten håller lämplig standard för användbarhet, pålitlighet och hållbarhet.</p>
<p>JAWHARA-garantin täcker inte:</p>
<p>Defekter och skador på grund av förlust, stöld, brand, vatten eller naturkatastrof. Kontakt med vatten bör undvikas.</p>
<p>Fel eller skador som orsakats av felaktig användning, slarv, slag, bucklor, krosskador, slitageskador, repor eller olyckor.</p>
<p>Fel eller skador som orsakats av obehörig reparation eller modifiering av tredje part, utan medgivande från JAWHARA.</p>
<p>Estetiska förändringar, defekter och skador på grund av normalt slitage och åldrande, till exempel mindre repor, missfärgning av materialet eller repor på ytan.</p>
<p>Om du har frågor angående garanti kan du alltid kontakta vår kundsupport på <a href="mailto:support@jawhara.se">support@jawhara.se</a>.</p>
<h4>OUPPHÄMTADE FÖRSÄNDELSER</h4>
<p>Om beställning skett till ombud är du ansvarig för att hämta ut paketet hos angivet ombud. När försändelsen når angivet utlämningsställe skickas en avisering via sms, app eller post.</p>
<p>Om du inte hämtar ut försändelsen innan angivet sista datum blir du debiterad för omkostnader gällande returfrakt till oss samt administrativa kostnader som detta medför.</p>
<p>Debiteringen för ej uthämtad försändelse är 49 kr. Beloppet dras från återbetalningen på ordern.</p>
<h4>BYTEN OCH RETURER</h4>
<h5>ÖPPET KÖP</h5>
<p>JAWHARA erbjuder 14 dagars öppet köp.</p>
<p>Full återbetalning gäller under förutsättning att produkten är oanvänd och i nyskick. Om produkten är använd eller har hanterats i större omfattning än vad som varit nödvändigt för att fastställa dess egenskaper eller funktion, förbehåller sig JAWHARA rätten att besluta om värdeminskningsavdrag för produkten.</p>
<p>Om du valt Klarna eller annan extern part som betalmetod är det ditt ansvar att informera dem i samband med att du gör en retur. JAWHARA ansvarar inte för eventuella påminnelseavgifter kopplade till externa betalparter.</p>
<h4>VILLKOR FÖR KÖP 3 BETALA FÖR 2</h4>
<p>Vid retur av köp gjorda med erbjudandet "Köp 3 produkter, betala för 2" gäller följande:</p>
<p>Den fria produkten är alltid den med lägst pris. Vid retur av den fria produkten sker ingen återbetalning, eftersom vi aldrig har debiterat för denna produkt.</p>
<p>Om du istället returnerar en produkt du har betalat för men väljer att behålla den fria produkten, debiterar vi dig för den fria produkten. Detta innebär att vi endast återbetalar mellanskillnaden mellan den fria produkten och den produkt du returnerat till oss.</p>
<h4>HUR EN RETUR ELLER ETT BYTE GÅR TILL</h4>
<h5>RETUR</h5>
<p>Vänligen maila oss för returanvisningar.</p>
<p>Packa produkterna varsamt och returnera dem i en försändelse som håller för postgången.</p>
<p>Observera att kunden står för returkostnaden på 49 kr, vilken dras av från återbetalningsbeloppet.</p>
<h5>BYTE</h5>
<p>Om du istället önskar byta din produkt är du varmt välkommen att kontakta oss, så ordnar vi bytet åt dig. Observera att fria byten endast gäller smycken.<br><br>Maila oss på: </p>
<p><a href="mailto:support@jawhara.se">support@jawharalondon.com</a>. </p>
<h4>UTNYTTJANDE AV ÖPPET KÖP</h4>
<p>Om det finns rimliga skäl att misstänka att en kund missbrukar möjligheten till öppet köp på ett ohållbart sätt, har JAWHARA rätt att avbryta pågående beställningar och/eller pausa kunden från framtida köp.</p>
<p>Observera att detta endast gäller fall där beteendet är systematiskt och kan därmed inte tillämpas på slumpmässiga eller enskilda fall.</p>
<p>Exempel på sådana fall är återförsäljning av beställda produkter, ohållbart och överdrivet köpbeteende eller misstanke om bedrägeri.</p>
<h4>REKLAMATION</h4>
<p>För att starta ett reklamationsärende, vänligen kontakta vår kundsupport på <a href="mailto:support@jawhara.se">support@jawhara.se</a> för vidare instruktioner.</p>
<h4>RETURKOSTNAD</h4>
<p>Vid retur tar vi ut en returavgift på 49 SEK.</p>
<h4>RETURBEKRÄFTELSE</h4>
<p>Du kommer att få en returbekräftelse via mail så snart vi har behandlat din retur.</p>
<p>Vår behandlingstid är normalt 2–5 arbetsdagar efter att vi har fått tillbaka försändelsen. I högsäsong kan förseningar förekomma.</p>
<h4>ÅTERBETALNING AV RETURNERADE VAROR</h4>
<p>Beroende på betalmetod hanteras återbetalning olika, men så snart returen behandlats kommer återbetalning att ske om du redan har betalat för varorna.</p>
<p>Om du har använt Klarna som betalmetod behöver du kontakta Klarna och förlänga datumet eller frysa fakturan för att inte riskera påminnelseavgift. JAWHARA ansvarar inte för eventuella påminnelseavgifter.</p>
<p>Om du har betalat med kort, bank eller PayPal kommer du att få en återbetalning på returbeloppet så snart din retur är behandlad.</p>
<p>Har du fler frågor eller funderingar kring din retur är du välkommen att kontakta oss på <a href="mailto:support@jawhara.se">support@jawhara.se</a>.</p>
<h4>COOKIES</h4>
<p>JAWHARA använder cookies för att förbättra utseendet på vår hemsida, vårt produktutbud samt vår service till dig som kund.</p>
<p>Denna information används för att mäta trafik, köpflöde samt vad du som kund ser i vår butik.</p>
<p>Om du inte önskar tillåta att sidor sparar cookies kan du ändra detta i din webbläsares inställningar.</p>
<h4>FÖRBEHÅLL</h4>
<p>JAWHARA förbehåller sig rätten att utan vidare motivering häva en beställning.</p>
<p>JAWHARA reserverar sig för måttavvikelser på samtliga produkter med upp till 10 %. Om det står "bredd ca 10 mm" innebär detta att felmarginalen är 1 mm.</p>
<p>JAWHARA reserverar sig för eventuella bild- och skrivfel på sidan, såsom fel i beskrivning, teknisk specifikation, priser samt prisjusteringar.</p>
<p>JAWHARA förbehåller sig rätten att häva ett köp vid visande av felaktigt pris.</p>
<h4>FORCE MAJEURE</h4>
<p>JAWHARA ska vara befriat från skadestånd och andra påföljder om fullgörelsen av avtalet hindras, försvåras eller försenas av någon omständighet utanför vår kontroll.</p>
<p>Såsom befriande omständigheter anses bland annat myndighetsingripande, ny eller ändrad lagstiftning, uteblivna tillstånd, krig, brand, översvämning, arbetsmarknadsstörningar, förbud, restriktioner, sabotage, ogynnsamma transport- eller väderleksförhållanden eller uteblivna leveranser från underleverantörer samt om bolaget utsätts för kriminell aktivitet som påverkar verksamheten.</p>
<h4>KUNDTJÄNST</h4>
<p>Mail: <a href="mailto:support@jawhara.se">support@jawhara.se</a></p>`,
  },

  anvandarvillkor: {
    // Shopify Page title is "Integritetspolicy"; the page template's own H1 is hardcoded
    // "Användarvillkor"; the villkor menu labels it "Användarvillkor" too. Content is
    // unambiguously a GDPR privacy policy -- using "Integritetspolicy" as the real title.
    type: "html",
    title: "Integritetspolicy",
    bodyHtml: `
<p>Denna integritetspolicy beskriver hur JAWHARA (webbplatsen, vi) samlar in, använder och delar dina personuppgifter vid dina besök, när du använder våra tjänster eller köper från popiq.se (webbplatsen) eller på annat sätt kommunicerar med oss angående webbplatsen (tillsammans kallade tjänsterna). Användningen av du/dina (mfl.) i den här integritetspolicyn avser dig som användare av tjänsterna, oavsett om du är kund, webbplatsbesökare eller annan person som vi har samlat in uppgifter om enligt denna integritetspolicy.</p>
<p>Vi rekommenderar att du läser denna integritetspolicy noggrant.</p>
<h4>Ändringar av denna integritetspolicy</h4>
<p>Vi kan emellanåt uppdatera denna integritetspolicy, till exempel för att den ska överensstämma med nya rutiner eller på grund av andra driftmässiga, juridiska eller lagstiftningsmässiga skäl. Den reviderade integritetspolicyn kommer att publiceras på webbplatsen, vilket framgår av angivet datum vid "Senast uppdaterad", samt vidta eventuella andra åtgärder som krävs enligt tillämplig lag.</p>
<h4>Hur vi samlar in och använder personuppgifter</h4>
<p>För att tillhandahålla tjänsterna samlar vi in dina personuppgifter från en mängd olika källor enligt nedanstående beskrivning. Vilka uppgifter vi samlar in och använder varierar beroende på hur du interagerar med oss.</p>
<p>Utöver de specifika ändamål som anges nedan kan vi använda de uppgifter vi samlat in om dig för att kommunicera med dig, tillhandahålla eller förbättra tjänsterna, uppfylla eventuella tillämpliga lagkrav, genomdriva eventuella tillämpliga användarvillkor för tjänsten samt för att skydda tjänsterna, våra rättigheter samt våra användares och andras rättigheter.</p>
<h4>Vilka personuppgifter vi samlar in</h4>
<p>Vilka typer av personuppgifter vi samlar in om dig beror på hur du interagerar med vår webbplats och använder våra tjänster. När vi använder termen personuppgifter avser vi information som identifierar dig, rör dig, beskriver dig eller som på något sätt kan kopplas till dig. Avsnitten nedan beskriver de kategorier och specifika typer av personuppgifter vi samlar in.</p>
<h4>Uppgifter vi samlar in direkt från dig</h4>
<p>Uppgifter som du själv skickar till oss via våra tjänster kan innefatta:</p>
<ul>
<li><strong>Kontaktuppgifter</strong> till exempel namn, adress, telefonnummer och e-postadress.</li>
<li><strong>Orderinformation</strong> till exempel namn, faktureringsadress, leveransadress, betalningsbekräftelse, e-postadress och telefonnummer.</li>
<li><strong>Kontoinformation</strong> till exempel användarnamn, lösenord, säkerhetsfrågor och annan information som används för att skydda ditt konto.</li>
<li><strong>Kundsupportinformation</strong> Till exempel information du väljer att dela med dig av när du kommunicerar med oss, som när du skickar ett meddelande via tjänsterna.</li>
</ul>
<p>Vissa funktioner i tjänsterna kan kräva att du direkt ger oss viss information om dig själv. Du kan välja att inte dela med dig sådan information, men det kan i så fall bli omöjligt för dig att använda eller få tillgång till dessa funktioner.</p>
<h4>Information vi samlar in om din användning</h4>
<p>Vi kan också automatiskt samla in viss information om din interaktion med tjänsterna (<strong>användningsdata</strong>). För detta ändamål kan vi använda cookies, pixlar och liknande tekniker (<strong>cookies</strong>). Användningsdata kan innehålla information om hur du kommer åt och använder vår webbplats och ditt konto, inklusive uppgifter om din enhet, webbläsare, nätverksanslutning, IP-adress och annan information om din interaktion med tjänsterna.</p>
<h4>Information vi får från tredje part</h4>
<p>Vi kan till sist också erhålla information om dig från tredje part, inklusive från leverantörer och tjänsteleverantörer som kan samla in information för vår räkning, till exempel:</p>
<ul>
<li>Företag som stödjer vår webbplats och våra tjänster, till exempel Shopify.</li>
<li>Våra betalningsbehandlare som samlar in betalningsinformation (t.ex. uppgifter om bankkonto, kredit- eller betalkort, faktureringsadress) i syfte att behandla din betalning för att kunna distribuera dina beställningar och leverera de produkter eller tjänster som du har efterfrågat, för att kunna fullgöra vårt kontrakt med dig.</li>
<li>När du besöker vår webbplats, öppnar eller klickar på e-postmeddelanden som vi skickar till dig eller interagerar med våra tjänster eller annonser kan vi eller tredje part som vi samarbetar med automatiskt samla in viss information med hjälp av onlinespårningstekniker som t.ex. pixlar, webb-beacons, SDK:er, tredjepartsbibliotek och cookies.</li>
</ul>
<p>All information vi får från tredje part kommer att behandlas i enlighet med denna integritetspolicy. Se även avsnittet nedan, <i>Webbplatser som tillhör tredje part och länkar.</i></p>
<h4>Hur vi använder dina personuppgifter</h4>
<ul>
<li><strong>Tillhandahålla produkter och tjänster.</strong> Vi använder dina personuppgifter för att tillhandahålla dig tjänsterna för att kunna fullgöra vårt kontrakt med dig, inklusive för att behandla dina betalningar, distribuera dina beställningar, för att skicka meddelanden till dig relaterade till ditt konto, dina inköp, returer, byten eller andra transaktioner, för att skapa, underhålla och på annat sätt hantera ditt konto, för att ordna frakt, underlätta eventuella returer och byten och andra funktioner och funktioner relaterade till ditt konto. Vi kan också förbättra din shoppingupplevelse genom att göra det möjligt för Shopify att matcha ditt konto med andra Shopify-tjänster som du kan välja att använda. I så fall kommer Shopify att behandla dina uppgifter enligt sin integritetspolicy och konsumentskyddspolicy.</li>
<li><strong>Marknadsföring och annonsering.</strong> Vi kan använda dina personuppgifter för marknadsförings- och reklamändamål, till exempel för att skicka marknadsföring, annonser och reklamkommunikation via e-post, sms eller vanlig post, och för att visa dig annonser för produkter eller tjänster. Detta kan inkludera att använda dina personuppgifter för att på ett bättre sätt kunna skräddarsy tjänsterna och annonseringen på vår webbplats och andra webbplatser. Om du är bosatt i EES är den rättsliga grunden för denna behandling av personuppgifter vårt berättigade intresse av att sälja våra produkter, enligt artikel 6 punkt 1f i GDPR.</li>
<li><strong>Säkerhet och förebyggande av bedrägerier.</strong> Vi använder dina personuppgifter för att identifiera, undersöka eller vidta åtgärder avseende eventuell bedräglig, olaglig eller skadlig aktivitet. Om du väljer att använda tjänsterna och registrera ett konto är du ansvarig för att dina inloggningsuppgifter är säkra. Vi rekommenderar starkt att du inte delar ditt användarnamn, lösenord eller annan åtkomstinformation med någon annan. Om du tror att ditt konto har äventyrats, kontakta oss omedelbart. Om du är bosatt i EES är den rättsliga grunden för denna behandling av personuppgifter vårt berättigade intresse av att hålla vår webbplats säker för såväl dig som andra kunder, enligt artikel 6 punkt 1f i GDPR.</li>
<li><strong>Kommunicera med dig och förbättra tjänsten.</strong> Vi använder dina personuppgifter för att erbjuda dig kundsupport och förbättra våra tjänster. Detta är ett berättigat intresse för oss för att vi ska kunna vara lyhörda för dig, för att tillhandahålla dig effektiva tjänster och för att upprätthålla vår affärsrelation med dig enligt artikel 6 punkt 1f i GDPR.</li>
</ul>
<h4>Cookies</h4>
<p>Liksom många andra använder vi cookies på vår webbplats. För närmare information om de cookies som vi använder för att driva vår butik med Shopify, se <a href="https://www.shopify.com/legal/cookies" target="_blank">https://www.shopify.com/legal/cookies</a>. Vi använder cookies för att driva och förbättra vår webbplats och våra tjänster (inklusive för att spara information om din aktivitet och dina inställningar), för att genomföra analyser och få bättre förståelse för hur användare interagerar med tjänsterna (som berör vårt berättigade intresse att administrera, förbättra och optimera tjänsterna). Vi kan också tillåta att tredje part och tjänsteleverantörer använder cookies på vår webbplats för att på ett bättre sätt kunna skräddarsy tjänsterna, produkterna och reklamen på vår webbplats och andra webbplatser.</p>
<p>Att acceptera cookies automatiskt är standard i de flesta webbläsare, men du kan själv ändra inställningarna i din webbläsare så att cookies tas bort eller avvisas. Tänk på att din upplevelse kan påverkas negativt om du tar bort eller blockerar cookies, och dessutom kan vissa tjänster, till exempel vissa funktioner och allmän funktionalitet, sluta att fungera helt eller delvis. Det kan dessutom vara så att blockering av cookies inte helt förhindrar vår informationsdelning med tredje part, till exempel våra annonspartners.</p>
<h4>Hur vi lämnar ut personuppgifter</h4>
<p>Under vissa omständigheter kan vi komma att överlämna dina personuppgifter till tredje part i syfte att fullgöra kontrakt, för berättigade ändamål och andra skäl som omfattas av denna integritetspolicy. Några exempel på sådana omständigheter:</p>
<ul>
<li>Uppgifter kan delges leverantörer eller andra tredje parter som utför tjänster för vår räkning (t.ex. IT-förvaltning, betalningshantering, dataanalys, kundsupport, molnlagring, distribution och leverans).</li>
<li>Uppgifter kan delges företags- och marknadsföringspartners för att kunna leverera tjänster och reklam till dig. Våra affärs- och marknadsföringspartners kommer att använda dina uppgifter i enlighet med deras sekretessmeddelanden.</li>
<li>När du själv begär eller på annat sätt samtycker till att vi överlämnar vissa uppgifter till tredje part, till exempel för att leverera produkter till dig eller när du använder widgetar på sociala medier eller inloggningsbaserade integreringar, kan vi också komma att dela med oss av dina uppgifter.</li>
<li>Uppgifter kan delas med våra affiliates eller inom vår koncern som en del av våra berättigade intressen av att bedriva en framgångsrik verksamhet.</li>
<li>Uppgifter kan delas i samband med en affärshändelse, till exempel en fusion eller konkurs, i syfte att uppfylla tillämpliga rättsliga skyldigheter (till exempel som svar på förelägganden, beslut om husrannsakan), genomdriva tillämpliga användarvillkor och skydda och ta till vara tjänsterna, våra rättigheter samt våra användares och övriga personers rättigheter.</li>
</ul>
<p>Vi lämnar ut följande kategorier av personuppgifter och känslig personlig information om användare för syften som anges ovan i <i>"Så här samlar vi in och använder dina personuppgifter"</i> och <i>"Så här lämnar vi ut personuppgifter"</i>:</p>
<table>
<tbody>
<tr><th>Kategori</th><th>Mottagarkategorier</th></tr>
<tr>
<td>
<ul>
<li>Identifierare som t.ex. grundläggande kontaktuppgifter och viss order- och kontoinformation</li>
<li>Kommersiell information som t.ex. information om order, shopping och kundsupport</li>
<li>Internet- eller annan liknande nätverksaktivitet, t.ex. användningsdata</li>
<li>Geolokaliseringsdata, t.ex. platser som bestäms via en IP-adress eller andra tekniska metoder</li>
</ul>
</td>
<td>
<ul>
<li>Leverantörer och tredje parter som utför tjänster för vår räkning (t.ex. internetleverantörer, betalningsprocessorer, distributionspartners, kundsupportpartners och dataanalysleverantörer)</li>
<li>Affärs- och marknadföringspartners</li>
<li>Affiliates</li>
</ul>
</td>
</tr>
</tbody>
</table>
<p>Vi varken använder eller avslöjar känsliga personuppgifter utan ditt samtycke eller för att kunna dra slutsatser om dig.</p>
<p>Med ditt samtycke delar vi personuppgifter i syfte att genomföra reklam- och marknadsföringsaktiviteter enligt beskrivningen nedan.</p>
<h4>Webbplatser och länkar som tillhör tredje part</h4>
<p>Vår webbplats kan tillhandahålla länkar till webbplatser eller andra onlineplattformar som drivs av tredje part. Om du följer länkar till webbplatser som inte tillhör våra affiliates eller kontrolleras av oss, bör du läsa deras integritets- och säkerhetspolicyer och övriga regler och villkor. Vi garanterar inte och är inte ansvariga för integriteten eller säkerheten hos sådana webbplatser, inklusive huruvida informationen på dessa webbplatser är korrekt, fullständig och tillförlitlig. Information som du själv tillhandahåller på helt eller delvis allmänt tillgängliga platser, inklusive information som du delar på sociala nätverksplattformar tillhöriga tredje part, kan också ses av andra som använder tjänsterna och/eller de som använder dessa tredjepartsplattformar utan någon begränsning för hur den kan användas av oss eller tredje part. Enbart det faktum att vi inkluderar länkar av detta slag innebär inte att vi stödjer innehållet på sådana plattformar, och heller inte deras ägare eller verksamhet, utöver vad som uttryckligen klargörs i tjänsterna.</p>
<h4>Uppgifter rörande barn</h4>
<p>Tjänsterna är inte avsedda att användas av barn, och vi samlar inte medvetet in personuppgifter om barn. Om ett barn som du är vårdnadshavare till har överlämnat sina personuppgifter till oss kan du kontakta oss via kontaktuppgifterna nedan för att begära att de raderas.</p>
<p>Fram till det datum då denna integritetspolicy trädde i kraft känner vi inte till att vi har "delat" eller "sålt" (enligt de definitioner som används i tillämplig lagstiftning) personuppgifter avseende personer under 16 år.</p>
<h4>Säkerhet för och lagring av dina uppgifter</h4>
<p>Observera att inga säkerhetsåtgärder är perfekta eller omöjliga att kringgå, och att vi inte kan garantera att säkerheten är perfekt. Eventuell information som du skickar till oss kan dessutom sakna skydd under överföringen. Vi rekommenderar att du inte använder osäkra metoder för att skicka känslig eller konfidentiell information till oss.</p>
<p>Hur länge vi behåller dina personuppgifter beror på olika faktorer, till exempel om vi behöver dem för att hantera ditt konto, tillhandahålla tjänsterna, fullgöra rättsliga skyldigheter, lösa tvister eller genomdriva andra tillämpliga kontrakt och policyer.</p>
<h4>Dina rättigheter</h4>
<p>Beroende på var du bor kan du ha vissa eller samtliga rättigheter nedan gällande dina personuppgifter. Dessa rättigheter är dock inte absoluta, utan det är möjligt att de endast gäller under vissa omständigheter, och lagen medger att vi då kan neka din begäran.</p>
<ul>
<li><strong>Rätt till tillgång/kännedom</strong>: Du kan ha rätt att begära tillgång till de personuppgifter som vi har om dig, inklusive information om hur vi använder och delar din information.</li>
<li><strong>Rätt till radering</strong>: Du kan ha rätt att begära att vi raderar de personuppgifter vi innehar.</li>
<li><strong>Rätt till korrigering</strong>: Du kan ha rätt att begära att vi korrigerar de personuppgifter vi innehar om de är felaktiga.</li>
<li><strong>Rätt till portabilitet</strong>: Du kan under vissa omständigheter och med vissa undantag ha rätt att erhålla en kopia av de personuppgifter vi har om dig och att begära att vi överför dem till en tredje part.</li>
<li><strong>Rätt att välja bort försäljning, delning eller riktad annonsering</strong>: Du kan ha rätt att instruera oss att inte "sälja" eller "dela" dina personuppgifter eller att ange att dina personuppgifter inte får användas för ändamål som anses vara "riktad reklam", enligt definitionen i tillämpliga integritetslagar. Om du besöker vår webbplats med GPC-signalen aktiverad (beroende på var du befinner dig) kommer vi automatiskt att tolka detta som en begäran om att neka "försäljning" eller "delning" av uppgifter för den enhet och webbläsare du använder för att besöka webbplatsen.</li>
<li><strong>Begränsa behandling</strong>: Du kan ha rätt att begära att vi inte längre behandlar dina personuppgifter eller begränsar vår behandling av dem.</li>
<li><strong>Återkalla samtycke</strong>: I de fall då vi förlitar oss på samtycke för att kunna behandla dina personuppgifter kan du ha rätt att återkalla ditt samtycke.</li>
<li><strong>Överklagande</strong>: Om vi avslår din begäran kan du ha rätt att överklaga vårt beslut. Du kan göra det genom att svara på vårt meddelande om avslag.</li>
<li><strong>Hantera kommunikationsinställningar</strong>: Vi kan skicka e-post med reklam till dig, och du kan välja att inte längre få sådan e-post genom att använda funktionen för att avsluta prenumerationen som finns i alla våra meddelanden till dig. Om du väljer att inte längre ta emot sådan e-post kan vi ändå skicka meddelanden till dig som inte innehåller reklam, till exempel information om ditt konto eller dina beställningar.</li>
</ul>
<p>Du kan utöva dessa rättigheter där så anges på vår webbplats eller genom att kontakta oss via nedanstående kontaktuppgifter.</p>
<p>Din status hos oss påverkas inte av att du utövar dina rättigheter. Vi kan behöva samla in information från dig för att verifiera din identitet, till exempel din e-postadress eller kontoinformation, innan vi ger ett väl underbyggt svar på din begäran. Enligt tillämplig lagstiftning kan du utnämna en företrädare som kan framställa begäranden för din räkning för att utöva dina rättigheter. Innan vi godtar en sådan begäran från en representant måste denna representant förete bevis för att du har godkänt att de agerar för din räkning, och du kan också personligen behöva verifiera din identitet för oss. Vi kommer att besvara din begäran inom den tid som tillämplig lagstiftning specificerar.</p>
<h4>Klagomål</h4>
<p>Om du har klagomål på hur vi behandlar dina personuppgifter, kontakta oss med hjälp av kontaktuppgifterna nedan. Om du inte är nöjd med hur vi handlagt ditt klagomål kan du, beroende på var du bor, ha rätt att överklaga vårt beslut genom att kontakta oss med hjälp av kontaktuppgifterna nedan. Du kan också välja att skicka ditt klagomål till Integritetsskyddsmyndigheten (IMY). För EES kan du hitta en lista över ansvariga tillsynsmyndigheter för dataskydd <a href="https://edpb.europa.eu/about-edpb/about-edpb/members" target="_blank">här</a>.</p>
<h4>Internationella användare</h4>
<p>Observera att vi kan komma att överföra, lagra och behandla dina personuppgifter utanför det land där du bor. Dina personuppgifter behandlas också av personal och externa tjänsteleverantörer (tredje part) och partners i dessa länder.</p>
<p>Om vi överför dina personuppgifter ut ur Europa kommer vi att förlita oss på erkända överföringsmekanismer, till exempel Europeiska kommissionens standardavtalsklausuler, eller likvärdiga avtal från relevant behörig myndighet i Storbritannien (beroende på vad som är relevant) såvida inte dataöverföringen sker till ett land som bedömts säkerställer en adekvat skyddsnivå.</p>`,
  },

  ringstorlek: {
    type: "html",
    title: "Ringstorlek",
    bodyHtml: `
<table>
<thead><tr><th>Omkrets (mm)</th><th>US str (Våra Str.)</th><th>Diameter (mm)</th></tr></thead>
<tbody>
<tr><td>47</td><td>4</td><td>15</td></tr>
<tr><td>48</td><td>4.5</td><td>15.3</td></tr>
<tr><td>49</td><td>5</td><td>15.6</td></tr>
<tr><td>51</td><td>5.5</td><td>16.1</td></tr>
<tr><td>52</td><td>6</td><td>16.5</td></tr>
<tr><td>53</td><td>6.5</td><td>16.9</td></tr>
<tr><td>55</td><td>7</td><td>17.2</td></tr>
<tr><td>56</td><td>7.5</td><td>17.7</td></tr>
<tr><td>57</td><td>8</td><td>18.1</td></tr>
<tr><td>58</td><td>8.5</td><td>18.5</td></tr>
<tr><td>59</td><td>9</td><td>18.9</td></tr>
</tbody>
</table>`,
  },

  startsida: {
    type: "html",
    title: "Startsida",
    bodyHtml: `
<p style="text-align:center">Klicka nedan för att börja shoppa!</p>
<p style="text-align:center"><a href="/">Handla nu</a></p>`,
  },

  "vanliga-fragor": {
    type: "faq",
    title: "Vanliga frågor",
    items: [
      { q: "Vilken returpolicy gäller?", a: "Vi har 14 dagars öppet köp, no questions asked." },
      {
        q: "Har ni garanti på era smycken?",
        a: "Ja, alla våra smycken kommer med 60 dagars garanti för en trygg och säker köpupplevelse.",
      },
      {
        q: "Hur lång är leveranstiden?",
        a: "Leveranstiden är 5–10 arbetsdagar. Vi arbetar med internationella leverantörer och lager, vilket gör att vi kan erbjuda noggrant utvalda smycken av hög kvalitet till ett mer tillgängligt pris. Alla beställningar skickas spårbart direkt till dig.",
      },
      {
        q: "Hur mycket kostar frakten?",
        a: "Vi erbjuder alltid fri frakt på alla beställningar, oavsett ordervärde. Din beställning skickas spårbart direkt hem till dig utan extra kostnad. Inga oförväntande kostnader tillkommer överhuvudtaget.",
      },
      {
        q: "Vilka betalningsmetoder erbjuder ni?",
        a: "Vi erbjuder säkra betalningar via Klarna, kortbetalning och Apple/Google Pay. Alla betalningar hanteras tryggt genom Stripe Payments för en säker och smidig köpupplevelse.",
      },
    ],
  },

  contact: {
    type: "contact",
    title: "Kontakta oss",
    intro: "Vi svarar inom 24h!",
    emailNote: "Eller maila oss på: support@jawhara.se",
  },
};

export function getPageContent(handle: string): PageContent | null {
  return PAGES[handle] ?? null;
}
