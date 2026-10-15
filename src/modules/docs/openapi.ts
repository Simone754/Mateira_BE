/**
 * OpenAPI description of the whole API, served at /openapi.json and shown by Swagger UI at /docs.
 *
 * It is written by hand, so it must be updated together with the routes: every new endpoint goes here
 * (tests/docs.test.ts calls every documented operation on the real router and fails when one stops answering with a
 * status listed here, but it cannot notice a route nobody documented).
 * Technical names, enums and error strings follow the code; descriptions are in Italian.
 */

import { WORD_PAGES } from "../words/dto";
import { WORD_SEEDS } from "../words/seedData";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ $ref: `#/components/responses/${name}` });
const json = (schema: object, extra: object = {}) => ({ "application/json": { schema, ...extra } });
const bearer = [{ bearerAuth: [] }];

/** An error answer with its own explanation and a sample `error` message. */
const errorResponse = (description: string, example: string) => ({
  description,
  content: json(ref("Error"), { example: { error: example } }),
});

const pageOf = (itemSchema: string, description: string) => ({
  type: "object",
  description,
  required: ["items", "page", "limit", "total"],
  properties: {
    items: { type: "array", items: ref(itemSchema) },
    page: { type: "integer", minimum: 1, description: "Pagina restituita (parte da 1).", example: 1 },
    limit: { type: "integer", minimum: 1, description: "Elementi per pagina effettivamente usati.", example: 20 },
    total: { type: "integer", minimum: 0, description: "Elementi totali che rispettano i filtri.", example: 42 },
  },
});

const limitParameter = (defaultValue: number, max: number) => ({
  name: "limit",
  in: "query",
  required: false,
  description: `Elementi per pagina. Un valore fuori scala viene riportato a 1 o a ${max}; se non è un numero vale ${defaultValue}.`,
  schema: { type: "integer", minimum: 1, maximum: max, default: defaultValue },
});

const MEDIA_ID = "3f2b8c1e-5d4a-4e7b-9a60-1c2d3e4f5a6b";
const NEWS_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const BLOCK_ID = "b5f1c0de-2a7e-4c3b-8d19-6e0a4f7c2d38";
const OTHER_BLOCK_ID = "0b1f6a52-8c3d-4d5e-b7a1-2e9f4c6d8a10";
const WORD_ID = "4a7d2c9e-3b1f-4e8a-9c6d-5f0e1a2b3c4d";
const fondazione = WORD_SEEDS.find((word) => word.term === "Fondazione")!;
const viaggio = WORD_SEEDS.find((word) => word.term === "Viaggio")!;

const wordPublicExample = {
  id: WORD_ID,
  term: fondazione.term,
  etymology: fondazione.etymology,
  meaning: fondazione.meaning,
  closing: fondazione.closing,
  page: fondazione.page,
};

/** The 400 answer of a `page` filter outside the list: the same message for the public and the admin list. */
const PAGE_FILTER_ERROR = `page must be one of: ${WORD_PAGES.join(", ")}`;

const WORD_TEXT_RULES =
  "Regole dei testi `etymology`, `meaning` e `closing`: testo semplice, una riga vuota separa i paragrafi, una riga singola va a capo. " +
  "Gli spazi ai bordi vengono tolti e i fine riga `\\r\\n` e `\\r` diventano `\\n` prima di misurare la lunghezza. " +
  "Il `term` invece è una sola riga: un a capo al suo interno è un 400.";
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,9})?)?(Z|[+-]\\d{2}:\\d{2})?)?$";

const refreshCookieNote =
  "Il refresh token è nel cookie `mateira_refresh` (HttpOnly, SameSite=Strict, percorso `/api/admin/auth`): " +
  "Swagger UI non può leggerlo né impostarlo, ma il browser lo invia da solo perché `/docs` è servita dalla stessa origine dell'API. " +
  "In sviluppo su http serve `COOKIE_SECURE=false`, altrimenti il browser rifiuta il cookie.";

/** The fields of a news that can be written, shared by the create and the update bodies. */
const newsWritableProperties = {
  title: { type: "string", maxLength: 200, description: "Titolo (spazi ai bordi tolti).", example: "Nuovo laboratorio di ricerca" },
  slug: {
    type: "string",
    nullable: true,
    maxLength: 100,
    description:
      "Indirizzo della news. Se manca si ricava dal titolo. Viene normalizzato e reso univoco con un suffisso (`-2`, `-3`, ...). " +
      "In modifica, `null` o vuoto lasciano lo slug com'è.",
    example: "nuovo-laboratorio-di-ricerca",
  },
  date: {
    type: "string",
    pattern: DATE_PATTERN,
    description: "Data della news in formato ISO 8601: `2026-10-14` oppure `2026-10-14T09:30:00Z`.",
    example: "2026-10-14T09:30:00Z",
  },
  category: ref("NewsCategory"),
  body: {
    type: "string",
    maxLength: 50000,
    description: "Testo semplice: i paragrafi sono separati da una riga vuota.",
    example: "Primo paragrafo della news.\n\nSecondo paragrafo, dopo una riga vuota.",
  },
  author: { type: "string", nullable: true, maxLength: 120, description: "Autore. `null` o vuoto lo cancellano.", example: "Redazione Mateira" },
  externalLinks: {
    type: "array",
    maxItems: 10,
    items: ref("ExternalLink"),
    description: "Link esterni (massimo 10). In modifica sostituisce l'elenco intero.",
  },
  imageId: {
    type: "string",
    format: "uuid",
    nullable: true,
    description: "Id di un media già registrato, usato come immagine di copertina. In modifica `null` la toglie.",
  },
  attachmentIds: {
    type: "array",
    maxItems: 10,
    items: { type: "string", format: "uuid" },
    description: "Id dei media allegati (massimo 10, i doppioni sono ignorati). In modifica sostituisce l'elenco intero.",
  },
  status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, una nuova news è `DRAFT`." },
};

/**
 * A reference that may also be null. In OpenAPI 3.0.3 `nullable` next to `allOf` or `$ref` does not allow null (the
 * referenced schema still has to match), so the null is a branch of its own.
 */
const nullableRef = (name: string, description: string) => ({
  description,
  anyOf: [ref(name), { type: "object", nullable: true, enum: [null] }],
});

/** The rules of a link, repeated in every field that holds one. */
const HREF_RULES =
  "Percorso interno che inizia con una sola `/` (per esempio `/come-lavoriamo`, senza spazi, al massimo 300 caratteri) " +
  "oppure indirizzo `http` o `https` valido (al massimo 500 caratteri) senza nome utente né password. " +
  "Viene salvato come lo scrive il parser degli indirizzi: i segmenti `.` e `..` sono risolti e i caratteri che potrebbero " +
  "uscire da un attributo HTML (virgolette, apice, `<`, `>`, backtick) sono codificati con `%`; un percorso semplice resta uguale. " +
  "Sono rifiutati `javascript:`, `data:`, `mailto:`, gli indirizzi che iniziano con `//` (anche quelli che i segmenti `.` riportano a `//`) " +
  "e quelli con spazi, backslash, caratteri di controllo o non validi.";

