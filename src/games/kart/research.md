# Pekkas Gokart — Varggropens banprofil och gestaltning

## Belagda uppgifter och källor

Kontrollerade 5 november 2026:

- [Varggropens Kart Racing Club: Banan](https://vkrc.se/klubben/banan/) är klubbens egen källa. Den anger **665 meter**, tekniska kurvor och kuperad terräng. Klubben uppskattar hyrkartvarv till ungefär 40–50 sekunder.
- Sidans [officiella flygfoto, 960 × 720](https://www-static.vkrc.se/wp-content/uploads/2015/11/vkrc.jpg) visar hela asfaltsslingan och startuppställningen. Fotots verkliga fotograferingsdatum framgår inte. **Katalogen `2015/11` bevisar inte fotograferingsåret.**
- Samma sida har [markfoto daterat 2013-05-19](https://vkrc.se/wp-content/themes/vkrc/images/Banan_Soligt_19-05-13.jpg) och ett vinterfoto daterat 2013-04-24. Det äldre markfotot ger stöd för öppna gräsytor, grus, låga däckstaplar, nätstaket, björkskog och en liten röd byggnad.
- Repositoriets `competition-data.csv` belägger Pekkas Pokals gokarttävling i Varggropen **2012-07-28** samt deltagarna och resultatet.

Flygfotot visar en utdragen slinga med startområdet på dess övre raka, stor böj till vänster, två motsatta inre hårnålar/S-svängar samt en snäv hårnål och lång raksträcka till höger. Den tidigare ovala spelbanan motsvarade inte detta.

## Hur spelbanan återskapas

`route.js` lagrar en manuellt avläst centrumlinje i flygfotots pixelkoordinater. En sammanhängande spline skalas **likformigt** till 665 meter; bildens proportioner behålls. Hårnålens små avläsningshack jämnas till en körbar båge. Den genererade planen är cirka 167 × 113 meter.

Asfalt, kantlinjer, grus, däck, startuppställning, spelarfysik, AI, varvräkning, kamera och minikarta använder samma `sample()`/`curvature()`-modell. Spelets startmarkering har lagts ungefär vid gridområdets högra ände, bildpunkt (440, 294). Flygfotot visar flera tvärmarkeringar, bland annat längre åt vänster; vilken som är officiell start/mål kan inte avgöras säkert från bilden. Sex kartar ställs upp bakom spelets valda linje. En metersystemskala används även för avstånd och fart.

**Osäkerheter:** Flygfotot är inte en georefererad inmätning. Ingen daterad, fullständig banritning från 2012 eller uppmätt höjdprofil hittades. Ungefär sju meters asfaltbredd är en bildbaserad uppskattning. Exakt startlinje, körriktning under Pekkas Pokal 2012, höjder och den tidens detaljerade byggnadsplacering kan inte verifieras. Spelet kör mot fotots högra sida från grid; detta är ett tolkat val. De små höjdskillnaderna och depådetaljerna är också gestaltning. Flygfotot används som researchreferens och distribueras inte som spelgrafik.

## Grafik och körning

Miljön använder samma grenade granar, björkstammar, lövkronor och vind som Måleris skog. Gräs, asfalt och grus får lokalt genererade materialkartor, mikroyta och färgvariation. Terrängen är en sammanhängande yta med samma höjdfunktion som banan. Tydliga vita vägkanter, låga kerbs, gummispår och däckbankar skiljer vägen från omgivningen. Startportalen från den tidigare fantasin är borttagen; en liten tidtagningskur, depå och nätstaket förankrar scenen i referensbilderna.

Kartarna har avrundade karossdelar, exponerat chassi och motor samt originalspelens riggade personer i racingkläder och hjälmar. Reflekterad himmel på lack/metall och skuggor som följer kameran ger mer läsbar form. Statisk geometri grupperas efter material, naturen delas i rumsliga områden och minikartan anpassar sig efter banans verkliga utbredning.

Gas, broms, grepp och tre varv är oförändrade. Ett äldre omvänt höger/vänster-fel i knapparnas koppling till banans sidonormal är korrigerat och verifierat i följekamerans koordinater. Det smalare körtutrymmet och AI:s maximala sidoläge följer den nya banbredden. Poängens tidsdel normaliseras efter banlängden. Fullfältsimuleringen med digitala styrkorrigeringar var 150 ms och vanlig bromsning kan vinna på cirka 136 sekunder, ungefär 45 sekunder per varv. Att enbart hålla gas går fortfarande att fullfölja, men kostar mycket tid.

## Körtekniska referenser

- [TeamSport: Racing line](https://www.team-sport.co.uk/go-karting-faqs/understanding-the-racing-line): bromspunkt, apex och utgång.
- [TeamSport: Advanced karting](https://www.team-sport.co.uk/go-karting-faqs/go-karting-tips-advanced-karting-techniques): bromsning före kurvan.
- [TeamSport: Overtaking](https://www.team-sport.co.uk/go-karting-faqs/how-to-overtake) och [Daytona: Karting tips](https://daytona.co.uk/news/karting-tips-and-advice/): utgångsfart och modest slipstream.

Det är en tillgänglig, banrelativ körmodell: gas/broms och linjeval, utan vapen, driftladdningar eller särskilda fartkrafter. Kontrollerna är identiska på telefon och dator.
