# Mateira API

Backend REST del sito della Fondazione MATEIRA: autenticazione del superuser, gestione dei media (upload diretto verso lo storage tramite URL firmati), delle news, dei blocchi della Home, delle parole di MATEIRA, degli organi e delle persone, con flusso bozza/pubblicato. Node.js e TypeScript, server `http` nativo, Prisma 7, PostgreSQL.

Il sito che usa questa API è [Mateira_FE](https://github.com/Simone754/Mateira_FE).

## Requisiti

- Node.js 22.19 o superiore (`engines` in `package.json`; sviluppato con Node 24). Il minimo viene da `@apidevtools/swagger-parser`, usato nei test.
- Docker, per il PostgreSQL 16 locale definito in `docker-compose.yml`.
- Solo per provare gli upload in locale: un server compatibile con l'API S3 (per esempio MinIO) all'indirizzo di `MEDIA_ENDPOINT`. Non è incluso in `docker-compose.yml`. Senza, tutte le altre API funzionano: l'URL firmato viene calcolato senza contattare lo storage, ma il caricamento del file e la cancellazione dell'oggetto no (la cancellazione scrive un avviso nel log e la riga del database viene comunque eliminata).

## Setup locale

```bash
docker compose up -d          # oppure: npm run db:up
cp .env.example .env          # poi compilare i valori vuoti, vedi sotto
npm install
npm run db:migrate            # applica le migrazioni al database "mateira"
npm run seed                  # crea il superuser da SUPERUSER_EMAIL e SUPERUSER_PASSWORD
npm run seed:words            # solo al primo avvio: carica le sei parole iniziali (vedi sotto prima di rilanciarlo)
npm run dev                   # tsx watch src/server.ts
```

- Compilare in `.env` almeno `JWT_SECRET` (almeno 32 caratteri, non deve iniziare con `change-me`; il comando per generarlo è nel commento di `.env.example`) e `SUPERUSER_PASSWORD` (almeno 12 caratteri).
- Docker avvia PostgreSQL sulla porta 5433 (utente, password e database `mateira`) e crea anche il database `mateira_test` tramite `docker/init-test-db.sql`, solo alla prima creazione del volume.
- `npm install` esegue `prisma generate` (script `postinstall`).
- Il server ascolta su `PORT` (default 4000). `GET http://localhost:4000/api/health` risponde `{"status":"ok"}` quando il database risponde.
- Il seed gestisce l'unico superuser. Se non esiste lo crea. Se esiste e email o password sono cambiate, li aggiorna e revoca tutte le sue sessioni; se non è cambiato nulla, non tocca niente. Se nel database ci sono più superuser si ferma con un errore (409) senza modificare nulla: vanno rimossi a mano.
- `npm run seed:words` crea le parole di MATEIRA della prima uscita che non ci sono ancora (stesso termine sulla stessa pagina) e non tocca mai quelle esistenti: le correzioni fatte dal pannello restano. Fondazione, Generare e Viaggio nascono pubblicate; MATEIRA, Disegnare e Trasformazione in bozza, in attesa di conferma. Serve solo al primo avvio: rilanciarlo ricrea ogni parola iniziale che dal pannello è stata eliminata, rinominata o spostata su un'altra pagina (Fondazione, Generare e Viaggio tornerebbero pubblicate e una parola rinominata comparirebbe due volte), quindi non va rilanciato in produzione dopo modifiche redazionali.

## Test

```bash
npm run db:test:migrate       # una volta sola, e dopo ogni nuova migrazione
npm test
```

- I test usano il database `mateira_test` (configurato in `.env.test`) e vengono eseguiti un file alla volta. I test che toccano i dati svuotano le tabelle prima di ogni caso; `resetDb` si rifiuta di girare se `DATABASE_URL` non contiene `_test`.
- Non serve nessun server di storage.
- `npm run typecheck` controlla i tipi di `src/`, `tests/` e `prisma.config.ts` senza produrre file.

## Build e avvio in produzione

```bash
npm ci
npm run build                 # prisma generate (prebuild), poi tsc: l'output è in dist/
npm run db:deploy             # prisma migrate deploy
SUPERUSER_EMAIL=... SUPERUSER_PASSWORD=... node dist/scripts/seed-superuser.js
npm start                     # node dist/server.js
```

- Le variabili d'ambiente vengono lette dall'ambiente del processo e, se presente, dal file `.env` nella cartella di lavoro; un valore già impostato e non vuoto nell'ambiente non viene sovrascritto dal file.
- `prisma` e `dotenv` sono dipendenze di runtime perché la CLI delle migrazioni (`npm run db:deploy`) e `prisma.config.ts` ne hanno bisogno anche in produzione. `typescript` è una devDependency: `npm ci` va eseguito senza `--omit=dev` finché si costruisce sulla stessa macchina.
- `SUPERUSER_EMAIL` e `SUPERUSER_PASSWORD` servono solo allo script di seed, non al server.
- All'arresto (`SIGINT` o `SIGTERM`) il server smette di accettare connessioni, chiude Prisma e il pool; dopo 10 secondi esce comunque.

## Variabili d'ambiente

La configurazione viene validata all'avvio: un valore non valido ferma il processo con un messaggio che nomina la variabile. Una variabile vuota vale come non impostata. Le durate hanno la forma `90` (secondi), `15m`, `1h` o `14d` e devono essere maggiori di zero.

| Variabile | Default | Significato |
| --- | --- | --- |
| `PORT` | `4000` | Porta del server (intero da 1 a 65535). |
| `DATABASE_URL` | nessuno, obbligatoria | Stringa di connessione PostgreSQL, usata dal server e dalla CLI Prisma. |
| `JWT_SECRET` | nessuno, obbligatoria | Segreto con cui si firmano gli access token. Almeno 32 caratteri e non deve iniziare con `change-me` (senza distinguere maiuscole). |
| `JWT_EXPIRES_IN` | `1h` | Durata dell'access token. |
| `REFRESH_TOKEN_TTL` | `14d` | Durata del refresh token e del cookie che lo contiene. |
| `BCRYPT_SALT_ROUNDS` | `12` | Costo di bcrypt per le password (intero da 4 a 15). |
| `COOKIE_SECURE` | `true` | Attributo `Secure` del cookie di refresh. Resta attivo se la variabile non c'è o è vuota. Se è impostata, `true`, `1` e `yes` lo attivano e qualsiasi altro valore (per esempio `false`) lo disattiva. Da disattivare solo in sviluppo su http semplice. |
| `TRUST_PROXY_HOPS` | `0` | Numero di reverse proxy davanti all'app che aggiungono un indirizzo a `X-Forwarded-For` (intero da 0 a 5). Con `0` l'header viene ignorato. Vedi la checklist. |
| `LOGIN_RATE_MAX` | `5` | Tentativi di login falliti consentiti per coppia indirizzo IP + email nella finestra (intero da 1 a 100). Il limite per il solo indirizzo IP è 4 volte questo valore. |
| `LOGIN_RATE_WINDOW` | `15m` | Finestra del limite sui login. |
| `CORS_ORIGINS` | `http://localhost:5173` | Origini ammesse per CORS, separate da virgola. Il confronto ignora le maiuscole e le barre finali scritte nella variabile vengono tolte. |
| `DOCS_ENABLED` | `true`; `false` se `NODE_ENV=production` | Abilita `/docs` (Swagger UI) e `/openapi.json`. Se la variabile non c'è o è vuota vale `true`, tranne quando `NODE_ENV` è `production`. Se è impostata, `true`, `1` e `yes` la attivano e qualsiasi altro valore la disattiva. Da attivare in produzione solo dietro una protezione. |
| `SUPERUSER_EMAIL` | nessuno | Email del superuser, solo per lo script di seed. |
| `SUPERUSER_PASSWORD` | nessuno | Password del superuser (almeno 12 caratteri), solo per lo script di seed. |
| `MEDIA_ENDPOINT` | vuoto | Endpoint dello storage compatibile S3. |
| `MEDIA_REGION` | `us-east-1` | Regione usata per firmare le richieste. |
| `MEDIA_ACCESS_KEY` | vuoto | Chiave di accesso allo storage. |
| `MEDIA_SECRET_KEY` | vuoto | Chiave segreta dello storage. |
| `MEDIA_BUCKET` | vuoto | Nome del bucket. |
| `MEDIA_PUBLIC_BASE_URL` | valore di `MEDIA_ENDPOINT` | Base degli indirizzi pubblici dei file, che hanno la forma `<base>/<bucket>/<chiave>`. |
| `MEDIA_FORCE_PATH_STYLE` | `true` | Indirizzamento dei bucket con il nome nel percorso invece che nel dominio. |
| `MEDIA_PRESIGN_EXPIRES_IN` | `15m` | Validità degli URL firmati di upload. |

Se `MEDIA_ENDPOINT`, `MEDIA_ACCESS_KEY`, `MEDIA_SECRET_KEY` o `MEDIA_BUCKET` mancano, `POST /api/admin/media/presign` risponde 503.

## API

Gli errori sono JSON nella forma `{ "error": "..." }`. Le risposte sotto `/api/admin` hanno `Cache-Control: no-store`. Le rotte admin, escluse `login`, `refresh` e `logout`, richiedono l'header `Authorization: Bearer <accessToken>`. Il controllo è unico, in `src/app.ts`, e copre ogni percorso sotto `/api/admin/` tranne le rotte `login`, `refresh` e `logout`: senza token qualunque altro percorso, anche uno che non esiste, risponde 401.

| Metodo e percorso | Descrizione |
| --- | --- |
| `GET /api/health` | 200 se il database risponde, 503 altrimenti. |
| `GET /api/public/news` | News pubblicate, dalla più recente. Parametri: `category`, `limit` (default 12, massimo 50), `page`. |
| `GET /api/public/news/:slug` | Dettaglio di una news pubblicata. Le bozze rispondono 404. |
| `GET /api/public/home` | Blocchi pubblicati della Home, già in ordine: `{ blocks: [{ id, type, content }] }`, senza stato, posizione e date. Nelle schede `FEATURED` l'immagine è in `image` (`{ id, url, alt }` oppure `null`). Le bozze non compaiono. |
| `GET /api/public/words` | Parole di MATEIRA pubblicate: `{ words: [{ id, term, etymology, meaning, closing, page }] }`. Con `page` quelle di una pagina, in ordine; senza, tutte, pagina per pagina. Una pagina fuori elenco risponde 400. |
| `GET /api/public/organs` | Organi pubblicati con i loro membri: `{ organs: [{ id, name, category, description, members: [{ id, name, bio, photo, title }] }] }`. Prima `GOVERNANCE` poi `ADVISORY`, ciascuno in ordine; con `category` solo una categoria (fuori elenco 400). Si pubblica solo ciò che è formalizzato: un organo compare solo se è pubblicato, un membro solo se sono pubblicati sia la persona sia l'organo. Nessun campo amministrativo. |
| `GET /api/public/people` | Persone pubblicate con un incarico: `{ people: [{ id, name, bio, photo, title }] }` nell'ordine dell'incarico. `role` è obbligatorio e vale `PROMOTER`, `TEAM` o `AMBASSADOR`; assente, vuoto, `ORGAN_MEMBER` o fuori elenco risponde 400. `photo` è `{ id, url, alt }` oppure `null`. |
| `POST /api/admin/auth/login` | Con `email` e `password` restituisce `accessToken`, `expiresIn` e `user`, e imposta il cookie `mateira_refresh`. Risponde 429 con `Retry-After` oltre il limite di tentativi. |
| `POST /api/admin/auth/refresh` | Con il cookie di refresh restituisce un nuovo access token e ruota il cookie. Un refresh token già usato revoca tutta la catena. |
| `POST /api/admin/auth/logout` | Revoca il refresh token e cancella il cookie (204). |
| `GET /api/admin/auth/me` | Utente autenticato. |
| `POST /api/admin/media/presign` | Registra un media e restituisce l'URL firmato per l'upload diretto con `PUT`. Tipi ammessi: `image/jpeg`, `image/png`, `image/webp` (massimo 15 MB, testo `alt` obbligatorio) e `application/pdf` (massimo 25 MB). |
| `GET /api/admin/media` | Elenco dei media, dal più recente. Parametri: `limit` (default 20, massimo 50), `page`. |
| `PATCH /api/admin/media/:id` | Modifica il testo `alt`. |
| `DELETE /api/admin/media/:id` | Elimina la riga e tenta di eliminare l'oggetto nello storage (204; 404 se il media non esiste). |
| `GET /api/admin/news` | Tutte le news. Parametri: `status` (`DRAFT` o `PUBLISHED`), `category`, `limit` (default 20, massimo 100), `page`. |
| `POST /api/admin/news` | Crea una news (201). Lo `slug` viene ricavato dal titolo se non è indicato; lo stato predefinito è `DRAFT`. |
| `GET /api/admin/news/:id` | Dettaglio con tutti i campi, bozze comprese. |
| `PATCH /api/admin/news/:id` | Modifica parziale. |
| `DELETE /api/admin/news/:id` | Elimina la news (204). |
| `GET /api/admin/home-blocks` | Tutti i blocchi della Home in ordine, bozze comprese, con `position`, `status` e date: `{ blocks: [...] }`. |
| `POST /api/admin/home-blocks` | Crea un blocco `{ type, content, status? }` (201), in fondo alla Home e per default in bozza. |
| `GET /api/admin/home-blocks/:id` | Dettaglio di un blocco (404 se non esiste). |
| `PATCH /api/admin/home-blocks/:id` | Cambia `content` e/o `status`. Il `content` sostituisce quello attuale per intero ed è riconvalidato per il tipo del blocco; `type` non è ammesso (400). |
| `DELETE /api/admin/home-blocks/:id` | Elimina il blocco (204; 404 se già eliminato, anche con richieste simultanee). |
| `PUT /api/admin/home-blocks/order` | Riordina: `{ ids: [...] }` deve contenere tutti gli id esistenti, ciascuno una volta (altrimenti 400). Riscrive le posizioni 0, 1, 2... in una transazione e risponde 200 con l'elenco aggiornato; 409 se un blocco viene cancellato mentre l'ordine si scrive. |
| `GET /api/admin/words` | Tutte le parole, bozze comprese, con `position`, `status` e date: `{ words: [...] }`. Filtro facoltativo `page`. |
| `POST /api/admin/words` | Crea una parola `{ term, etymology, meaning, closing?, page, position?, status? }` (201), per default in bozza e in fondo alla sua pagina. 409 se la pagina ha già lo stesso termine. |
| `GET /api/admin/words/:id` | Dettaglio di una parola (404 se non esiste). |
| `PATCH /api/admin/words/:id` | Modifica uno o più campi. Spostata su un'altra pagina senza `position`, la parola va in fondo; `closing: null` toglie la frase conclusiva; 409 se la nuova combinazione pagina e termine esiste già. |
| `DELETE /api/admin/words/:id` | Elimina la parola (204; 404 se già eliminata, anche con richieste simultanee). |
| `GET /api/admin/organs` | Tutti gli organi, bozze comprese, con `position`, `status`, date e `memberCount`: `{ organs: [...] }`. Filtro facoltativo `category`. |
| `POST /api/admin/organs` | Crea un organo `{ name, category, description?, position?, status? }` (201), per default in bozza e in fondo alla sua categoria. 409 se esiste già un organo con lo stesso nome (anche con richieste simultanee). |
| `GET /api/admin/organs/:id` | Dettaglio con `members`: tutti i membri, anche in bozza, ciascuno con `roleId` (id dell'incarico) e `status` (della persona). 404 se non esiste. |
| `PATCH /api/admin/organs/:id` | Modifica uno o più campi (corpo vuoto 400). Cambiando `category` senza `position` l'organo va in fondo alla nuova categoria; `description: null` toglie le funzioni; 409 se il nuovo nome esiste già. |
| `DELETE /api/admin/organs/:id` | Elimina l'organo e gli incarichi in quell'organo (204; 404 se già eliminato, anche con richieste simultanee). |
| `GET /api/admin/people` | Tutte le persone, bozze comprese, con foto risolta e `roles`: `{ people: [...] }`, ordinate per nome (senza distinguere maiuscole), poi data di creazione. Filtri facoltativi `role` (anche `ORGAN_MEMBER`) e `status`. |
| `POST /api/admin/people` | Crea una persona `{ name, bio?, photoId?, status?, roles? }` (201), per default in bozza. `roles` è l'elenco `[{ kind, organId?, title?, position? }]` (massimo 20). 400 per organo o foto inesistenti, foto non immagine, incarichi doppi (`duplicate role`). |
| `GET /api/admin/people/:id` | Dettaglio di una persona con i suoi incarichi (`id`, `kind`, `organId`, `organName`, `title`, `position`). 404 se non esiste. |
| `PATCH /api/admin/people/:id` | Modifica uno o più campi tra `name`, `bio`, `photoId`, `status`, `roles`. `roles` sostituisce per intero gli incarichi, nella stessa transazione; un incarico che resta uguale conserva la `position`. 409 se lo stesso incarico viene scritto da due richieste simultanee. |
| `DELETE /api/admin/people/:id` | Elimina la persona e i suoi incarichi (204; 404 se già eliminata, anche con richieste simultanee). |

Le categorie delle news sono `MATEIRA`, `RICERCA`, `PROGRAMMI`, `VIAGGIO_TIRENAUTI`, `INCONTRI`, `COLLABORAZIONI`, `APPUNTAMENTI`, `PRESS` e `COMUNICATI`.

I blocchi della Home hanno un `type` che non cambia dopo la creazione e un `content` validato per tipo (un campo non previsto è rifiutato con 400):

| Tipo | Campi di `content` |
| --- | --- |
| `HERO` | `title` (max 200), `text` (max 600, facoltativo), `primaryCta`, `secondaryCta` (facoltativa) |
| `TICKER` | `items`: da 1 a 10 elementi `{ text (max 160), href (facoltativo) }` |
| `CTA` | `title` (max 200), `text` (max 400, facoltativo), `cta` |
| `FEATURED` | `title` (max 120), `items`: da 1 a 6 schede `{ title (max 160), text (max 300, facoltativo), href, imageId (facoltativo) }` |

`primaryCta`, `secondaryCta` e `cta` sono `{ label (max 60), href }`. Un `href` è un percorso interno con una sola `/` iniziale (`/come-lavoriamo`, senza spazi, max 300 caratteri) oppure un indirizzo `http` o `https` valido senza nome utente né password; entrambi vengono salvati come li scrive il parser degli indirizzi (segmenti `.` risolti, virgolette, apice, `<`, `>` e backtick codificati con `%`, un percorso semplice resta uguale); `javascript:`, `data:`, `mailto:` e gli indirizzi che iniziano con `//` (anche `/.//`) sono rifiutati. `imageId` deve essere un media esistente che sia un'immagine (non un PDF); se il media viene cancellato dopo, la scheda resta e `image` vale `null`. I blocchi sono letti per `position`, poi data di creazione, poi id; un blocco nuovo va in fondo.

Le parole di MATEIRA hanno `term` (max 60, una sola riga), `etymology` (max 1000), `meaning` (max 3000), `closing` (max 300, facoltativa), `page` e `position` (da 0 a 9999). I testi sono semplici: una riga vuota separa i paragrafi, una riga singola va a capo; i fine riga `\r\n` e `\r` diventano `\n` prima di misurare la lunghezza. Le pagine ammesse, nell'ordine in cui le restituisce l'elenco senza filtro, sono `home`, `mateira`, `come-lavoriamo`, `tirreno`, `programmi`, `impatto`, `tirenauti`, `viaggio-dei-tirenauti`, `partecipare` e `collabora-con-mateira`. Dentro una pagina l'ordine è `position`, poi data di creazione, poi id; una parola nuova, o spostata senza `position`, va in fondo alla pagina.

Gli organi hanno `name` (max 160, una riga, unico), `category` (`GOVERNANCE` per gli organi di governo, `ADVISORY` per comitati e consigli consultivi), `description` (max 3000, facoltativa), `position` (da 0 a 9999) e `status`. Le persone hanno `name` (max 120, una riga, non unico), `bio` (max 3000, facoltativa), `photoId` (un media immagine, non PDF; se il media viene cancellato la persona resta e `photo` vale `null`) e `status`. Ogni persona ha da zero a 20 incarichi: `kind` (`PROMOTER`, `TEAM`, `AMBASSADOR` o `ORGAN_MEMBER`), `organId` (obbligatorio se e solo se `kind` è `ORGAN_MEMBER`), `title` (max 120, una riga, facoltativo) e `position`; un solo incarico per lista, cioè per la stessa coppia `kind` e `organId`. I testi sono semplici come per le parole. Organi e incarichi sono letti per `position`, poi data di creazione, poi id; un elemento nuovo va in fondo alla sua lista (categoria per gli organi, `kind` e organo per gli incarichi). **Si pubblica solo ciò che è formalizzato:** nell'API pubblica una persona compare solo se è `PUBLISHED`, un organo solo se è `PUBLISHED` e un incarico in un organo solo se sono pubblicati sia la persona sia l'organo. Non c'è un comando di riordino: l'ordine si cambia con `position`.

L'upload dei media avviene in due passi: il front end chiama `presign`, poi invia il file con `PUT` direttamente all'`uploadUrl`, usando gli header indicati nella risposta (`Content-Type`). Il file non passa dall'API.

## Documentazione API (Swagger)

Con il server in esecuzione:

- `http://localhost:4000/docs` apre Swagger UI, dove si provano tutte le rotte dal browser.
- `http://localhost:4000/openapi.json` è il documento OpenAPI 3.0.3, scritto a mano in `src/modules/docs/openapi.ts`: si può anche importare in Postman o usare per generare un client.

All'avvio (`npm run dev` o `npm start`) il terminale stampa l'indirizzo del server e quelli di Swagger UI e di `openapi.json`. Con `DOCS_ENABLED=false` stampa l'indirizzo del server e la riga `Documentazione disattivata (DOCS_ENABLED=false)`.

Per provare le rotte admin bastano due passi:

1. Apri `/docs`, espandi `POST /api/admin/auth/login`, inserisci email e password del superuser (quelle di `SUPERUSER_EMAIL` e `SUPERUSER_PASSWORD` usate dal seed) e premi *Execute*.
2. Il token di accesso viene applicato da solo al lucchetto *Authorize*, che si chiude: da quel momento ogni rotta con il lucchetto si prova con *Execute*, per esempio `GET /api/admin/auth/me`. Non serve copiare il token.

Il token dura `JWT_EXPIRES_IN`. `POST /api/admin/auth/refresh` ne ottiene uno nuovo (e lo applica da solo) e `POST /api/admin/auth/logout` chiude la sessione. Entrambe usano il cookie `mateira_refresh` (HttpOnly), che Swagger UI non può leggere né impostare: lo invia il browser da solo, perché `/docs` è servita dalla stessa origine dell'API. In sviluppo su http serve `COOKIE_SECURE=false`.

Le pagine `/docs` e `/openapi.json` sono pubbliche: descrivono l'API ma non danno accesso ai dati. Per questo `DOCS_ENABLED` è attivo di default tranne in produzione. Il default in produzione vale solo se il processo ha `NODE_ENV=production` (`npm start` non lo imposta da solo): impostalo nell'ambiente di deploy oppure metti `DOCS_ENABLED=false`. Con la documentazione spenta le due pagine rispondono 404.

**Regola per i nuovi moduli.** Ogni nuovo endpoint va descritto in `src/modules/docs/openapi.ts` (percorso, parametri, body con esempio, tutti gli status e gli schemi) e aggiunto all'elenco `ROUTES` e alle chiamate `CALLS` di `tests/docs.test.ts`. I test controllano che il documento sia valido, che ogni operazione documentata, chiamata sul router vero con un token e id reali, risponda con uno degli status elencati (mai 404 con id reali, 405 o 500), che gli id sconosciuti diano 404 e che le rotte admin rispondano 401 senza token. Non possono accorgersi di una rotta che nessuno ha documentato. Un nuovo router admin non verifica il token da solo: riceve la sessione già verificata da `src/app.ts` come ultimo parametro e la controlla con `hasSession(res, session)`.

## Checklist di deploy

- **Stesso dominio registrabile.** Il cookie di refresh è `HttpOnly` e `SameSite=Strict` con percorso `/api/admin/auth`: front end e API devono stare sullo stesso dominio registrabile (per esempio `www.esempio.it` e `api.esempio.it`), altrimenti il browser non lo invia.
- **HTTPS e `COOKIE_SECURE`.** Dietro HTTPS `COOKIE_SECURE` deve restare `true`: non impostarlo a `false` in produzione.
- **Proxy e `TRUST_PROXY_HOPS`.** Impostalo al numero di proxy che stanno davanti all'app. L'indirizzo del client è la voce di `X-Forwarded-For` contando dalla destra, aggiunta dal proxy più esterno di cui ti fidi; le voci più a sinistra le sceglie il client. Controlla il formato di `X-Forwarded-For` del tuo host: ogni proxy deve accodare l'indirizzo da cui ha ricevuto la richiesta. Con un valore troppo alto un client può falsificare il proprio indirizzo; con `0` dietro un proxy tutti i client condividono l'indirizzo del proxy e il limite per IP sui login li blocca insieme.
- **CORS.** Elenca esplicitamente in `CORS_ORIGINS` le origini del front end, con schema e porta. Il default serve solo allo sviluppo locale.
- **Storage dei media.** Oggi usa l'API S3 (`@aws-sdk/client-s3`, in `src/plugins/media.ts`). La scelta del provider è ancora aperta, probabilmente Azure Blob: in quel caso il modulo va adattato. Con un bucket S3 il bucket deve avere una regola CORS che ammetta il metodo `PUT` dall'origine del front end e l'header `Content-Type`, perché il browser carica il file direttamente. Le URL pubbliche hanno la forma `<MEDIA_PUBLIC_BASE_URL>/<bucket>/<chiave>`.
- **Una sola istanza.** Il limite sui tentativi di login è in memoria nel processo: con più istanze ogni processo avrebbe il proprio conteggio. Esegui una sola istanza.
- **Segreti.** Non committare `.env`. Genera `JWT_SECRET` con il comando indicato in `.env.example` e scegli una password lunga per il superuser.
