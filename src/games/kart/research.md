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

## Grafik och miljö

Varggropen ligger i kvällssol. En låg, varm sol från nordväst ger långa skuggor över banan, himlen glöder mot horisonten och diset är varmt. Skuggrutan följer kameran och låses till hela texlar så att skuggorna inte darrar. Asfalten har ett mörkt, gummerat ideallinjespår, lagade fläckar, sprickor och skarvar. Rödvita curbs i hela metersbitar ligger vid kurvornas innerkant och utgång, och plastbarriärer och färgade däckvallar följer hela varvet där den fysiska barriären finns. Nära banan står reklamskyltar, nedräkningsskyltar, koner, staket och björkar som susar förbi i farten. Reklamskyltarnas namn är påhittade.

Vid startlinjen står en portal med fem röda startljus, en liten läktare med publik som jublar, och vid varje kurva funktionärer som viftar grön, gul och rutig flagga. Portalen och läktaren är gestaltning av en vanlig kartbana; flygfotot visar inte hur startområdet såg ut 2012. Tidtagningskuren, depån, nätstaketet, däckstaplarna, björkskogen och den röda byggnaden från källorna finns kvar.

Hyrkartingarna har noskon, sidopontoner, nummerskyltar, motor med luftfilter och avgasrör. Föraren håller händerna på ratten genom hela rattutslaget, lutar sig in i kurvorna, nickar vid inbromsning och har en hjälm i sin egen färg. Avlägsna kartar ritas med en enklare modell. Statisk geometri grupperas efter material och upprepade föremål är instansierade, så telefonen ritar färre anrop än före uppgraderingen.

## Körning

Karten styrs nu som en riktig hyrkart. Modellen är fortfarande banrelativ (sträcka och sidoläge), så varv, minikarta och placeringar fungerar som förut, men karten har nu en egen kurs mot banan, girhastighet, fram- och bakhjulens avdrift och däck som släpper gradvis inom en friktionscirkel. Bromsar du in i kurvan läggs tyngden fram och karten svänger villigt. Släpper du gasen mitt i kurvan glider baken ut, och då fångar du den med motstyrning. För mycket vinkel kostar fart. Kerbs skakar och ger lite sämre grepp, gräset är långsamt och gropigt, och däckvallen studsar tillbaka i stället för att hålla fast. Kartar kan gå hjul mot hjul och knuffas med vikt, och suget bakom en rival finns kvar. Står karten still och du håller bromsen backar den efter en kort paus, sakta (högst cirka 9 km/h), så att du kan ta dig ur däckvallen eller en snurr. En riktig hyrkart har ingen back; där kommer en funktionär och knuffar, men i spelet backar du själv. Rivalerna backar inte. Toppfarten är ungefär 67 km/h och ett varv tar 45–50 sekunder, som klubbens hyrkartvarv; ett lopp på tre varv tar cirka två och en halv minut.

Rivalerna kör med samma fysik och följer en ideallinje: brett in, innerkanten i apex och brett ut. Jonas är snabb och tuff, Rickard försiktig, och alla gör ibland små, mänskliga misstag när ingen är nära. De kör om på båda sidor, försvarar innerkanten en gång utan att väva och kör aldrig avsiktligt in i någon.

Starten sker stående med fem röda ljus. Gasar du innan de slocknar blir det tjuvstart med hjulspinn; en snabb reaktion ger en ren start men ingen extra fart. Välj **Lopp** (tre varv mot fem rivaler) eller **Tidskörning** (fem varv ensam mot ett spöke av ditt bästa varv, med skillnaden live), och **Lätt**, **Normal** eller **Svår**.

## Känslan av fart

Kameran sitter lågt och nära bakom karten, ungefär fyra meter bakom och knappt två meter upp. Bildvinkeln vidgas när farten ökar, kameran sjunker bakåt när du gasar och dyker när du bromsar, och den följer kartens verkliga färdriktning så att du ser när baken glider ut. Kantstenarna skakar, gräset gungar och en smäll i däckvallen känns. Med C eller knappen BAKOM/NÄRA byter du till en låg vy precis ovanför nosen. Efter målgången kretsar kameran kring mållinjen medan publiken firar.

Däcken ryker när du sladdar, gräs och jord sprutar när du kör av, gnistor flyger vid smällar och avgaserna puffar. Motorljudet låter som en encylindrig hyrkartmotor med centrifugalkoppling: varvtalet ligger kvar medan kopplingen slirar från stillastående och följer sedan farten. Vind, däckskrik, kantstensmuller och rivalernas motorer gör resten; rivalerna hörs från rätt håll och susar förbi vid en omkörning.

Under loppet ser du placering, varv, tid och skillnaden mot ditt bästa varv, en liten ställning, varvräknare och greppmätare. I tidskörning visas i stället spöket, ditt bästa varv och dina senaste varvtider. På telefon finns AUTOGAS (som väntar tills ljusen slocknat) och styrning med tummen på skärmens vänstra halva. Tangentbordsstyrningen rampar mjukt så att korta tryck inte snurrar karten. Den som har valt mindre rörelse på sin enhet slipper skakningar, fartstreck och lutning.

## Körtekniska referenser

- [TeamSport: Racing line](https://www.team-sport.co.uk/go-karting-faqs/understanding-the-racing-line): bromspunkt, apex och utgång.
- [TeamSport: Advanced karting](https://www.team-sport.co.uk/go-karting-faqs/go-karting-tips-advanced-karting-techniques): bromsning före kurvan.
- [TeamSport: Overtaking](https://www.team-sport.co.uk/go-karting-faqs/how-to-overtake) och [Daytona: Karting tips](https://daytona.co.uk/news/karting-tips-and-advice/): utgångsfart och modest slipstream.

Det är fortfarande en tillgänglig körmodell utan vapen, driftladdningar eller särskilda fartkrafter: sladden är ett sätt att tappa tid, inte att vinna den. Telefonen har samma kontroller som datorn, plus AUTOGAS och tumstyrning.
