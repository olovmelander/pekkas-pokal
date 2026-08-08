/**
 * Pekkas Pokal — sångboken.
 *
 * Samlade snapsvisor, hyllningar och officiella låtar genom åren, hämtade
 * ur föreningens arkiv: Snapsvisor-mappen på Google Drive och gruppchattens
 * historik, där de flesta visorna föddes under själva tävlingskvällarna.
 *
 * En rad är antingen en sträng eller { o: 'originalrad', t: 'översättning' }
 * när sången sjungs på ett annat språk. `subtitle` ger sammanhang.
 */

const PEKKAS_SONGS = [
  /* ------------------------------------------------ 2026 · Barcelona ---- */
  {
    id: 'cant-del-barca',
    year: 2026,
    title: 'Cant del Barça',
    subtitle: 'Årets melodi 2026 · Barcelona',
    melody: 'FC Barcelonas hymn',
    lines: [
      { o: 'Tot el camp', t: 'Hela arenan' },
      { o: 'és un clam', t: 'är ett rop' },
      { o: 'som la gent blaugrana.', t: 'vi är det blåröda folket.' },
      { o: 'Tant se val d’on venim', t: 'Det spelar ingen roll varifrån vi kommer' },
      { o: 'si del sud o del nord', t: 'om från söder eller från norr' },
      { o: 'ara estem d’acord, estem d’acord', t: 'nu är vi överens, vi är överens' },
      { o: 'una bandera ens agermana', t: 'en fana gör oss till bröder' },
      '',
      { o: 'Blaugrana al vent', t: 'Blårött i vinden' },
      { o: 'un crit valent', t: 'ett modigt rop' },
      { o: 'tenim un nom', t: 'vi har ett namn' },
      { o: 'el sap tothom', t: 'det vet alla' },
      'Barça, Barça, Barça!'
    ]
  },
  {
    id: 'varat-pekkas',
    year: 2026,
    title: 'Vårat Pekkas',
    subtitle: 'Bidrag till årets PP-låt 2026',
    melody: 'Cant del Barça',
    lines: [
      'Vårat Pekkas',
      'Är en legend',
      'Från Solberg kom vår Pekka en gång',
      'Med öppet sinne, mod och moral',
      'Om från Arnäs eller Själevad',
      'Han spred sitt lugn, spred sitt lugn',
      'En pokal gör oss till bröder',
      '',
      'En älg i plåt',
      'Ståtlig buckla',
      'Pekka är hans namn',
      'Det vet alla',
      'Pekka, Pekka, Pekka'
    ]
  },
  {
    id: 'cant-del-pekkas',
    year: 2026,
    title: 'Cant del Pekkas',
    subtitle: 'Bidrag till årets PP-låt 2026 — av Henrik',
    melody: 'Cant del Barça',
    lines: [
      'Stig så upp',
      'Som en tupp',
      'Åk iväg till Barna',
      'Plask och lek som väntar',
      'Eller blodigt allvar',
      'På-å Barnas gator, Barnas gator',
      'Är vi rena fyllesvin',
      '',
      'Sagrada familj',
      'Smak av vanilj',
      'Ta i från pung',
      'Och se så sjung',
      'Pekkas! Pekkas! Pekkas!'
    ]
  },
  {
    id: 'pekka-de-la-espana',
    year: 2026,
    title: 'Pekka de la España',
    subtitle: 'Bidrag till årets PP-låt 2026 — av Viktor',
    melody: 'Cant del Barça',
    lines: [
      'Spaanien',
      'See nu upp!',
      '',
      'Vi är Pekkas grabbar',
      'Som ska tävla igen.',
      'Vem ska vinna i år?',
      '',
      'Fokus nu är öl och vin och sprit.',
      'Det är ju lika bra att gasa!',
      '',
      'Lyft nu ditt glas,',
      'Sjung botten upp!',
      '',
      'Hemresan avgår klockan 5!',
      'Pekkas, Pekkas Peeekkas!'
    ]
  },
  {
    id: 'bavergall',
    year: 2026,
    title: 'Bävergäll',
    subtitle: 'Snapsvisa · Barcelona 2026',
    melody: null,
    lines: [
      'Gällen river, glider ner för strupen,',
      'Skapar värme glädje välbehag,',
      'Doftar tjärlek är den bästa supen.',
      'Tack herr bäver för ditt pungbidrag.',
      '',
      'Sjung nu bröder hylla hårig bäver.',
      'Käkar asp och bygger stöddig damm.',
      '',
      'Töm nu glaset men drick aldrig genever,',
      'Bävergäll gör broder from som lamm.'
    ]
  },

  /* -------------------------------------- 2025 · Eskilstuna/Västerås ---- */
  {
    id: 'pa-resan-hem',
    year: 2025,
    title: 'På resan hem',
    subtitle: 'Saaben mot Eskilstuna',
    melody: null,
    lines: [
      'På resan hem på resan hem',
      'Vi sätter oss i saaben',
      '',
      'På resan hem på resan hem',
      'Det bullrar styggt i magen',
      '',
      'Nu är det nog jag måste spy',
      'Får bli i dörren Satan fy',
      '',
      'Den resan hem den resan hem',
      'Den räckte hela dagen'
    ]
  },
  {
    id: 'pekkasen',
    year: 2025,
    title: 'Pekkasen',
    melody: 'When Johnny Comes Marching Home',
    lines: [
      'En pekkas älskar livets vand,',
      'hurra, hurra!',
      'Det hastigt i hans svalg försvann,',
      'hurra, hurra!',
      'Till kalv, till oxe, till fisk, till fläsk,',
      'när alla käringar vill ha läsk.',
      'Ja, då vill alla pekkas ha en bäsk.',
      '',
      'När bäsken småningom är slut,',
      'tragik, tragik.',
      'Då bärs varenda pekkas ut',
      'som lik, sig lik.',
      'Och när vi vaknar, vi sjunger en bit,',
      'och korkar upp skånes akvavit.',
      'Skål för alla pekkas som kom hit.'
    ]
  },
  {
    id: 'getingen',
    year: 2025,
    title: 'Getingen',
    subtitle: 'Klassiker ur snapsboken',
    melody: 'Jazzgossen',
    lines: [
      'Och så kommer det en geting',
      'genom luften som ett reaplan.',
      'Också far han ner i strupen',
      'mitt under röda kran.',
      'Och så far han ner i magen',
      'med ett jätteplask,',
      'jätteplask, jätteplask.',
      'Och så blir man lite dragen,',
      'men pigg och rask,',
      'pigg och rask, pigg och rask.'
    ]
  },
  {
    id: 'supa-klockan-over-tolv',
    year: 2025,
    title: 'Supa klockan över tolv',
    subtitle: 'Klassiker · Carl Michael Bellman',
    melody: 'Bellman',
    lines: [
      'Supa klockan över tolv,',
      'leva bland förryckta!',
      'Jorden är mitt kammargolv,',
      'solen är min lykta!',
      'Jag bryr mig om ingenting,',
      'blott att hjärnan löper kring,',
      '||: löper kring, :||',
      'Intill dess hon domnar,',
      'Och jag fattig somnar.',
      '',
      'I min farfars gamla rock',
      '(hål uppå armbågen)',
      'står jag bland en lustig flock,',
      'super bara rågen,',
      'tar mig ur de vackra krus',
      'morgon-, middags-, aftonrus,',
      '||: aftonrus, :||',
      'och så blir jag röder',
      'som de ägta bröder.'
    ]
  },
  {
    id: 'kraftvisa',
    year: 2025,
    title: 'Tycker du att kräftan är för djup',
    subtitle: 'Kräftskivan hos Viktor',
    melody: null,
    lines: [
      'Tycker du att kräftan är för djup,',
      'Nå välan så tag dig då en sup,',
      'Tag dig sen dito en, dito två, dito tre,',
      'Så dör du nöjdare.'
    ]
  },

  /* ------------------------------------------------ 2024 · Själevad ----- */
  {
    id: 'hejsan-pekka',
    year: 2024,
    title: 'Hejsan pekka!',
    subtitle: 'Sjungen varje år sedan 2024',
    melody: null,
    lines: [
      'När nätterna blir längre och sommaren är slut',
      'Så samlas alla gossarna som hunnit flytta ut',
      '',
      'De tittar på pokalen och speglar sig i den',
      'Men bara en i gänget kan få med den hem',
      '',
      'Hejsan hoppsan fallerallera',
      'Och spriten i pokalen smakar nästan aldrig bra',
      'Hejsan hoppsan fallerallera',
      'Imorgon blir med säkerhet en jätterutten da’'
    ]
  },
  {
    id: 'egen-pokal',
    year: 2024,
    title: 'Jag vill ha en egen pokal',
    subtitle: 'Sjungen varje år sedan 2024',
    melody: 'Jag vill ha en egen måne — Ted Gärdestad',
    lines: [
      'Jag vill ha en egen pokal',
      'Så jag kan vinna den',
      '',
      'Och slippa köra gokart, fiska sill',
      '',
      'Jag kan sitta med min pokal och göra vad jag vill',
      'Och rista in mitt namn vartenda år'
    ]
  },

  /* ------------------------------------------------ 2023 · Stockholm ---- */
  {
    id: 'forhojt-terrorhot',
    year: 2023,
    title: 'Förhöjt terrorhot',
    subtitle: 'Fäktnings-Pekkas i tiden',
    melody: 'Feliz Navidad',
    lines: [
      'Förhöjt terrorhot',
      'Förhöjt terrorhot',
      'Förhöjt terrorhot, vi lever som vanligt och bränner koran',
      '',
      'Vi fäktas på Pekkas Pokal',
      'Vi svettas i våra fäktningsdräkter',
      '',
      'Förhöjt terrorhot, vi lever som vanligt och bränner koran'
    ]
  },
  {
    id: 'henke-pa-fyllan',
    year: 2023,
    title: 'Se på Henke på fyllan',
    melody: 'Internationalen',
    lines: [
      'Se på Henke på fyllan',
      'En sån skam där i kön',
      'Ta en sväng runt kvarte-e-ret',
      'Nyktra till ger bister lön.',
      '',
      'Märkbart full och berusad',
      'Går sen ändå runt igen.',
      'Ständig kämpe trots a-aaltid',
      'Blir han slängd därut igen igen igen'
    ]
  },

  /* ------------------------------------------------ 2022 · Arnäsvall ---- */
  {
    id: 'sjosala-pekkas',
    year: 2022,
    title: 'Pekkas på Sjösala äng',
    subtitle: 'Sjungen 2022 och 2023',
    melody: 'Sjösala vals — Evert Taube',
    lines: [
      'Henrik Lundqvist skuttar med ett skratt ur sin säng',
      'Viktor står på Orrberget. Sunnanvind brusar.',
      'Niklas Norberg valsar över Sjösala äng.',
      'Hör min vackra visa, kom sjung min refräng!',
      'Ludvig har fått ungar och dyker i sin vik,',
      'Ur alla gröna dungar hörs Per Olssons musik',
      '',
      'Och se, så många blommor som redan slagit ut',
      'På ängen!',
      'Gullviva,',
      'Mandelblom,',
      'Kattfot',
      'Och blå viol.',
      '',
      'Erik Vallgren virvlar sina lurviga ben',
      'Under vita skjortan som viftar kring vaderna.',
      'Lycklig som en lärka uti majsolens sken,',
      'Sjunger Per för ekorrn, som gungar på gren!',
      '— Rickard, Ludvig, Olle! De dansar i en ring!',
      'Koko! Och Mick'
    ]
  },
  {
    id: 'nar-pekka-tar-sig-en-sup',
    year: 2022,
    title: 'När Pekka tar sig en sup',
    melody: 'Dover–Calais — Magnus Uggla',
    lines: [
      'När Pekka tar sig en sup',
      'Blir han intressant och djup',
      'Allting som är svårt',
      'kan då verka lätt',
      'Alla hans rädslor går bort',
      'Med en grogg av någon sort',
      'Allting som är svårt',
      'Kan då verka lätt'
    ]
  },
  {
    id: 'oh-ioh-pekkas',
    year: 2022,
    title: 'Oh-ioh Pekkas!',
    melody: 'Luftens hjältar',
    lines: [
      'Ohohohohohoh',
      'Ohohoho',
      '',
      'Oh-ioh Pekkas!! Oioh Pekkas!',
      'Uti Övik hela da’n',
      'Med vår feta pokal',
      '',
      'Oh-ioh Pekkas!! Oioh Pekkas!',
      'Hela natten hela da’n',
      'Med vår feta pokal'
    ]
  },
  {
    id: 'kommer-du-ihag',
    year: 2022,
    title: 'Kommer du ihåg förra pekkas?',
    subtitle: 'Sjungen varje år sedan 2022',
    melody: null,
    lines: [
      'Kommer du ihåg hur det var förra pekkas?',
      'Kommer du ihåg alla tävlingar och supar?',
      'Kommer du ihåg allas gnäll om nån liten detalj?',
      '',
      'Kommer du ihåg hur det var förra pekkas?',
      'Kommer du ihåg när vi undra om regler?',
      'Kommer du ihåg alla pojkar som irrade runt?'
    ]
  },
  {
    id: 'pekkas-peak',
    year: 2022,
    title: 'När man ser på hur Pekkas utvecklas',
    melody: 'Öl — Hasse & Tage',
    lines: [
      'När man ser på hur Pekkas, utvecklas å står i',
      'Kan man undra om Pekkas, nånsin når sin peak',
      'Om det finns sup, om det finns mat',
      'Om det är drägligt runt vårt bord',
      'Men man kan hoppas att Pekkas ändå ger en fin sup'
    ]
  },
  {
    id: 'pekkas-hockey',
    year: 2022,
    title: 'P-E-K-K-A-S',
    melody: 'Hockeylåten',
    lines: [
      'P-E-K-K-A-S, Pekkas!',
      'P-E-K-K-A-S, Pekkas!',
      'Pekkas, pekkas, pekkas,',
      'Pekkas, pekkas, pekkas!',
      'PP – nu är det öviksfeber',
      'PP – jag ska försvara mitt guld',
      'PP – kämpa för varje seger',
      'Knäcka Henke, få Niklas på fall',
      '',
      'Ooh-o-oh, ooh-o-oh, jag ska få hela gänget på fall!',
      '',
      'Okej, pokal igen, pokal igen',
      'Okej, pokal igen, pokal igen',
      '',
      'Så koppla grepp och släpp ej tag',
      'Nu hela Öviks bästa lag',
      '',
      'Okej, pokal igen, pokal igen',
      'Okej, pokal igen, pokal igen'
    ]
  },
  {
    id: 'fader-pekkaman',
    year: 2022,
    title: 'Fader Pekkaman',
    melody: 'Fader Abraham',
    lines: [
      'Fader Pekkaman',
      'Fader Pekkaman',
      'Fyra bläckor hade Pekkaman',
      'Som han dela ut',
      'Till Per och Niklas',
      'Och så gjorde han så här:',
      'Höger hand…'
    ]
  },
  {
    id: 'vi-drar-till-pekkas',
    year: 2022,
    title: 'Vi drar till Pekkas',
    melody: 'Vi drar till fjällen — Markoolio',
    lines: [
      'Vi drar till Pekkas, nån kommer däcka',
      'Ute och super med jäger och hembränt',
      'Vi drar till Pekkas, nån kommer däcka',
      'Trillar i backen av teca-attacken! 🎿🎿'
    ]
  },
  {
    id: 'gräver-guld',
    year: 2022,
    title: 'För alla vi som tävlat i Pekkas',
    melody: 'När vi gräver guld i USA — GES',
    lines: [
      'För alla vi som tävlat i Pekkas',
      'Festat natten lång',
      'Övik är vår stad',
      'Ända från Brébyn till Arnäsvall',
      '(vi kommer inte ut förrens vi druckit upp det vi har)',
      'När vi fightas om Pekkas Pokal 🏆🍻'
    ]
  },
  {
    id: 'vi-alskar-pekkas',
    year: 2022,
    title: 'Vi älskar Pekkas',
    melody: 'Ramsa — sjungs tills grannarna klagar',
    lines: [
      'Vi älskar Pekkas Pekkas Pekkas',
      'Vi älskar Pekkas. WOOP WOOP. 🎶🎉',
      '',
      'Vi älskar Pekkas Pekkas Pekkas',
      'Vi älskar Pekkas. WOOP WOOP. 🎶🎉'
    ]
  },
  {
    id: 'pekkas-ramsa',
    year: 2022,
    title: 'Pekkas ☀️',
    melody: 'Ramsa',
    lines: [
      'Kuken ballen kempehallen',
      'Pekka Gunilla, Henke mår illa',
      'Röven håret, största låret',
      'Pekkas brede, tredje benet!'
    ]
  },

  /* ------------------------------------------------ 2021 · Ås ----------- */
  {
    id: 'viktor-jones-fylledrang',
    year: 2021,
    title: 'Viktor Jones fylledräng',
    melody: 'Trad. — ur gruppchatten 8 aug 2021',
    lines: [
      'Viktor Jones fylledräng',
      'Fylledräng fylledräng',
      'Han vaktade sina teqor fem',
      'Teqor fem teqor fem',
      'Damerna de kvittra så glada',
      'Han har allt en man skall hava',
      'Mustasch hockeyfrilla å,',
      'en betongsugga som e blå'
    ]
  },
  {
    id: 'pekkas-go-west',
    year: 2021,
    title: 'Pekkas',
    melody: 'Go West — Pet Shop Boys',
    lines: [
      'Pekkas — Vi tävlar varje år 🗓️',
      'Pekkas — Dricker så mycket det går 🍻',
      'Pekkas — Vi har det väldigt kul 🕺💃🎈🎊',
      'Pekkas — Vi ses igen kring jul! 🎅🎄'
    ]
  }
];

// Export for global access
window.PEKKAS_SONGS = PEKKAS_SONGS;
