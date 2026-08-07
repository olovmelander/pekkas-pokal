/**
 * Pekkas Pokal — sångboken.
 *
 * Samlade snapsvisor, hyllningar och officiella låtar genom åren, hämtade
 * ur föreningens arkiv (Snapsvisor-mappen på Google Drive: foton av
 * anteckningar och delade dokument).
 *
 * En rad är antingen en sträng eller { o: 'originalrad', t: 'översättning' }
 * när sången sjungs på ett annat språk.
 */

const PEKKAS_SONGS = [
  {
    id: 'cant-del-barca',
    year: 2026,
    title: 'Cant del Barça',
    subtitle: 'Officiell låt 2026 · Barcelona',
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