const hrefProperty = (description: string, extra: object = {}) => ({
  type: "string",
  maxLength: 500,
  description: `${description} ${HREF_RULES}`,
  example: "/come-lavoriamo",
  ...extra,
});

const homeContentRules = [
  "Tipi di blocco e campi di `content` (un campo non previsto per il tipo è rifiutato con 400 e il messaggio ne indica il nome):",
  "",
  "| Tipo | Campi |",
  "| --- | --- |",
  "| `HERO` | `title` (obbligatorio, max 200), `text` (max 600), `primaryCta` (obbligatorio), `secondaryCta` |",
  "| `TICKER` | `items`: da 1 a 10 elementi `{ text (max 160), href }`, `href` facoltativo |",
  "| `CTA` | `title` (obbligatorio, max 200), `text` (max 400), `cta` (obbligatorio) |",
  "| `FEATURED` | `title` (obbligatorio, max 120), `items`: da 1 a 6 schede `{ title (max 160), text (max 300), href, imageId }`, `href` obbligatorio |",
  "",
  "`primaryCta`, `secondaryCta` e `cta` hanno la forma `{ label (obbligatorio, max 60), href }`. " +
    'Le stringhe vengono ripulite dagli spazi ai bordi; un testo facoltativo vuoto o `null` vale "assente" e viene salvato come `null`. ' +
    "`imageId` deve essere l'id di un media esistente che sia un'immagine (non un PDF).",
].join("\n");

const homeCreateExamples = {
  hero: {
    summary: "Blocco HERO",
    value: {
      type: "HERO",
      content: {
        title: "Un'idea di sapere condiviso",
        text: "Ricerca, programmi e viaggi per capire il presente.",
        primaryCta: { label: "Scopri come lavoriamo", href: "/come-lavoriamo" },
        secondaryCta: { label: "Leggi le news", href: "/news" },
      },
      status: "PUBLISHED",
    },
  },
  ticker: {
    summary: "Blocco TICKER",
    value: {
      type: "TICKER",
      content: {
        items: [
          { text: "Aperte le iscrizioni al laboratorio di autunno", href: "/news/laboratorio-autunno" },
          { text: "Nuovo bando di ricerca in uscita" },
          { text: "Seguici sul sito del progetto", href: "https://www.example.org/progetto" },
        ],
      },
    },
  },
  cta: {
    summary: "Blocco CTA",
    value: {
      type: "CTA",
      content: {
        title: "Sostieni il progetto",
        text: "Ogni contributo conta.",
        cta: { label: "Dona ora", href: "https://example.org/dona" },
      },
    },
  },
  featured: {
    summary: "Blocco FEATURED con un'immagine",
    value: {
      type: "FEATURED",
      content: {
        title: "In evidenza",
        items: [
          {
            title: "Nuovo laboratorio di ricerca",
            text: "Aperte le iscrizioni.",
            href: "/news/nuovo-laboratorio-di-ricerca",
            imageId: MEDIA_ID,
          },
          { title: "Il programma di autunno", href: "/programmi" },
        ],
      },
    },
  },
};

