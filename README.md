# Lesja lokalhistorie – søkeregister

Et søkbart register over lokalhistorie for Lesja kommune (Innlandet, kommunenr. 3432).
Ett søk på tvers av Lokalhistoriewiki, Nasjonalbiblioteket, Digitalarkivet og Kartverket.

Søk på:

- **personnavn** – f.eks. `Skotte`, `Einbu`
- **gårdsnavn** – f.eks. `Bottheim` (gamle og nye skrivemåter matches, f.eks. *Botheim/Bottheim*, *aa/å*)
- **gårds- og bruksnummer** – f.eks. `13`, `13/4`, `gnr 128 bnr 2`
- **stedsnavn** – setre, vann, fjell, grender
- **artikler og litteratur** – titler på artikler, bøker, årsskrift

## Innhold

| Del | Kilde | Antall (nov. 2026) |
|---|---|---|
| Artikler og personer | Lokalhistoriewiki (kategorien «Lesja kommune» + fulltekstsøk) | 443 |
| Stedsnavn | Kartverkets stedsnavnregister (SSR) | 2 121 |
| Gårder, bruk og setre med gnr/bnr | SSR + dagens matrikkel (Kartverket) | 517 |
| Bøker, tidsskrift og kart | Nasjonalbiblioteket | 317 |
| Kirkebøker, folketellinger, skifter, folkeregister m.m. | Digitalarkivet | 127 |

I tillegg søker siden **direkte i kildene** når du søker (krever nett):

- fulltekst i **Bygdebok for Lesja bd. 1–3** – viser hvilke sider navnet står på
- Lokalhistoriewiki, Nasjonalbibliotekets aviser og bøker, Kartverket og Wikipedia
- for gnr/bnr: adresser på eiendommen i dagens matrikkel

**Bilder:** fanen «Bilder» søker i fotografier hos Nasjonalbiblioteket, Lokalhistoriewiki og Wikimedia Commons, med storbildevisning (piltaster for å bla). Gårdsvisningen og søkeresultatene viser også bilder. DigitaltMuseum (bl.a. Lesja historielags bilder) krever API-nøkkel og er derfor lagt inn som lenke.

## Bruke lokalt

Åpne `index.html` i nettleseren (dobbeltklikk). Ingen installasjon trengs.
Det lokale registeret virker uten nett; live-søk og kart krever nett.

## Legge ut på GitHub Pages

```bash
cd lesja-lokalhistorie
git init
git add .
git commit -m "Lesja lokalhistorie – første versjon"
git branch -M main
git remote add origin https://github.com/<brukernavn>/<repo>.git
git push -u origin main
```

Deretter: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
Siden blir tilgjengelig på `https://<brukernavn>.github.io/<repo>/`.

## Legge til egne artikler og notater

Rediger `data/egne.js`. Der kan du føre inn f.eks. artikler fra *Årsskrift for Lesja historielag*,
med tittel, forfatter, kilde, årstall, gnr og stikkord. De blir søkbare som resten av registeret.

Flere kilder i kildelisten legges til i `data/kilder.js`.

## Oppdatere data

Åpne `verktoy/oppdater-data.html`, klikk **Hent alt**, last ned filene og erstatt dem i `data/`.
(`arkiv.js` fra Digitalarkivet må oppdateres for hånd.)

## Om gnr/bnr

Gårds- og bruksnummer er hentet fra **dagens matrikkel** ved å slå opp hvilken eiendom navnepunktet ligger på.
Det er en god inngang, men kan avvike fra eldre matrikler (1838, 1886, 1950) og fra inndelingen i bygdeboka.
En «navnegard» (f.eks. Bottheim) dekker ofte flere bruk.

## Filstruktur

```
index.html              hovedsiden
css/style.css           utseende
img/                    toppbilde
js/app.js               søk, live-søk, kart
data/wiki.js            Lokalhistoriewiki
data/steder.js          stedsnavn og gnr/bnr
data/nb.js              Nasjonalbiblioteket
data/arkiv.js           Digitalarkivet
data/kilder.js          kildeliste og søkelenker
data/egne.js            dine egne oppføringer
verktoy/oppdater-data.html   henter ferske data
```

## Toppbilde

Grønnefossen på Lesjaskog, fotografert av Marcus Selmer før 1900 (Riksantikvaren, via Wikimedia Commons). Bildet er falt i det fri.
Bytt det ved å legge et annet bilde i `img/` og endre filnavnet i `css/style.css` (`.hero-bilde`).

## Lisenser for data

- Lokalhistoriewiki: CC BY-SA 4.0 (utdragene er korte og lenker tilbake til artiklene)
- Kartverket (stedsnavn, matrikkel): CC BY 4.0
- Nasjonalbiblioteket og Digitalarkivet: metadata og lenker; innholdet ligger hos kildene