const homePublicExample = {
  blocks: [
    {
      id: BLOCK_ID,
      type: "CTA",
      content: { title: "Sostieni il progetto", text: null, cta: { label: "Dona ora", href: "https://example.org/dona" } },
    },
    {
      id: OTHER_BLOCK_ID,
      type: "FEATURED",
      content: {
        title: "In evidenza",
        items: [
          {
            title: "Nuovo laboratorio di ricerca",
            text: "Aperte le iscrizioni.",
            href: "/news/nuovo-laboratorio-di-ricerca",
            image: {
              id: MEDIA_ID,
              url: `http://localhost:9100/mateira-media/media/2026/${MEDIA_ID}.jpg`,
              alt: "Il laboratorio Mateira visto dall'alto",
            },
          },
          { title: "Il programma di autunno", text: null, href: "/programmi", image: null },
        ],
      },
    },
  ],
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Mateira API",
    version: "1.0.0",
    description: [
      "API del backend di **Mateira**: news, blocchi della Home e parole di MATEIRA pubblici, media e area riservata al superuser.",
      "",
      "## Come autenticarsi",
      "",
      "1. Apri `POST /api/admin/auth/login`, inserisci email e password del superuser e premi *Execute*. " +
        "Il token di accesso viene applicato da solo al lucchetto *Authorize* (lo vedrai chiuso).",
      "2. Prova qualsiasi rotta con il lucchetto, per esempio `GET /api/admin/auth/me`.",
      "",
      "Il token scade dopo `expiresIn` secondi (default 1 ora): esegui `POST /api/admin/auth/refresh` per ottenerne uno nuovo. " +
        "Il refresh usa il cookie `mateira_refresh`, che il login imposta e il browser invia da solo.",
      "",
      "Le rotte `/api/admin/*` richiedono l'header `Authorization: Bearer <token>`, tranne login, refresh e logout. " +
        "`/api/health` e `/api/public/*` sono pubbliche.",
      "",
      "## Errori",
      "",
      'Gli errori sono sempre JSON nella forma `{ "error": "messaggio" }`, con i messaggi in inglese. ' +
        'Un errore imprevisto risponde 500 con `{ "error": "Internal server error" }`.',
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Lo stesso host che serve questa documentazione" }],
  tags: [
    { name: "Sistema", description: "Stato del servizio." },
    { name: "Autenticazione", description: "Login, rinnovo e chiusura della sessione del superuser." },
    { name: "Media", description: "Immagini e PDF, solo per l'amministratore. Il file viene caricato direttamente sullo storage." },
    { name: "News (admin)", description: "Gestione completa delle news, bozze comprese. Richiede il token." },
    { name: "News (pubbliche)", description: "Le sole news pubblicate, senza autenticazione." },
    {
      name: "Home (admin)",
      description:
        "Blocchi della Home (hero, ticker, inviti all'azione, schede in evidenza): crea, modifica, riordina, nascondi (bozza) e cancella. Richiede il token.",
    },
    { name: "Home (pubblica)", description: "I blocchi pubblicati della Home, già in ordine, senza autenticazione." },
    {
      name: "Parole (admin)",
      description:
        "Le parole di MATEIRA (termine, etimologia, significato, frase conclusiva), collocate per pagina: crea, modifica, sposta, nascondi (bozza) e cancella. Richiede il token.",
    },
    { name: "Parole (pubblica)", description: "Le parole pubblicate, pagina per pagina e in ordine, senza autenticazione." },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Sistema"],
        operationId: "healthCheck",
        summary: "Stato del servizio",
        description: "Risponde 200 se il database risponde, 503 altrimenti.",
        responses: {
          "200": {
            description: "Il servizio e il database funzionano.",
            content: json(ref("HealthStatus"), { example: { status: "ok" } }),
          },
          "503": {
            description: "Il database non risponde.",
            content: json(ref("HealthStatus"), { example: { status: "degraded" } }),
          },
        },
      },
    },

    "/api/admin/auth/login": {
      post: {
        tags: ["Autenticazione"],
        operationId: "login",
        summary: "Login del superuser",
        description:
          "Restituisce il token di accesso e imposta il cookie di refresh `mateira_refresh`. " +
          "In Swagger UI il token viene applicato da solo al lucchetto *Authorize*. " +
          "I tentativi sono limitati per coppia indirizzo IP + email e per indirizzo IP (default 5 ogni 15 minuti per email): " +
          "oltre il limite la risposta è 429 con `Retry-After`. La password viene usata esattamente come inviata.",
        requestBody: {
          required: true,
          content: json(ref("LoginRequest"), {
            example: { email: "admin@mateira.local", password: "inserisci-la-tua-password" },
          }),
        },
        responses: {
          "200": {
            description: "Credenziali corrette.",
            headers: {
              "Set-Cookie": {
                description: "Cookie `mateira_refresh` (HttpOnly, SameSite=Strict) con il refresh token.",
                schema: { type: "string" },
              },
            },
            content: json(ref("AuthResponse")),
          },
          "400": errorResponse(
            "Body non valido: JSON non valido o non un oggetto, email o password mancanti o troppo lunghe.",
            "password is required",
          ),
          "401": errorResponse("Email o password sbagliate.", "Invalid credentials"),
          "413": response("PayloadTooLarge"),
          "429": response("TooManyRequests"),
        },
      },
    },

    "/api/admin/auth/refresh": {
      post: {
        tags: ["Autenticazione"],
        operationId: "refreshToken",
        summary: "Rinnova il token di accesso",
        description:
          "Scambia il refresh token con un nuovo token di accesso e ruota il cookie. " +
          `${refreshCookieNote} ` +
          "Ogni refresh token si usa una volta sola: presentarne uno già usato revoca tutte le sessioni dell'utente. " +
          "In Swagger UI il nuovo token viene applicato da solo al lucchetto *Authorize*.",
        responses: {
          "200": {
            description: "Nuovo token di accesso.",
            headers: {
              "Set-Cookie": {
                description: "Cookie `mateira_refresh` ruotato, con il nuovo refresh token.",
                schema: { type: "string" },
              },
            },
            content: json(ref("AuthResponse")),
          },
          "401": errorResponse(
            "Cookie assente, token sconosciuto, scaduto o già usato. Quando il cookie c'era, la risposta lo cancella.",
            "Unauthorized",
          ),
        },
      },
    },

    "/api/admin/auth/logout": {
      post: {
        tags: ["Autenticazione"],
        operationId: "logout",
        summary: "Chiude la sessione",
        description:
          "Revoca il refresh token e cancella il cookie. Risponde 204 anche senza cookie. " +
          `${refreshCookieNote} Il token di accesso già emesso resta valido fino alla scadenza.`,
        responses: {
          "204": {
            description: "Sessione chiusa, nessun contenuto.",
            headers: {
              "Set-Cookie": {
                description: "Cookie `mateira_refresh` svuotato (`Max-Age=0`).",
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },

    "/api/admin/auth/me": {
      get: {
        tags: ["Autenticazione"],
        operationId: "getCurrentUser",
        summary: "Utente autenticato",
        description: "Restituisce l'utente a cui appartiene il token di accesso.",
        security: bearer,
        responses: {
          "200": { description: "L'utente autenticato.", content: json(ref("MeResponse")) },
          "401": response("Unauthorized"),
        },
      },
    },

    "/api/admin/media/presign": {
      post: {
        tags: ["Media"],
        operationId: "createMediaUpload",
        summary: "Registra un media e ottiene l'URL di upload",
        description: [
          "Crea la riga del media e restituisce un URL firmato: il file si carica poi con una richiesta `PUT` " +
            "direttamente sullo storage, con gli header indicati in `headers` e il corpo uguale al file. " +
            "Il file non passa da questa API.",
          "",
          "Tipi ammessi: `image/jpeg`, `image/png`, `image/webp` (massimo 15 MB, 15728640 byte, testo `alt` obbligatorio) " +
            "e `application/pdf` (massimo 25 MB, 26214400 byte, `alt` facoltativo). " +
            "Il `Content-Type` e la dimensione dichiarati sono vincolati dalla firma.",
          "",
          "Se lo storage non è configurato risponde 503.",
        ].join("\n"),
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("PresignRequest"), {
            examples: {
              immagine: {
                summary: "Immagine (alt obbligatorio)",
                value: { contentType: "image/jpeg", size: 245760, alt: "Il laboratorio Mateira visto dall'alto" },
              },
              pdf: {
                summary: "PDF (alt facoltativo)",
                value: { contentType: "application/pdf", size: 1048576 },
              },
            },
          }),
        },
        responses: {
          "200": { description: "Media registrato e URL di upload pronto.", content: json(ref("PresignResponse")) },
          "400": errorResponse(
            "Body non valido: tipo non ammesso, dimensione fuori limite o `alt` mancante per un'immagine.",
            "unsupported content type",
          ),
          "401": response("Unauthorized"),
          "413": response("PayloadTooLarge"),
          "503": errorResponse("Lo storage dei media non è configurato.", "media storage not configured"),
        },
      },
    },

    "/api/admin/media": {
      get: {
        tags: ["Media"],
        operationId: "listMedia",
        summary: "Elenco dei media",
        description: "Dal più recente. Per ogni media restituisce anche l'indirizzo pubblico, se configurato.",
        security: bearer,
        parameters: [limitParameter(20, 50), { $ref: "#/components/parameters/Page" }],
        responses: {
          "200": { description: "Una pagina di media.", content: json(ref("MediaPage")) },
          "401": response("Unauthorized"),
        },
      },
    },

    "/api/admin/media/{id}": {
      patch: {
        tags: ["Media"],
        operationId: "updateMedia",
        summary: "Modifica il testo alternativo",
        description:
          "Cambia `alt`. Per le immagini non può essere vuoto; per i PDF `null` o vuoto lo cancellano.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("MediaUpdateRequest"), { example: { alt: "Ingresso del laboratorio Mateira" } }),
        },
        responses: {
          "200": { description: "Il media aggiornato.", content: json(ref("MediaDto")) },
          "400": errorResponse(
            "Body non valido: `alt` assente, non testo, troppo lungo o vuoto per un'immagine.",
            "alt is required for images",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Media"],
        operationId: "deleteMedia",
        summary: "Elimina un media",
        description:
          "Elimina la riga e tenta di eliminare anche il file dallo storage (se fallisce la riga è comunque eliminata). " +
          "Le news che lo usavano perdono la copertina o l'allegato.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Media eliminato, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/admin/news": {
      get: {
        tags: ["News (admin)"],
        operationId: "listNewsAdmin",
        summary: "Elenco delle news",
        description: "Tutte le news, bozze comprese, dalla data più recente. I filtri si combinano.",
        security: bearer,
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            description: "Solo le news in questo stato.",
            schema: ref("ContentStatus"),
          },
          { $ref: "#/components/parameters/Category" },
          limitParameter(20, 100),
          { $ref: "#/components/parameters/Page" },
        ],
        responses: {
          "200": { description: "Una pagina di news.", content: json(ref("NewsAdminPage")) },
          "400": errorResponse("`status` o `category` non è uno dei valori ammessi.", "status must be one of: DRAFT, PUBLISHED"),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["News (admin)"],
        operationId: "createNews",
        summary: "Crea una news",
        description:
          "Crea una news, per default in bozza (`DRAFT`). Con `status` `PUBLISHED` la news è subito pubblica e `publishedAt` è l'ora attuale. " +
          "`imageId` e `attachmentIds` devono essere id di media già registrati (vedi `POST /api/admin/media/presign`).",
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("NewsCreateRequest"), {
            examples: {
              completa: {
                summary: "Tutti i campi",
                value: {
                  title: "Nuovo laboratorio di ricerca",
                  slug: "nuovo-laboratorio-di-ricerca",
                  date: "2026-10-14T09:30:00Z",
                  category: "RICERCA",
                  body: "Primo paragrafo della news.\n\nSecondo paragrafo, dopo una riga vuota.",
                  author: "Redazione Mateira",
                  externalLinks: [{ label: "Sito del progetto", url: "https://www.example.org/progetto" }],
                  imageId: null,
                  attachmentIds: [],
                  status: "DRAFT",
                },
              },
              minima: {
                summary: "Solo i campi obbligatori",
                value: {
                  title: "Incontro con le scuole",
                  date: "2026-11-05",
                  category: "INCONTRI",
                  body: "Il programma dell'incontro.",
                },
              },
            },
          }),
        },
        responses: {
          "201": { description: "News creata.", content: json(ref("NewsAdmin")) },
          "400": errorResponse(
            "Body non valido: campo mancante o fuori limite, link non http/https, oppure un media indicato non esiste.",
            "title is required",
          ),
          "401": response("Unauthorized"),
          "409": response("SlugConflict"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/news/{id}": {
      get: {
        tags: ["News (admin)"],
        operationId: "getNewsAdmin",
        summary: "Dettaglio di una news",
        description: "Tutti i campi, anche per le bozze.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "La news.", content: json(ref("NewsAdmin")) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["News (admin)"],
        operationId: "updateNews",
        summary: "Modifica una news",
        description:
          "Modifica parziale: cambiano solo i campi presenti nel body. `imageId: null` toglie la copertina; " +
          "`attachmentIds` ed `externalLinks` sostituiscono l'elenco intero. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira la news dal pubblico ma conserva la data.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("NewsUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica una bozza", value: { status: "PUBLISHED" } },
              modifica: {
                summary: "Cambia titolo e autore",
                value: { title: "Nuovo laboratorio di ricerca, aperte le iscrizioni", author: null },
              },
            },
          }),
        },
        responses: {
          "200": { description: "La news aggiornata.", content: json(ref("NewsAdmin")) },
          "400": errorResponse(
            "Body non valido: campo fuori limite o con un valore non ammesso, oppure un media indicato non esiste.",
            "image or attachment not found",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "409": response("SlugConflict"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["News (admin)"],
        operationId: "deleteNews",
        summary: "Elimina una news",
        description: "Elimina la news. I media collegati restano.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "News eliminata, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/public/news": {
      get: {
        tags: ["News (pubbliche)"],
        operationId: "listNewsPublic",
        summary: "News pubblicate",
        description: "Solo le news `PUBLISHED`, dalla data più recente. Il campo `excerpt` è l'inizio del testo.",
        parameters: [{ $ref: "#/components/parameters/Category" }, limitParameter(12, 50), { $ref: "#/components/parameters/Page" }],
        responses: {
          "200": { description: "Una pagina di news pubblicate.", content: json(ref("NewsPublicPage")) },
          "400": errorResponse("`category` non è una delle categorie ammesse.", "category must be one of: MATEIRA, RICERCA, PROGRAMMI, VIAGGIO_TIRENAUTI, INCONTRI, COLLABORAZIONI, APPUNTAMENTI, PRESS, COMUNICATI"),
        },
      },
    },

    "/api/public/news/{slug}": {
      get: {
        tags: ["News (pubbliche)"],
        operationId: "getNewsPublic",
        summary: "Dettaglio di una news pubblicata",
        description: "Testo completo, allegati e link esterni. Le bozze e gli slug sconosciuti rispondono 404.",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Slug della news, come nel campo `slug` dell'elenco.",
            schema: { type: "string" },
            example: "nuovo-laboratorio-di-ricerca",
          },
        ],
        responses: {
          "200": { description: "La news pubblicata.", content: json(ref("NewsPublicDetail")) },
          "404": response("NotFound"),
        },
      },
    },

    "/api/public/home": {
      get: {
        tags: ["Home (pubblica)"],
        operationId: "getHomePublic",
        summary: "Blocchi pubblicati della Home",
        description:
          "Solo i blocchi `PUBLISHED`, già in ordine (posizione, poi data di creazione, poi id). " +
          "Ogni blocco è `{ id, type, content }`: nessun campo amministrativo (stato, posizione, date). " +
          "Nel `content` dei blocchi `FEATURED` ogni scheda ha `image` (`id`, `url`, `alt`) al posto di `imageId`; " +
          "`image` è `null` se la scheda non ha immagine o se il media è stato cancellato. " +
          "Senza blocchi pubblicati `blocks` è una lista vuota. I testi facoltativi assenti sono `null`.",
        responses: {
          "200": {
            description: "I blocchi pubblicati, in ordine.",
            content: json(ref("HomePublicResponse"), { example: homePublicExample }),
          },
        },
      },
    },

    "/api/admin/home-blocks": {
      get: {
        tags: ["Home (admin)"],
        operationId: "listHomeBlocks",
        summary: "Elenco dei blocchi della Home",
        description:
          "Tutti i blocchi, bozze comprese, in ordine (posizione, poi data di creazione, poi id), con stato, posizione e date. " +
          "Nelle schede `FEATURED` l'immagine è risolta in `image`, come nella risposta pubblica; per riscrivere una scheda l'id del media è in `image.id`.",
        security: bearer,
        responses: {
          "200": { description: "I blocchi, in ordine.", content: json(ref("HomeBlockList")) },
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Home (admin)"],
        operationId: "createHomeBlock",
        summary: "Crea un blocco della Home",
        description: [
          "Crea un blocco in fondo alla Home (`position` = massimo attuale più uno), per default in bozza (`DRAFT`). " +
            "Con `status` `PUBLISHED` il blocco è subito pubblico e `publishedAt` è l'ora attuale. " +
            "Nel body sono ammessi solo `type`, `content` e `status`; il tipo non cambia più dopo la creazione.",
          "",
          homeContentRules,
          "",
          "Due creazioni simultanee possono avere la stessa posizione: l'ordine di lettura resta stabile (data di creazione, poi id).",
        ].join("\n"),
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("HomeBlockCreateRequest"), { examples: homeCreateExamples }),
        },
        responses: {
          "201": { description: "Blocco creato.", content: json(ref("HomeBlockAdmin")) },
          "400": errorResponse(
            "Body non valido: tipo o stato non ammessi, campo mancante, fuori limite o non previsto per il tipo, link non valido, " +
              "oppure `imageId` che non è un media esistente o non è un'immagine.",
            'content.primaryCta.href must be a path starting with a single "/" or an http(s) address',
          ),
          "401": response("Unauthorized"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/home-blocks/order": {
      put: {
        tags: ["Home (admin)"],
        operationId: "reorderHomeBlocks",
        summary: "Riordina i blocchi della Home",
        description:
          "`ids` deve contenere esattamente tutti gli id dei blocchi esistenti (bozze comprese), ciascuno una volta, nell'ordine voluto. " +
          "Le posizioni vengono riscritte come 0, 1, 2... in una sola transazione e la risposta è l'elenco aggiornato. " +
          "Con un id mancante, sconosciuto, ripetuto o non valido la risposta è 400 e nulla cambia. " +
          "Se un blocco viene cancellato mentre l'ordine si scrive la risposta è 409 e nulla cambia: ricarica l'elenco e riprova. " +
          "Un blocco creato mentre il riordino è in corso non è un errore e viene conservato, ma non faceva parte della richiesta: " +
          "la sua posizione finale non è garantita (di solito è l'ultima, ma con posizioni uguali può finire prima degli altri).",
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("HomeBlockOrderRequest"), {
            example: { ids: [BLOCK_ID, OTHER_BLOCK_ID, "d3a9e7b4-61c2-4f08-9a5d-7b8c1e2f3a46"] },
          }),
        },
        responses: {
          "200": { description: "L'elenco aggiornato, nel nuovo ordine.", content: json(ref("HomeBlockList")) },
          "400": errorResponse(
            "Body non valido: `ids` non è una lista di uuid, ha doppioni, oppure non coincide con l'insieme dei blocchi esistenti.",
            "ids must list every existing block exactly once",
          ),
          "401": response("Unauthorized"),
          "409": errorResponse(
            "Un blocco è stato cancellato mentre l'ordine veniva scritto (o due transazioni si sono scontrate): nulla è cambiato.",
            "a block was deleted while the order was being saved: reload the list",
          ),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/home-blocks/{id}": {
      get: {
        tags: ["Home (admin)"],
        operationId: "getHomeBlock",
        summary: "Dettaglio di un blocco",
        description: "Tutti i campi, anche per le bozze.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "Il blocco.", content: json(ref("HomeBlockAdmin")) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Home (admin)"],
        operationId: "updateHomeBlock",
        summary: "Modifica un blocco",
        description: [
          "Cambia `content` e/o `status`; serve almeno uno dei due. Il `content` viene **sostituito per intero** " +
            "e riconvalidato per il tipo del blocco: le parti facoltative non inviate diventano `null`. " +
            "`type` non è ammesso (400) e nemmeno `position`, `id` o le date: l'ordine si cambia con `PUT /api/admin/home-blocks/order`.",
          "",
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira il blocco dal pubblico " +
            "ma conserva la data, che non cambia alle pubblicazioni successive.",
          "",
          homeContentRules,
        ].join("\n"),
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("HomeBlockUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica un blocco", value: { status: "PUBLISHED" } },
              nascondi: { summary: "Riporta un blocco in bozza", value: { status: "DRAFT" } },
              sostituisci: {
                summary: "Sostituisce il contenuto di un blocco CTA",
                value: {
                  content: {
                    title: "Sostieni la ricerca",
                    text: "Ogni contributo finanzia un laboratorio.",
                    cta: { label: "Dona ora", href: "https://example.org/dona" },
                  },
                },
              },
            },
          }),
        },
        responses: {
          "200": { description: "Il blocco aggiornato.", content: json(ref("HomeBlockAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, `type` o altri campi non ammessi, `status` non ammesso, " +
              "contenuto non valido per il tipo del blocco, oppure `imageId` che non è un'immagine esistente.",
            "type cannot be changed",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Home (admin)"],
        operationId: "deleteHomeBlock",
        summary: "Elimina un blocco",
        description:
          "Elimina il blocco. Le posizioni degli altri non cambiano (l'ordine resta valido) e i media delle schede restano. " +
          "Con richieste simultanee una sola risponde 204, le altre 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Blocco eliminato, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/public/words": {
      get: {
        tags: ["Parole (pubblica)"],
        operationId: "listWordsPublic",
        summary: "Parole pubblicate",
        description:
          "Solo le parole `PUBLISHED`. Con `page` restituisce quelle di una pagina, in ordine (posizione, poi data di creazione, poi id); " +
          "senza `page` tutte, ordinate per pagina (nell'ordine dell'elenco `WordPage`) e poi per posizione. " +
          "Ogni parola è `{ id, term, etymology, meaning, closing, page }`: nessun campo amministrativo (stato, posizione, date). " +
          "`closing` è `null` se la parola non ha frase conclusiva. Senza parole pubblicate `words` è una lista vuota.",
        parameters: [{ $ref: "#/components/parameters/WordPageFilter" }],
        responses: {
          "200": {
            description: "Le parole pubblicate, in ordine.",
            content: json(ref("WordPublicList"), { example: { words: [wordPublicExample] } }),
          },
          "400": errorResponse("`page` non è una delle pagine ammesse (anche se vuoto).", PAGE_FILTER_ERROR),
        },
      },
    },

    "/api/admin/words": {
      get: {
        tags: ["Parole (admin)"],
        operationId: "listWords",
        summary: "Elenco delle parole",
        description:
          "Tutte le parole, bozze comprese, con posizione, stato e date. Stesso ordine dell'elenco pubblico; con `page` solo quelle di una pagina.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/WordPageFilter" }],
        responses: {
          "200": { description: "Le parole, in ordine.", content: json(ref("WordAdminList")) },
          "400": errorResponse("`page` non è una delle pagine ammesse (anche se vuoto).", PAGE_FILTER_ERROR),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Parole (admin)"],
        operationId: "createWord",
        summary: "Crea una parola",
        description:
          "Crea una parola, per default in bozza (`DRAFT`). Senza `position` va in fondo alla sua pagina " +
          "(massimo attuale più uno, al massimo 9999). Con `status` `PUBLISHED` è subito pubblica e `publishedAt` è l'ora attuale. " +
          "Un campo non previsto è rifiutato con 400. La stessa pagina non può avere due parole con lo stesso termine (409). " +
          WORD_TEXT_RULES,
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("WordCreateRequest"), {
            examples: {
              completa: {
                summary: "Una parola pubblicata, con frase conclusiva",
                value: {
                  term: fondazione.term,
                  etymology: fondazione.etymology,
                  meaning: fondazione.meaning,
                  closing: fondazione.closing,
                  page: fondazione.page,
                  status: "PUBLISHED",
                },
              },
              minima: {
                summary: "Solo i campi obbligatori (bozza, in fondo alla pagina, senza frase conclusiva)",
                value: { term: viaggio.term, etymology: viaggio.etymology, meaning: viaggio.meaning, page: viaggio.page },
              },
            },
          }),
        },
        responses: {
          "201": { description: "Parola creata.", content: json(ref("WordAdmin")) },
          "400": errorResponse(
            "Body non valido: campo obbligatorio mancante o vuoto, fuori limite, non previsto, termine su più righe, pagina o stato non ammessi, " +
              "posizione fuori scala oppure caratteri che non si possono salvare.",
            "term is required",
          ),
          "401": response("Unauthorized"),
          "409": response("DuplicateWord"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/words/{id}": {
      get: {
        tags: ["Parole (admin)"],
        operationId: "getWord",
        summary: "Dettaglio di una parola",
        description: "Tutti i campi, anche per le bozze.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "La parola.", content: json(ref("WordAdmin")) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Parole (admin)"],
        operationId: "updateWord",
        summary: "Modifica una parola",
        description:
          "Cambia uno o più campi; quelli non inviati restano com'erano. `closing: null` (o vuoto) toglie la frase conclusiva. " +
          "Spostata su un'altra pagina senza `position`, la parola va in fondo alla nuova pagina. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira la parola dal pubblico ma conserva la data. " +
          "Rinominarla o spostarla su una pagina che ha già lo stesso termine risponde 409 e non cambia nulla. " +
          WORD_TEXT_RULES,
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("WordUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica una parola", value: { status: "PUBLISHED" } },
              sposta: { summary: "Sposta una parola su un'altra pagina, in fondo", value: { page: "programmi" } },
              correggi: {
                summary: "Corregge il significato e toglie la frase conclusiva",
                value: { meaning: "Fondare significa partire da basi solide.", closing: null },
              },
            },
          }),
        },
        responses: {
          "200": { description: "La parola aggiornata.", content: json(ref("WordAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, campo non previsto, testo obbligatorio vuoto, fuori limite o su più righe (`term`), " +
              "pagina, posizione o stato non ammessi oppure caratteri che non si possono salvare.",
            "nothing to change",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "409": response("DuplicateWord"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Parole (admin)"],
        operationId: "deleteWord",
        summary: "Elimina una parola",
        description: "Elimina la parola. Con richieste simultanee una sola risponde 204, le altre 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Parola eliminata, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Token di accesso del superuser, nel campo `accessToken` della risposta di login e refresh. " +
          "Eseguendo il login da Swagger UI viene applicato in automatico.",
      },
    },

    parameters: {
      Id: {
        name: "id",
        in: "path",
        required: true,
        description: "Id (uuid) della risorsa. Un valore che non è un uuid risponde 404.",
        schema: { type: "string", format: "uuid" },
      },
      Page: {
        name: "page",
        in: "query",
        required: false,
        description: "Numero di pagina, da 1. Un valore non valido vale 1, uno oltre 10000 vale 10000.",
        schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
      },
      Category: {
        name: "category",
        in: "query",
        required: false,
        description: "Solo le news di questa categoria.",
        schema: ref("NewsCategory"),
      },
      WordPageFilter: {
        name: "page",
        in: "query",
        required: false,
        description:
          "Solo le parole di questa pagina. Senza il parametro, tutte le pagine nell'ordine dell'elenco. " +
          "Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("WordPage"),
      },
    },

    responses: {
      Unauthorized: errorResponse("Token di accesso mancante, non valido, scaduto o non di un superuser.", "Unauthorized"),
      NotFound: errorResponse("Risorsa non trovata (o id non valido).", "Not found"),
      PayloadTooLarge: errorResponse("Il body supera 1 MB (1000000 byte). La connessione viene chiusa.", "payload too large"),
      SlugConflict: errorResponse("Non è stato possibile ricavare uno slug univoco, per esempio per richieste concorrenti.", "could not generate a unique slug"),
      DuplicateWord: errorResponse(
        "Esiste già una parola con questo termine nella stessa pagina (confronto esatto, dopo aver tolto gli spazi ai bordi).",
        "a word with this term already exists on this page",
      ),
      TooManyRequests: {
        description: "Troppi tentativi di login: riprova dopo i secondi indicati in `Retry-After`.",
        headers: {
          "Retry-After": {
            description: "Secondi da attendere prima di riprovare.",
            schema: { type: "integer", minimum: 0 },
          },
        },
        content: json(ref("Error"), { example: { error: "Too many requests" } }),
      },
    },

    schemas: {
      Error: {
        type: "object",
        description: "Forma di tutte le risposte di errore.",
        required: ["error"],
        properties: { error: { type: "string", description: "Messaggio in inglese.", example: "Not found" } },
      },
      HealthStatus: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", enum: ["ok", "degraded"], example: "ok" } },
      },

      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254, description: "Email del superuser (maiuscole ignorate).", example: "admin@mateira.local" },
          password: { type: "string", minLength: 1, maxLength: 200, format: "password", description: "Password del superuser." },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "email", "role"],
        properties: {
          id: { type: "string", format: "uuid", example: "0b1f6a52-8c3d-4d5e-b7a1-2e9f4c6d8a10" },
          email: { type: "string", example: "admin@mateira.local" },
          role: { type: "string", enum: ["SUPERUSER"] },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["accessToken", "expiresIn", "user"],
        properties: {
          accessToken: { type: "string", description: "Token JWT da inviare come `Authorization: Bearer <token>`." },
          expiresIn: { type: "integer", description: "Durata del token in secondi.", example: 3600 },
          user: ref("AuthUser"),
        },
      },
      MeResponse: {
        type: "object",
        required: ["user"],
        properties: { user: ref("AuthUser") },
      },

      MediaDto: {
        type: "object",
        required: ["id", "url", "mimeType", "size", "alt", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid", example: MEDIA_ID },
          url: {
            type: "string",
            nullable: true,
            description: "Indirizzo pubblico del file; `null` se non è configurata la base degli indirizzi pubblici.",
            example: `http://localhost:9100/mateira-media/media/2026/${MEDIA_ID}.jpg`,
          },
          mimeType: { type: "string", example: "image/jpeg" },
          size: { type: "integer", nullable: true, description: "Dimensione in byte.", example: 245760 },
          alt: { type: "string", nullable: true, description: "Testo alternativo.", example: "Il laboratorio Mateira visto dall'alto" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MediaRef: {
        type: "object",
        description: "Riferimento a un media dentro una news.",
        required: ["id", "url", "mimeType", "alt"],
        properties: {
          id: { type: "string", format: "uuid", example: MEDIA_ID },
          url: { type: "string", nullable: true, description: "Indirizzo pubblico del file." },
          mimeType: { type: "string", example: "image/jpeg" },
          alt: { type: "string", nullable: true },
        },
      },
      PresignRequest: {
        type: "object",
        required: ["contentType", "size"],
        properties: {
          contentType: {
            type: "string",
            enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
            description: "Tipo del file (le maiuscole sono ignorate).",
          },
          size: {
            type: "integer",
            minimum: 1,
            maximum: 26214400,
            description: "Dimensione in byte: al massimo 15728640 (15 MB) per le immagini e 26214400 (25 MB) per i PDF.",
          },
          alt: {
            type: "string",
            maxLength: 300,
            description: "Testo alternativo: obbligatorio per le immagini, facoltativo per i PDF.",
          },
        },
      },
      PresignResponse: {
        type: "object",
        required: ["uploadUrl", "method", "headers", "media"],
        properties: {
          uploadUrl: { type: "string", format: "uri", description: "URL firmato dello storage, valido per poco tempo (default 15 minuti)." },
          method: { type: "string", enum: ["PUT"], description: "Metodo da usare per caricare il file." },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Header da inviare con il `PUT`.",
            example: { "Content-Type": "image/jpeg" },
          },
          media: ref("MediaDto"),
        },
      },
      MediaUpdateRequest: {
        type: "object",
        required: ["alt"],
        properties: {
          alt: {
            type: "string",
            nullable: true,
            maxLength: 300,
            description: "Nuovo testo alternativo. Per le immagini non può essere vuoto.",
          },
        },
      },
      MediaPage: pageOf("MediaDto", "Pagina di media."),

      NewsCategory: {
        type: "string",
        enum: [
          "MATEIRA",
          "RICERCA",
          "PROGRAMMI",
          "VIAGGIO_TIRENAUTI",
          "INCONTRI",
          "COLLABORAZIONI",
          "APPUNTAMENTI",
          "PRESS",
          "COMUNICATI",
        ],
        // No example or default here: the schema also types the list filters, and Swagger UI would send it.
        description: "Categoria della news.",
      },
      ContentStatus: {
        type: "string",
        enum: ["DRAFT", "PUBLISHED"],
        description: "`DRAFT` è visibile solo all'amministratore, `PUBLISHED` anche al pubblico.",
      },
      ExternalLink: {
        type: "object",
        required: ["label", "url"],
        properties: {
          label: { type: "string", maxLength: 120, description: "Testo del link.", example: "Sito del progetto" },
          url: { type: "string", format: "uri", maxLength: 500, description: "Indirizzo http o https.", example: "https://www.example.org/progetto" },
        },
      },
      NewsCreateRequest: {
        type: "object",
        required: ["title", "date", "category", "body"],
        properties: newsWritableProperties,
      },
      NewsUpdateRequest: {
        type: "object",
        description: "Tutti i campi sono facoltativi: cambiano solo quelli presenti.",
        properties: newsWritableProperties,
      },
      NewsPublicListItem: {
        type: "object",
        required: ["slug", "title", "date", "category", "excerpt", "author", "image", "publishedAt"],
        properties: {
          slug: { type: "string", example: "nuovo-laboratorio-di-ricerca" },
          title: { type: "string", example: "Nuovo laboratorio di ricerca" },
          date: { type: "string", format: "date-time", example: "2026-10-14T09:30:00.000Z" },
          category: ref("NewsCategory"),
          excerpt: { type: "string", description: "Inizio del testo, al massimo 220 caratteri, su una riga.", example: "Primo paragrafo della news." },
          author: { type: "string", nullable: true, example: "Redazione Mateira" },
          image: nullableRef("MediaRef", "Immagine di copertina, se c'è; altrimenti `null`."),
          publishedAt: { type: "string", format: "date-time", nullable: true, description: "Quando la news è stata pubblicata per la prima volta." },
        },
      },
      NewsPublicDetail: {
        allOf: [
          ref("NewsPublicListItem"),
          {
            type: "object",
            required: ["body", "attachments", "externalLinks"],
            properties: {
              body: { type: "string", description: "Testo semplice: i paragrafi sono separati da una riga vuota." },
              attachments: { type: "array", items: ref("MediaRef") },
              externalLinks: { type: "array", items: ref("ExternalLink") },
            },
          },
        ],
      },
      NewsAdmin: {
        allOf: [
          ref("NewsPublicDetail"),
          {
            type: "object",
            required: ["id", "status", "createdAt", "updatedAt"],
            properties: {
              id: { type: "string", format: "uuid", example: NEWS_ID },
              status: ref("ContentStatus"),
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      NewsPublicPage: pageOf("NewsPublicListItem", "Pagina di news pubblicate."),
      NewsAdminPage: pageOf("NewsAdmin", "Pagina di news."),

      HomeBlockType: {
        type: "string",
        enum: ["HERO", "TICKER", "CTA", "FEATURED"],
        description:
          "Tipo di blocco: `HERO` (apertura), `TICKER` (fascia di frasi), `CTA` (invito all'azione), `FEATURED` (schede in evidenza). " +
          "Non cambia dopo la creazione.",
      },
      HomeCta: {
        type: "object",
        description: "Un invito all'azione: etichetta e destinazione.",
        required: ["label", "href"],
        additionalProperties: false,
        properties: {
          label: { type: "string", maxLength: 60, description: "Testo del pulsante (spazi ai bordi tolti).", example: "Scopri come lavoriamo" },
          href: hrefProperty("Destinazione."),
        },
      },
      HomeHeroContent: {
        type: "object",
        description: "Contenuto di un blocco `HERO`. Nelle risposte `text` e `secondaryCta` ci sono sempre, a `null` quando assenti.",
        required: ["title", "primaryCta"],
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 200, example: "Un'idea di sapere condiviso" },
          text: {
            type: "string",
            nullable: true,
            maxLength: 600,
            description: "Testo di apertura. Vuoto o `null` vale assente.",
            example: "Ricerca, programmi e viaggi per capire il presente.",
          },
          primaryCta: ref("HomeCta"),
          secondaryCta: nullableRef("HomeCta", "Seconda azione, facoltativa. Assente o `null` vale nessuna; nelle risposte è `null`."),
        },
      },
      HomeTickerItem: {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: {
          text: { type: "string", maxLength: 160, example: "Aperte le iscrizioni al laboratorio di autunno" },
          href: hrefProperty("Link facoltativo (vuoto o `null` vale assente; nelle risposte è `null`).", {
            nullable: true,
            example: "/news/laboratorio-autunno",
          }),
        },
      },
      HomeTickerContent: {
        type: "object",
        description: "Contenuto di un blocco `TICKER`.",
        required: ["items"],
        additionalProperties: false,
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: ref("HomeTickerItem"),
            description: "Da 1 a 10 frasi, nell'ordine in cui scorrono.",
          },
        },
      },
      HomeCtaContent: {
        type: "object",
        description: "Contenuto di un blocco `CTA`. Nelle risposte `text` c'è sempre, a `null` quando assente.",
        required: ["title", "cta"],
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 200, example: "Sostieni il progetto" },
          text: {
            type: "string",
            nullable: true,
            maxLength: 400,
            description: "Testo facoltativo. Vuoto o `null` vale assente.",
            example: "Ogni contributo conta.",
          },
          cta: ref("HomeCta"),
        },
      },
      HomeFeaturedItemRequest: {
        type: "object",
        required: ["title", "href"],
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 160, example: "Nuovo laboratorio di ricerca" },
          text: {
            type: "string",
            nullable: true,
            maxLength: 300,
            description: "Testo facoltativo. Vuoto o `null` vale assente.",
            example: "Aperte le iscrizioni.",
          },
          href: hrefProperty("Destinazione della scheda.", { example: "/news/nuovo-laboratorio-di-ricerca" }),
          imageId: {
            type: "string",
            nullable: true,
            description:
              "Id (uuid) di un media esistente che sia un'immagine (non un PDF), altrimenti 400. Spazi ai bordi e maiuscole sono tollerati. " +
              "Vuoto o `null` vale nessuna immagine, per questo non è dichiarato `format: uuid`. " +
              "Nelle risposte al suo posto c'è `image`.",
            example: MEDIA_ID,
          },
        },
      },
      HomeFeaturedContentRequest: {
        type: "object",
        description: "Contenuto di un blocco `FEATURED`, come si scrive.",
        required: ["title", "items"],
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 120, example: "In evidenza" },
          items: { type: "array", minItems: 1, maxItems: 6, items: ref("HomeFeaturedItemRequest"), description: "Da 1 a 6 schede." },
        },
      },
      HomeImage: {
        type: "object",
        description: "Immagine di una scheda.",
        required: ["id", "url", "alt"],
        properties: {
          id: { type: "string", format: "uuid", example: MEDIA_ID },
          url: {
            type: "string",
            nullable: true,
            description: "Indirizzo pubblico del file; `null` se non è configurata la base degli indirizzi pubblici.",
            example: `http://localhost:9100/mateira-media/media/2026/${MEDIA_ID}.jpg`,
          },
          alt: { type: "string", nullable: true, example: "Il laboratorio Mateira visto dall'alto" },
        },
      },
      HomeFeaturedItem: {
        type: "object",
        required: ["title", "text", "href", "image"],
        properties: {
          title: { type: "string", example: "Nuovo laboratorio di ricerca" },
          text: { type: "string", nullable: true, example: "Aperte le iscrizioni." },
          href: { type: "string", example: "/news/nuovo-laboratorio-di-ricerca" },
          image: nullableRef(
            "HomeImage",
            "`null` se la scheda non ha immagine o se il media è stato cancellato: la scheda continua a funzionare.",
          ),
        },
      },
      HomeFeaturedContent: {
        type: "object",
        description: "Contenuto di un blocco `FEATURED`, come si legge: `image` al posto di `imageId`.",
        required: ["title", "items"],
        properties: {
          title: { type: "string", example: "In evidenza" },
          items: { type: "array", items: ref("HomeFeaturedItem") },
        },
      },
      HomeContentRequest: {
        description: "Il contenuto, secondo il tipo del blocco (`HERO`, `TICKER`, `CTA` o `FEATURED`).",
        oneOf: [ref("HomeHeroContent"), ref("HomeTickerContent"), ref("HomeCtaContent"), ref("HomeFeaturedContentRequest")],
      },
      HomeContent: {
        description: "Il contenuto, secondo il tipo del blocco (`HERO`, `TICKER`, `CTA` o `FEATURED`).",
        oneOf: [ref("HomeHeroContent"), ref("HomeTickerContent"), ref("HomeCtaContent"), ref("HomeFeaturedContent")],
      },
      HomeBlockCreateRequest: {
        type: "object",
        required: ["type", "content"],
        additionalProperties: false,
        properties: {
          type: ref("HomeBlockType"),
          content: ref("HomeContentRequest"),
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, un nuovo blocco è `DRAFT`." },
        },
      },
      HomeBlockUpdateRequest: {
        type: "object",
        description: "Almeno uno dei due campi. `type` non è ammesso.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          content: { allOf: [ref("HomeContentRequest")], description: "Il nuovo contenuto, che sostituisce per intero quello attuale." },
          status: ref("ContentStatus"),
        },
      },
      HomeBlockOrderRequest: {
        type: "object",
        required: ["ids"],
        additionalProperties: false,
        properties: {
          ids: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", format: "uuid" },
            description: "Gli id di tutti i blocchi esistenti, ciascuno una volta (un id ripetuto è un 400), nell'ordine voluto.",
          },
        },
      },
      HomeBlockPublic: {
        type: "object",
        required: ["id", "type", "content"],
        properties: {
          id: { type: "string", format: "uuid", example: BLOCK_ID },
          type: ref("HomeBlockType"),
          content: ref("HomeContent"),
        },
      },
      HomeBlockAdmin: {
        allOf: [
          ref("HomeBlockPublic"),
          {
            type: "object",
            required: ["position", "status", "publishedAt", "createdAt", "updatedAt"],
            properties: {
              position: { type: "integer", minimum: 0, description: "Posizione nell'ordine; a parità vale la data di creazione, poi l'id.", example: 0 },
              status: ref("ContentStatus"),
              publishedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
                description: "Quando il blocco è stato pubblicato per la prima volta; non si azzera più.",
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      HomePublicResponse: {
        type: "object",
        required: ["blocks"],
        properties: { blocks: { type: "array", items: ref("HomeBlockPublic"), description: "I blocchi pubblicati, in ordine." } },
      },
      HomeBlockList: {
        type: "object",
        required: ["blocks"],
        properties: { blocks: { type: "array", items: ref("HomeBlockAdmin"), description: "Tutti i blocchi, in ordine." } },
      },
      WordPage: {
        type: "string",
        description: "Pagina del sito che mostra la parola: la chiave è il percorso della pagina (`home` per la Home).",
        enum: [...WORD_PAGES],
      },
      WordPublic: {
        type: "object",
        required: ["id", "term", "etymology", "meaning", "closing", "page"],
        properties: {
          id: { type: "string", format: "uuid", example: WORD_ID },
          term: { type: "string", example: fondazione.term },
          etymology: {
            type: "string",
            description: "Etimologia (per la parola MATEIRA, la definizione del nome). Una riga vuota separa i paragrafi.",
            example: fondazione.etymology,
          },
          meaning: { type: "string", description: "Il significato per MATEIRA. Una riga vuota separa i paragrafi.", example: fondazione.meaning },
          closing: { type: "string", nullable: true, description: "Frase conclusiva; `null` se la parola non ne ha.", example: fondazione.closing },
          page: ref("WordPage"),
        },
      },
      WordAdmin: {
        allOf: [
          ref("WordPublic"),
          {
            type: "object",
            required: ["position", "status", "publishedAt", "createdAt", "updatedAt"],
            properties: {
              position: {
                type: "integer",
                minimum: 0,
                maximum: 9999,
                description: "Ordine nella pagina; a parità vale la data di creazione, poi l'id.",
                example: 0,
              },
              status: ref("ContentStatus"),
              publishedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
                description: "Quando la parola è stata pubblicata per la prima volta; non si azzera più.",
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      WordCreateRequest: {
        type: "object",
        required: ["term", "etymology", "meaning", "page"],
        additionalProperties: false,
        properties: {
          term: { type: "string", maxLength: 60, description: "Il termine, su una sola riga.", example: fondazione.term },
          etymology: { type: "string", maxLength: 1000, description: "Etimologia (per MATEIRA la definizione del nome)." },
          meaning: { type: "string", maxLength: 3000, description: "Il significato per MATEIRA." },
          closing: { type: "string", nullable: true, maxLength: 300, description: "Frase conclusiva, facoltativa: `null` o vuota vale \"nessuna\"." },
          page: ref("WordPage"),
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella pagina. Se manca, la parola va in fondo alla pagina.",
          },
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, una nuova parola è `DRAFT`." },
        },
      },
      WordUpdateRequest: {
        type: "object",
        description: "Almeno un campo. I campi non inviati non cambiano.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          term: { type: "string", maxLength: 60, description: "Il termine, su una sola riga." },
          etymology: { type: "string", maxLength: 1000 },
          meaning: { type: "string", maxLength: 3000 },
          closing: { type: "string", nullable: true, maxLength: 300, description: "`null` o vuota toglie la frase conclusiva." },
          page: ref("WordPage"),
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella pagina. Cambiando pagina senza `position`, la parola va in fondo alla nuova pagina.",
          },
          status: ref("ContentStatus"),
        },
      },
      WordPublicList: {
        type: "object",
        required: ["words"],
        properties: { words: { type: "array", items: ref("WordPublic"), description: "Le parole pubblicate, in ordine." } },
      },
      WordAdminList: {
        type: "object",
        required: ["words"],
        properties: { words: { type: "array", items: ref("WordAdmin"), description: "Tutte le parole, in ordine." } },
      },
    },
  },
};
