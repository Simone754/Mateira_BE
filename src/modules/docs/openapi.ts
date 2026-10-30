/**
 * OpenAPI description of the whole API, served at /openapi.json and shown by Swagger UI at /docs.
 *
 * It is written by hand, so it must be updated together with the routes: every new endpoint goes here
 * (tests/docs.test.ts calls every documented operation on the real router and fails when one stops answering with a
 * status listed here, but it cannot notice a route nobody documented).
 * Technical names, enums and error strings follow the code; descriptions are in Italian.
 */

import { EXTERNAL_URL_MAX, FILE_OR_URL } from "../../lib/fileLinkTypes";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_DESCRIPTION_MAX,
  DOCUMENT_SECTION_MAX,
  DOCUMENT_TITLE_MAX,
} from "../documents/dto";
import { ORGAN_CATEGORIES } from "../organs/dto";
import { PERSON_ROLE_KINDS, PUBLIC_PERSON_ROLE_KINDS } from "../people/dto";
import {
  PUBLICATION_ABSTRACT_MAX,
  PUBLICATION_AUTHORS_MAX,
  PUBLICATION_TITLE_MAX,
  PUBLICATION_TYPES,
} from "../publications/dto";
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
const ORGAN_ID = "9d4e1f7a-6b2c-4a83-b5d0-3c8e2f1a7b64";
const OTHER_ORGAN_ID = "c1a8e5b2-7d3f-4b96-8a14-0e2d6f9b3c57";
const PERSON_ID = "e6b3a9d1-2c4f-4d78-9b05-7a1c8e3f5d20";
const ROLE_ID = "5f2c8d0a-9e1b-4c37-a6d4-1b7e3a9c0f68";
const PERSON_PHOTO_URL = `http://localhost:9100/mateira-media/media/2026/${MEDIA_ID}.jpg`;

/** A member of an organ or a person of a public list, as the site gets it. */
const memberPublicExample = {
  id: PERSON_ID,
  name: "Anna Rossi",
  bio: "Fisica e docente, ha promosso la nascita della Fondazione.\n\nCoordina il comitato scientifico.",
  photo: { id: MEDIA_ID, url: PERSON_PHOTO_URL, alt: "Ritratto di Anna Rossi" },
  title: "Presidente",
};
const organPublicExample = {
  id: ORGAN_ID,
  name: "Consiglio di amministrazione",
  category: "GOVERNANCE",
  description: "Guida la Fondazione e ne approva gli indirizzi.",
  members: [memberPublicExample],
};
const organAdminExample = {
  id: ORGAN_ID,
  name: "Consiglio di amministrazione",
  category: "GOVERNANCE",
  description: "Guida la Fondazione e ne approva gli indirizzi.",
  position: 0,
  status: "PUBLISHED",
  publishedAt: "2026-10-26T09:00:00.000Z",
  createdAt: "2026-10-20T08:30:00.000Z",
  updatedAt: "2026-10-26T09:00:00.000Z",
  memberCount: 1,
};
const organAdminDetailExample = {
  ...organAdminExample,
  members: [{ ...memberPublicExample, roleId: ROLE_ID, status: "PUBLISHED", position: 0 }],
};
const personAdminExample = {
  id: PERSON_ID,
  name: "Anna Rossi",
  bio: memberPublicExample.bio,
  photo: memberPublicExample.photo,
  status: "PUBLISHED",
  publishedAt: "2026-10-26T09:00:00.000Z",
  createdAt: "2026-10-20T08:30:00.000Z",
  updatedAt: "2026-10-26T09:00:00.000Z",
  roles: [
    { id: "a0d7c3e9-1f5b-4286-b9e4-6c2a8d1f3b75", kind: "PROMOTER", organId: null, organName: null, title: "Promotrice", position: 0 },
    { id: ROLE_ID, kind: "ORGAN_MEMBER", organId: ORGAN_ID, organName: "Consiglio di amministrazione", title: "Presidente", position: 0 },
  ],
};

/** The 400 answers of the filters: the same messages for the public and the admin list. */
const CATEGORY_FILTER_ERROR = `category must be one of: ${ORGAN_CATEGORIES.join(", ")}`;
const PUBLIC_ROLE_ERROR = `role is required: ${PUBLIC_PERSON_ROLE_KINDS.join(", ")}`;
const ROLE_FILTER_ERROR = `role must be one of: ${PERSON_ROLE_KINDS.join(", ")}`;

const ORGAN_PUBLICATION_RULE =
  "Regola di pubblicazione: si pubblica solo ciò che è formalizzato. Un organo compare solo se è `PUBLISHED` (anche senza membri pubblicati: " +
  "il sito mostra il nome e le funzioni); un suo membro compare solo se sono `PUBLISHED` sia la persona sia l'organo. ";

const PEOPLE_TEXT_RULES =
  "Regole dei testi: spazi ai bordi tolti, i fine riga `\\r\\n` e `\\r` diventano `\\n` prima di misurare la lunghezza, " +
  "caratteri nulli o unicode spezzati rifiutati con 400. `name` (e il `title` di un incarico) sono su una sola riga: un a capo è un 400. " +
  "`bio` e `description` sono testo semplice: una riga vuota separa i paragrafi. Un campo facoltativo vuoto o `null` vale \"assente\".";

const ROLES_RULES =
  "`roles` è l'elenco completo degli incarichi, al massimo 20: `[{ kind, organId?, title?, position? }]`. " +
  "`organId` è obbligatorio se e solo se `kind` è `ORGAN_MEMBER` e deve essere un organo esistente (400 altrimenti). " +
  "Una persona ha al massimo un incarico per lista, cioè per la stessa coppia `kind` e `organId`: un doppione, anche nella stessa richiesta, è un 400 `duplicate role`; " +
  "se invece lo stesso incarico viene scritto da due richieste simultanee, una risponde 409. " +
  "Un incarico senza `position` va in fondo alla sua lista (stesso `kind` e, per `ORGAN_MEMBER`, stesso organo). ";

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

const DOCUMENT_ID = "2e8a5c71-4b9d-4f06-a3c2-8d1e7b5f9a40";
const OTHER_DOCUMENT_ID = "8c3f1d6b-0a47-4e92-b5d8-3a6c9e2f7014";
const PUBLICATION_ID = "f1b7d3a9-5c20-4e68-8a4b-9d0c2e6f1b37";
const DOCUMENT_URL = `http://localhost:9100/mateira-media/media/2026/${MEDIA_ID}.pdf`;

const documentFileExample = { id: MEDIA_ID, url: DOCUMENT_URL, mimeType: "application/pdf", alt: "Statuto della Fondazione" };

const documentPublicExample = {
  id: DOCUMENT_ID,
  title: "Statuto della Fondazione",
  section: "Statuto e regolamenti",
  date: "2026-03-01T00:00:00.000Z",
  description: "Lo statuto in vigore, approvato dal consiglio di amministrazione.",
  link: { url: DOCUMENT_URL, kind: "file", mimeType: "application/pdf" },
};

const documentAdminExample = {
  id: DOCUMENT_ID,
  title: documentPublicExample.title,
  category: "INSTITUTIONAL",
  section: documentPublicExample.section,
  date: documentPublicExample.date,
  description: documentPublicExample.description,
  file: documentFileExample,
  externalUrl: null,
  status: "PUBLISHED",
  publishedAt: "2026-10-30T09:00:00.000Z",
  createdAt: "2026-10-28T08:30:00.000Z",
  updatedAt: "2026-10-30T09:00:00.000Z",
};

const publicationPublicExample = {
  id: PUBLICATION_ID,
  title: "Rapporto sullo stato dei territori costieri",
  type: "REPORT",
  authors: "A. Rossi, M. Bianchi",
  date: "2026-06-15T00:00:00.000Z",
  abstract: "Sintesi del rapporto.\n\nSecondo paragrafo della sintesi.",
  link: { url: "https://www.example.org/rapporto-territori.pdf", kind: "external", mimeType: null },
};

const publicationAdminExample = {
  id: PUBLICATION_ID,
  title: publicationPublicExample.title,
  type: "REPORT",
  authors: publicationPublicExample.authors,
  date: publicationPublicExample.date,
  abstract: publicationPublicExample.abstract,
  file: null,
  externalUrl: publicationPublicExample.link.url,
  status: "PUBLISHED",
  publishedAt: "2026-10-30T09:00:00.000Z",
  createdAt: "2026-10-28T08:30:00.000Z",
  updatedAt: "2026-10-30T09:00:00.000Z",
};

/** The 400 answers of the filters and of the rule "a file or a link": the same messages for the public and the admin lists. */
const DOCUMENT_CATEGORY_ERROR = `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`;
const PUBLIC_DOCUMENT_CATEGORY_ERROR = `category is required: ${DOCUMENT_CATEGORIES.join(", ")}`;
const PUBLICATION_TYPE_ERROR = `type must be one of: ${PUBLICATION_TYPES.join(", ")}`;

const FILE_OR_LINK_RULES =
  "Regola del collegamento: ogni elemento rimanda a **un file PDF** già registrato tra i media (`fileId`) **oppure** a un **indirizzo esterno** (`externalUrl`, `http` o `https`, al massimo " +
  `${EXTERNAL_URL_MAX} caratteri), mai a entrambi e mai a nessuno dei due: in creazione e dopo ogni modifica, altrimenti 400 \`${FILE_OR_URL}\`. ` +
  "Per passare da un file a un indirizzo (o viceversa) si inviano nello stesso corpo `fileId: null` e `externalUrl`. " +
  "Un `fileId` che non è un media esistente di tipo PDF risponde 400. Se il media viene cancellato dall'archivio `file` diventa `null`: " +
  "l'elemento sparisce dalle letture pubbliche e il pannello lo mostra come \"file mancante\" finché non gli si assegna un nuovo file o indirizzo. ";

const LINKED_TEXT_RULES =
  "Regole dei testi: spazi ai bordi tolti, i fine riga `\\r\\n` e `\\r` diventano `\\n` prima di misurare la lunghezza, caratteri nulli o unicode spezzati rifiutati con 400. " +
  "Titolo, sezione e autori sono su una sola riga: un a capo è 400. La descrizione e la sintesi sono testo semplice: una riga vuota separa i paragrafi. " +
  "Un campo facoltativo vuoto o `null` vale \"assente\". La `date` è solo un giorno: l'ora viene scartata e il giorno è quello in UTC (mezzanotte UTC). " +
  "Un campo non previsto è rifiutato con 400. ";

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
    {
      name: "Organi (admin)",
      description:
        "Gli organi della Fondazione, di governo o consultivi, con i loro membri: crea, modifica, riordina con `position`, nascondi (bozza) e cancella. Richiede il token.",
    },
    {
      name: "Persone (admin)",
      description:
        "Le persone con uno o più incarichi (promotore, team, ambasciatore, membro di un organo): crea, modifica, nascondi (bozza) e cancella. Richiede il token.",
    },
    {
      name: "Governance e persone (pubblica)",
      description: "Gli organi e le persone pubblicati, già in ordine, senza autenticazione. Si pubblica solo ciò che è formalizzato.",
    },
    {
      name: "Documenti (admin)",
      description:
        "I documenti istituzionali e di trasparenza, ciascuno con un file PDF o un indirizzo esterno: crea, modifica, nascondi (bozza) e cancella. Richiede il token.",
    },
    {
      name: "Pubblicazioni (admin)",
      description:
        "Le pubblicazioni e le ricerche (report, paper, dati, atlanti...), ciascuna con un file PDF o un indirizzo esterno: crea, modifica, nascondi (bozza) e cancella. Richiede il token.",
    },
    {
      name: "Documenti e pubblicazioni (pubblica)",
      description: "I documenti e le pubblicazioni pubblicati, senza autenticazione. Compaiono solo se hanno un file o un indirizzo.",
    },
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

    "/api/public/organs": {
      get: {
        tags: ["Governance e persone (pubblica)"],
        operationId: "listOrgansPublic",
        summary: "Organi pubblicati con i loro membri",
        description:
          ORGAN_PUBLICATION_RULE +
          "Gli organi sono in ordine: prima `GOVERNANCE` poi `ADVISORY` (l'elenco `OrganCategory`) e dentro la categoria per posizione, poi data di creazione, poi id; " +
          "i membri seguono l'ordine del loro incarico. Con `category` solo gli organi di quella categoria. " +
          "Il `id` di un membro è l'id della persona; `photo` è `null` se la persona non ha foto (o il media è stato cancellato). " +
          "Nessun campo amministrativo (stato, posizione, date). Senza organi pubblicati `organs` è una lista vuota.",
        parameters: [{ $ref: "#/components/parameters/OrganCategoryFilter" }],
        responses: {
          "200": {
            description: "Gli organi pubblicati, in ordine.",
            content: json(ref("OrganPublicList"), { example: { organs: [organPublicExample] } }),
          },
          "400": errorResponse("`category` non è una delle categorie ammesse (anche se vuoto).", CATEGORY_FILTER_ERROR),
        },
      },
    },

    "/api/public/people": {
      get: {
        tags: ["Governance e persone (pubblica)"],
        operationId: "listPeoplePublic",
        summary: "Persone pubblicate con un incarico",
        description:
          "Le persone `PUBLISHED` che hanno l'incarico `role`, nell'ordine dell'incarico (posizione, poi data di creazione, poi id). " +
          "`title` è la carica di quell'incarico, per esempio \"Coordinatrice scientifica\". `role` è obbligatorio e ammette `PROMOTER`, `TEAM` o `AMBASSADOR`: " +
          "assente, vuoto, `ORGAN_MEMBER` o fuori elenco risponde 400 (i membri degli organi si leggono da `GET /api/public/organs`). " +
          "Nessun campo amministrativo. Senza persone pubblicate `people` è una lista vuota.",
        parameters: [{ $ref: "#/components/parameters/PublicRoleFilter" }],
        responses: {
          "200": {
            description: "Le persone pubblicate con quell'incarico, in ordine.",
            content: json(ref("PersonPublicList"), { example: { people: [{ ...memberPublicExample, title: "Promotrice" }] } }),
          },
          "400": errorResponse("`role` manca, è vuoto, è `ORGAN_MEMBER` o non è uno degli incarichi ammessi.", PUBLIC_ROLE_ERROR),
        },
      },
    },

    "/api/admin/organs": {
      get: {
        tags: ["Organi (admin)"],
        operationId: "listOrgans",
        summary: "Elenco degli organi",
        description:
          "Tutti gli organi, bozze comprese, con posizione, stato, date e `memberCount` (gli incarichi nell'organo, anche di persone in bozza). " +
          "Prima `GOVERNANCE` poi `ADVISORY`, dentro la categoria per posizione. Con `category` solo quelli di una categoria.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/OrganCategoryFilter" }],
        responses: {
          "200": { description: "Gli organi, in ordine.", content: json(ref("OrganAdminList"), { example: { organs: [organAdminExample] } }) },
          "400": errorResponse("`category` non è una delle categorie ammesse (anche se vuoto).", CATEGORY_FILTER_ERROR),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Organi (admin)"],
        operationId: "createOrgan",
        summary: "Crea un organo",
        description:
          "Crea un organo, per default in bozza (`DRAFT`). Senza `position` va in fondo alla sua categoria (massimo attuale più uno, al massimo 9999). " +
          "Con `status` `PUBLISHED` è subito pubblico e `publishedAt` è l'ora attuale. Il `name` è unico (confronto esatto dopo aver tolto gli spazi ai bordi): " +
          "un nome già usato risponde 409, anche se due richieste arrivano insieme. Un campo non previsto è rifiutato con 400. " +
          PEOPLE_TEXT_RULES,
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("OrganCreateRequest"), {
            examples: {
              governo: {
                summary: "Un organo di governo pubblicato, con le funzioni",
                value: {
                  name: "Consiglio di amministrazione",
                  category: "GOVERNANCE",
                  description: "Guida la Fondazione e ne approva gli indirizzi.\n\nSi riunisce almeno quattro volte l'anno.",
                  status: "PUBLISHED",
                },
              },
              minimo: {
                summary: "Solo i campi obbligatori (bozza, in fondo alla categoria, senza funzioni)",
                value: { name: "Comitato scientifico", category: "ADVISORY" },
              },
            },
          }),
        },
        responses: {
          "201": { description: "Organo creato.", content: json(ref("OrganAdmin")) },
          "400": errorResponse(
            "Body non valido: campo obbligatorio mancante o vuoto, fuori limite, non previsto, nome su più righe, categoria, stato o posizione non ammessi " +
              "oppure caratteri che non si possono salvare.",
            "name is required",
          ),
          "401": response("Unauthorized"),
          "409": response("DuplicateOrgan"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/organs/{id}": {
      get: {
        tags: ["Organi (admin)"],
        operationId: "getOrgan",
        summary: "Dettaglio di un organo con i membri",
        description:
          "Tutti i campi, anche per le bozze, più `members`: tutti i membri, anche le persone in bozza, in ordine. " +
          "Ogni membro ha `roleId` (l'id dell'incarico), `position` (quella dell'incarico), `status` (quello della persona) e `title` (la carica nell'organo).",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "L'organo con i suoi membri.", content: json(ref("OrganAdminDetail"), { example: organAdminDetailExample }) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Organi (admin)"],
        operationId: "updateOrgan",
        summary: "Modifica un organo",
        description:
          "Cambia uno o più campi; quelli non inviati restano com'erano. `description: null` (o vuota) toglie le funzioni. " +
          "Cambiando `category` senza `position`, l'organo va in fondo alla nuova categoria. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira l'organo dal pubblico ma conserva la data. " +
          "Rinominarlo con un nome già usato risponde 409 e non cambia nulla. " +
          PEOPLE_TEXT_RULES,
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("OrganUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica un organo", value: { status: "PUBLISHED" } },
              sposta: { summary: "Sposta un organo tra i consultivi, in fondo", value: { category: "ADVISORY" } },
              correggi: {
                summary: "Corregge le funzioni e cambia l'ordine",
                value: { description: "Funzioni aggiornate dell'organo.", position: 2 },
              },
            },
          }),
        },
        responses: {
          "200": { description: "L'organo aggiornato.", content: json(ref("OrganAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, campo non previsto, nome vuoto, fuori limite o su più righe, categoria, stato o posizione non ammessi " +
              "oppure caratteri che non si possono salvare.",
            "nothing to change",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "409": response("DuplicateOrgan"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Organi (admin)"],
        operationId: "deleteOrgan",
        summary: "Elimina un organo",
        description:
          "Elimina l'organo e anche gli incarichi delle persone in quell'organo; le persone restano. " +
          "Se due richieste lo eliminano insieme, una risponde 204 e l'altra 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Organo eliminato, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/admin/people": {
      get: {
        tags: ["Persone (admin)"],
        operationId: "listPeople",
        summary: "Elenco delle persone",
        description:
          "Tutte le persone, bozze comprese, con foto risolta e incarichi, ordinate per nome (senza distinguere maiuscole), poi data di creazione. Filtri facoltativi: `role` (anche `ORGAN_MEMBER`: chi ha almeno un incarico di quel tipo) e `status`. " +
          "Un valore fuori elenco, anche vuoto, risponde 400; un filtro ripetuto vale l'ultimo.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/AdminRoleFilter" }, { $ref: "#/components/parameters/PersonStatusFilter" }],
        responses: {
          "200": { description: "Le persone.", content: json(ref("PersonAdminList"), { example: { people: [personAdminExample] } }) },
          "400": errorResponse("`role` o `status` non sono uno dei valori ammessi (anche se vuoti).", ROLE_FILTER_ERROR),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Persone (admin)"],
        operationId: "createPerson",
        summary: "Crea una persona con i suoi incarichi",
        description:
          "Crea una persona, per default in bozza (`DRAFT`), e i suoi incarichi in una sola transazione. Con `status` `PUBLISHED` è subito pubblica e `publishedAt` è l'ora attuale. " +
          "`photoId` è un media esistente di tipo immagine (non un PDF): altrimenti 400. Un campo non previsto è rifiutato con 400. " +
          ROLES_RULES +
          PEOPLE_TEXT_RULES,
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("PersonCreateRequest"), {
            examples: {
              promotore: {
                summary: "Una promotrice pubblicata che presiede anche un organo",
                value: {
                  name: "Anna Rossi",
                  bio: "Fisica e docente, ha promosso la nascita della Fondazione.",
                  status: "PUBLISHED",
                  roles: [
                    { kind: "PROMOTER", title: "Promotrice" },
                    { kind: "ORGAN_MEMBER", organId: ORGAN_ID, title: "Presidente" },
                  ],
                },
              },
              team: {
                summary: "Un membro del team, in bozza, con posizione scelta",
                value: { name: "Luca Bianchi", roles: [{ kind: "TEAM", title: "Coordinatore scientifico", position: 1 }] },
              },
              minima: { summary: "Solo il nome (bozza, senza incarichi)", value: { name: "Marta Verdi" } },
            },
          }),
        },
        responses: {
          "201": { description: "Persona creata.", content: json(ref("PersonAdmin")) },
          "400": errorResponse(
            "Body non valido: nome mancante, vuoto o su più righe, fuori limite, campo non previsto, foto o organo inesistenti, foto che non è un'immagine, " +
              "incarichi non validi (troppi, doppioni, `organId` mancante per `ORGAN_MEMBER` o non ammesso per gli altri) oppure caratteri che non si possono salvare.",
            "organId is required for ORGAN_MEMBER",
          ),
          "401": response("Unauthorized"),
          "409": response("DuplicateRole"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/people/{id}": {
      get: {
        tags: ["Persone (admin)"],
        operationId: "getPerson",
        summary: "Dettaglio di una persona",
        description: "Tutti i campi, anche per le bozze, con la foto risolta e gli incarichi (`organName` è il nome dell'organo per `ORGAN_MEMBER`).",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "La persona.", content: json(ref("PersonAdmin"), { example: personAdminExample }) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Persone (admin)"],
        operationId: "updatePerson",
        summary: "Modifica una persona e i suoi incarichi",
        description:
          "Cambia uno o più campi tra `name`, `bio`, `photoId`, `status` e `roles`; quelli non inviati restano com'erano. `bio: null` toglie la biografia, `photoId: null` la foto. " +
          "`roles` sostituisce per intero gli incarichi esistenti, in una sola transazione con il resto della modifica; " +
          "un incarico che resta uguale (stesso `kind` e `organId`) conserva la sua `position` se non ne viene indicata una nuova, e `roles: []` li toglie tutti. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira la persona dal pubblico ma conserva la data. " +
          ROLES_RULES +
          PEOPLE_TEXT_RULES,
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("PersonUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica una persona", value: { status: "PUBLISHED" } },
              biografia: { summary: "Corregge la biografia e toglie la foto", value: { bio: "Biografia aggiornata.", photoId: null } },
              incarichi: {
                summary: "Sostituisce gli incarichi: promotrice e membro di un organo",
                value: {
                  roles: [
                    { kind: "PROMOTER", title: "Promotrice" },
                    { kind: "ORGAN_MEMBER", organId: ORGAN_ID, title: "Vicepresidente" },
                  ],
                },
              },
            },
          }),
        },
        responses: {
          "200": { description: "La persona aggiornata.", content: json(ref("PersonAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, campo non previsto, nome vuoto, fuori limite o su più righe, foto o organo inesistenti, " +
              "foto che non è un'immagine, incarichi non validi oppure caratteri che non si possono salvare.",
            "nothing to change",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "409": response("DuplicateRole"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Persone (admin)"],
        operationId: "deletePerson",
        summary: "Elimina una persona",
        description:
          "Elimina la persona e i suoi incarichi; gli organi restano e la foto resta tra i media. " +
          "Se due richieste la eliminano insieme, una risponde 204 e l'altra 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Persona eliminata, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/public/documents": {
      get: {
        tags: ["Documenti e pubblicazioni (pubblica)"],
        operationId: "listDocumentsPublic",
        summary: "Documenti pubblicati di una categoria",
        description:
          "I documenti `PUBLISHED` della categoria richiesta (`INSTITUTIONAL` per la pagina Documenti istituzionali, `TRANSPARENCY` per la Trasparenza) che hanno un link. " +
          "Sono in ordine per `section` (alfabetico senza distinguere maiuscole, i documenti senza sezione in fondo), poi `date` dal più recente, poi data di creazione, poi id. " +
          "`link.kind` è `file` (con il `mimeType` del media, sempre `application/pdf`) oppure `external` (con `mimeType` `null`). " +
          "`category` è obbligatoria: assente, vuota o fuori elenco risponde 400. Nessun campo amministrativo. Senza documenti `documents` è una lista vuota.",
        parameters: [{ $ref: "#/components/parameters/PublicDocumentCategoryFilter" }],
        responses: {
          "200": {
            description: "I documenti pubblicati della categoria, in ordine.",
            content: json(ref("DocumentPublicList"), { example: { documents: [documentPublicExample] } }),
          },
          "400": errorResponse("`category` manca, è vuota o non è una delle categorie ammesse.", PUBLIC_DOCUMENT_CATEGORY_ERROR),
        },
      },
    },

    "/api/public/publications": {
      get: {
        tags: ["Documenti e pubblicazioni (pubblica)"],
        operationId: "listPublicationsPublic",
        summary: "Pubblicazioni e ricerche pubblicate",
        description:
          "Le pubblicazioni `PUBLISHED` che hanno un link, dalla data più recente (a parità di giorno, la prima creata). Con `type` solo quelle di quel tipo. " +
          "`link.kind` è `file` (con il `mimeType` del media) oppure `external` (con `mimeType` `null`). Un `type` vuoto o fuori elenco risponde 400. " +
          "Nessun campo amministrativo.",
        parameters: [{ $ref: "#/components/parameters/PublicationTypeFilter" }, limitParameter(12, 50), { $ref: "#/components/parameters/Page" }],
        responses: {
          "200": { description: "Una pagina di pubblicazioni pubblicate.", content: json(ref("PublicationPublicPage")) },
          "400": errorResponse("`type` non è uno dei tipi ammessi (anche se vuoto).", PUBLICATION_TYPE_ERROR),
        },
      },
    },

    "/api/admin/documents": {
      get: {
        tags: ["Documenti (admin)"],
        operationId: "listDocuments",
        summary: "Elenco dei documenti",
        description:
          "Tutti i documenti, bozze e documenti senza file compresi, dalla data più recente (poi data di creazione, poi id), con il file risolto. " +
          "Filtri facoltativi `category` e `status`, che si combinano. Un valore fuori elenco, anche vuoto, risponde 400; un filtro ripetuto vale l'ultimo.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/DocumentCategoryFilter" }, { $ref: "#/components/parameters/DocumentStatusFilter" }],
        responses: {
          "200": { description: "I documenti.", content: json(ref("DocumentAdminList"), { example: { documents: [documentAdminExample] } }) },
          "400": errorResponse("`category` o `status` non sono uno dei valori ammessi (anche se vuoti).", DOCUMENT_CATEGORY_ERROR),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Documenti (admin)"],
        operationId: "createDocument",
        summary: "Crea un documento",
        description:
          "Crea un documento, per default in bozza (`DRAFT`). Con `status` `PUBLISHED` è subito pubblico e `publishedAt` è l'ora attuale. " +
          FILE_OR_LINK_RULES +
          LINKED_TEXT_RULES,
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("DocumentCreateRequest"), {
            examples: {
              conFile: {
                summary: "Un documento istituzionale con un PDF già caricato, pubblicato",
                value: {
                  title: "Statuto della Fondazione",
                  category: "INSTITUTIONAL",
                  section: "Statuto e regolamenti",
                  date: "2026-03-01",
                  description: "Lo statuto in vigore.",
                  fileId: MEDIA_ID,
                  status: "PUBLISHED",
                },
              },
              conLink: {
                summary: "Un atto di trasparenza che rimanda a un indirizzo esterno",
                value: {
                  title: "Bilancio 2025",
                  category: "TRANSPARENCY",
                  section: "Bilanci",
                  date: "2026-06-30T10:00:00Z",
                  externalUrl: "https://www.example.org/bilancio-2025.pdf",
                },
              },
            },
          }),
        },
        responses: {
          "201": { description: "Documento creato.", content: json(ref("DocumentAdmin")) },
          "400": errorResponse(
            "Body non valido: campo mancante, vuoto, su più righe o fuori limite, categoria o stato non ammessi, campo non previsto, indirizzo non http/https, " +
              "`fileId` inesistente o non PDF, nessuno dei due o entrambi tra `fileId` ed `externalUrl`, oppure caratteri che non si possono salvare.",
            FILE_OR_URL,
          ),
          "401": response("Unauthorized"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/documents/{id}": {
      get: {
        tags: ["Documenti (admin)"],
        operationId: "getDocument",
        summary: "Dettaglio di un documento",
        description: "Tutti i campi, anche per le bozze, con il file risolto (`file` è `null` se il documento rimanda a un indirizzo o se il media è stato cancellato).",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "Il documento.", content: json(ref("DocumentAdmin"), { example: documentAdminExample }) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Documenti (admin)"],
        operationId: "updateDocument",
        summary: "Modifica un documento",
        description:
          "Cambia uno o più campi; quelli non inviati restano com'erano. `section: null` e `description: null` li tolgono. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira il documento dal pubblico ma conserva la data. " +
          "Una modifica che lascerebbe il documento con entrambi o con nessuno tra file e indirizzo risponde 400, anche quando il documento è senza file perché il media è stato cancellato: " +
          "in quel caso la modifica deve indicare un nuovo `fileId` o `externalUrl`. " +
          FILE_OR_LINK_RULES +
          LINKED_TEXT_RULES,
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("DocumentUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica un documento", value: { status: "PUBLISHED" } },
              sezione: { summary: "Cambia sezione e data", value: { section: "Bilanci", date: "2026-07-01" } },
              daFileALink: {
                summary: "Passa da un file a un indirizzo esterno",
                value: { fileId: null, externalUrl: "https://www.example.org/statuto.pdf" },
              },
            },
          }),
        },
        responses: {
          "200": { description: "Il documento aggiornato.", content: json(ref("DocumentAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, campo non previsto, valori vuoti o fuori limite, `fileId` inesistente o non PDF, " +
              "file e indirizzo entrambi presenti o entrambi assenti dopo la modifica, oppure caratteri che non si possono salvare.",
            "nothing to change",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Documenti (admin)"],
        operationId: "deleteDocument",
        summary: "Elimina un documento",
        description: "Elimina il documento; il PDF resta tra i media. Se due richieste lo eliminano insieme, una risponde 204 e l'altra 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Documento eliminato, nessun contenuto." },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
    },

    "/api/admin/publications": {
      get: {
        tags: ["Pubblicazioni (admin)"],
        operationId: "listPublications",
        summary: "Elenco delle pubblicazioni",
        description:
          "Tutte le pubblicazioni, bozze e senza file comprese, dalla data più recente (a parità di giorno, la prima creata), con il file risolto. " +
          "Filtri facoltativi `type` e `status`, che si combinano. Un valore fuori elenco, anche vuoto, risponde 400.",
        security: bearer,
        parameters: [
          { $ref: "#/components/parameters/PublicationTypeFilter" },
          { $ref: "#/components/parameters/PublicationStatusFilter" },
          limitParameter(20, 100),
          { $ref: "#/components/parameters/Page" },
        ],
        responses: {
          "200": { description: "Una pagina di pubblicazioni.", content: json(ref("PublicationAdminPage")) },
          "400": errorResponse("`type` o `status` non sono uno dei valori ammessi (anche se vuoti).", PUBLICATION_TYPE_ERROR),
          "401": response("Unauthorized"),
        },
      },
      post: {
        tags: ["Pubblicazioni (admin)"],
        operationId: "createPublication",
        summary: "Crea una pubblicazione",
        description:
          "Crea una pubblicazione, per default in bozza (`DRAFT`). Con `status` `PUBLISHED` è subito pubblica e `publishedAt` è l'ora attuale. " +
          FILE_OR_LINK_RULES +
          LINKED_TEXT_RULES,
        security: bearer,
        requestBody: {
          required: true,
          content: json(ref("PublicationCreateRequest"), {
            examples: {
              conLink: {
                summary: "Un report che rimanda a un indirizzo esterno, pubblicato",
                value: {
                  title: "Rapporto sullo stato dei territori costieri",
                  type: "REPORT",
                  authors: "A. Rossi, M. Bianchi",
                  date: "2026-06-15",
                  abstract: "Sintesi del rapporto.\n\nSecondo paragrafo della sintesi.",
                  externalUrl: "https://www.example.org/rapporto-territori.pdf",
                  status: "PUBLISHED",
                },
              },
              conFile: {
                summary: "Un paper con un PDF già caricato (bozza)",
                value: { title: "Dinamiche costiere", type: "PAPER", date: "2026-09-02", fileId: MEDIA_ID },
              },
            },
          }),
        },
        responses: {
          "201": { description: "Pubblicazione creata.", content: json(ref("PublicationAdmin")) },
          "400": errorResponse(
            "Body non valido: campo mancante, vuoto, su più righe o fuori limite, tipo o stato non ammessi, campo non previsto, indirizzo non http/https, " +
              "`fileId` inesistente o non PDF, nessuno dei due o entrambi tra `fileId` ed `externalUrl`, oppure caratteri che non si possono salvare.",
            FILE_OR_URL,
          ),
          "401": response("Unauthorized"),
          "413": response("PayloadTooLarge"),
        },
      },
    },

    "/api/admin/publications/{id}": {
      get: {
        tags: ["Pubblicazioni (admin)"],
        operationId: "getPublication",
        summary: "Dettaglio di una pubblicazione",
        description: "Tutti i campi, anche per le bozze, con il file risolto (`file` è `null` se rimanda a un indirizzo o se il media è stato cancellato).",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "La pubblicazione.", content: json(ref("PublicationAdmin"), { example: publicationAdminExample }) },
          "401": response("Unauthorized"),
          "404": response("NotFound"),
        },
      },
      patch: {
        tags: ["Pubblicazioni (admin)"],
        operationId: "updatePublication",
        summary: "Modifica una pubblicazione",
        description:
          "Cambia uno o più campi; quelli non inviati restano com'erano. `authors: null` e `abstract: null` li tolgono. " +
          "Passando a `PUBLISHED` per la prima volta si imposta `publishedAt`; tornare a `DRAFT` ritira la pubblicazione dal pubblico ma conserva la data. " +
          "Una modifica che lascerebbe la pubblicazione con entrambi o con nessuno tra file e indirizzo risponde 400, anche quando è senza file perché il media è stato cancellato: " +
          "in quel caso la modifica deve indicare un nuovo `fileId` o `externalUrl`. " +
          FILE_OR_LINK_RULES +
          LINKED_TEXT_RULES,
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: json(ref("PublicationUpdateRequest"), {
            examples: {
              pubblica: { summary: "Pubblica una pubblicazione", value: { status: "PUBLISHED" } },
              autori: { summary: "Corregge autori e tipo", value: { authors: "A. Rossi", type: "RESEARCH" } },
              daLinkAFile: {
                summary: "Passa da un indirizzo esterno a un file",
                value: { fileId: MEDIA_ID, externalUrl: null },
              },
            },
          }),
        },
        responses: {
          "200": { description: "La pubblicazione aggiornata.", content: json(ref("PublicationAdmin")) },
          "400": errorResponse(
            "Body non valido: nessun campo da cambiare, campo non previsto, valori vuoti o fuori limite, `fileId` inesistente o non PDF, " +
              "file e indirizzo entrambi presenti o entrambi assenti dopo la modifica, oppure caratteri che non si possono salvare.",
            "nothing to change",
          ),
          "401": response("Unauthorized"),
          "404": response("NotFound"),
          "413": response("PayloadTooLarge"),
        },
      },
      delete: {
        tags: ["Pubblicazioni (admin)"],
        operationId: "deletePublication",
        summary: "Elimina una pubblicazione",
        description: "Elimina la pubblicazione; il PDF resta tra i media. Se due richieste la eliminano insieme, una risponde 204 e l'altra 404.",
        security: bearer,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "204": { description: "Pubblicazione eliminata, nessun contenuto." },
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
      OrganCategoryFilter: {
        name: "category",
        in: "query",
        required: false,
        description:
          "Solo gli organi di questa categoria. Senza il parametro, tutte le categorie nell'ordine dell'elenco. " +
          "Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("OrganCategory"),
      },
      PublicRoleFilter: {
        name: "role",
        in: "query",
        required: true,
        description:
          "L'incarico delle persone da elencare: `PROMOTER`, `TEAM` o `AMBASSADOR`. Obbligatorio: assente, vuoto, `ORGAN_MEMBER` o fuori elenco risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("PublicPersonRoleKind"),
      },
      AdminRoleFilter: {
        name: "role",
        in: "query",
        required: false,
        description:
          "Solo le persone con almeno un incarico di questo tipo (anche `ORGAN_MEMBER`). Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("PersonRoleKind"),
      },
      PersonStatusFilter: {
        name: "status",
        in: "query",
        required: false,
        description: "Solo le persone con questo stato. Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("ContentStatus"),
      },
      PublicDocumentCategoryFilter: {
        name: "category",
        in: "query",
        required: true,
        description:
          "La categoria dei documenti da elencare: `INSTITUTIONAL` (Documenti istituzionali) o `TRANSPARENCY` (Trasparenza). Obbligatoria: assente, vuota o fuori elenco risponde 400; ripetuta, vale l'ultima.",
        schema: ref("DocumentCategory"),
      },
      DocumentCategoryFilter: {
        name: "category",
        in: "query",
        required: false,
        description: "Solo i documenti di questa categoria. Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("DocumentCategory"),
      },
      DocumentStatusFilter: {
        name: "status",
        in: "query",
        required: false,
        description: "Solo i documenti con questo stato. Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("ContentStatus"),
      },
      PublicationTypeFilter: {
        name: "type",
        in: "query",
        required: false,
        description: "Solo le pubblicazioni di questo tipo. Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("PublicationType"),
      },
      PublicationStatusFilter: {
        name: "status",
        in: "query",
        required: false,
        description: "Solo le pubblicazioni con questo stato. Un valore fuori elenco (anche vuoto) risponde 400; ripetuto, vale l'ultimo.",
        schema: ref("ContentStatus"),
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
      DuplicateOrgan: errorResponse(
        "Esiste già un organo con questo nome (confronto esatto, dopo aver tolto gli spazi ai bordi), anche se creato da una richiesta simultanea.",
        "an organ with this name already exists",
      ),
      DuplicateRole: errorResponse(
        "Lo stesso incarico (stesso `kind` e stesso `organId`) scritto da due richieste simultanee per la stessa persona.",
        "duplicate role",
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
      OrganCategory: {
        type: "string",
        description: "`GOVERNANCE`: organi di governo (pagina Governance). `ADVISORY`: comitati e consigli consultivi.",
        enum: [...ORGAN_CATEGORIES],
      },
      PersonRoleKind: {
        type: "string",
        description: "Tipo di incarico: `PROMOTER`, `TEAM`, `AMBASSADOR` oppure `ORGAN_MEMBER` (membro di un organo, con `organId`).",
        enum: [...PERSON_ROLE_KINDS],
      },
      PublicPersonRoleKind: {
        type: "string",
        description: "Gli incarichi che si leggono dall'elenco pubblico delle persone (i membri degli organi si leggono dagli organi).",
        enum: [...PUBLIC_PERSON_ROLE_KINDS],
      },
      PersonPhoto: {
        type: "object",
        description: "La foto di una persona.",
        required: ["id", "url", "alt"],
        properties: {
          id: { type: "string", format: "uuid", example: MEDIA_ID },
          url: {
            type: "string",
            nullable: true,
            description: "Indirizzo pubblico del file; `null` se non è configurata la base degli indirizzi pubblici.",
            example: PERSON_PHOTO_URL,
          },
          alt: { type: "string", nullable: true, example: "Ritratto di Anna Rossi" },
        },
      },
      MemberPublic: {
        type: "object",
        description: "Una persona in una lista del sito: `id` è l'id della persona, `title` la carica di quell'incarico.",
        required: ["id", "name", "bio", "photo", "title"],
        properties: {
          id: { type: "string", format: "uuid", example: PERSON_ID },
          name: { type: "string", example: "Anna Rossi" },
          bio: { type: "string", nullable: true, description: "Biografia; `null` se manca. Una riga vuota separa i paragrafi.", example: memberPublicExample.bio },
          photo: nullableRef("PersonPhoto", "La foto, se c'è; altrimenti `null`."),
          title: { type: "string", nullable: true, description: "La carica o il ruolo; `null` se non indicata.", example: "Presidente" },
        },
      },
      OrganPublic: {
        type: "object",
        required: ["id", "name", "category", "description", "members"],
        properties: {
          id: { type: "string", format: "uuid", example: ORGAN_ID },
          name: { type: "string", example: "Consiglio di amministrazione" },
          category: ref("OrganCategory"),
          description: { type: "string", nullable: true, description: "Le funzioni dell'organo; `null` se mancano.", example: organPublicExample.description },
          members: { type: "array", items: ref("MemberPublic"), description: "I membri pubblicati, in ordine." },
        },
      },
      OrganAdmin: {
        type: "object",
        required: ["id", "name", "category", "description", "position", "status", "publishedAt", "createdAt", "updatedAt", "memberCount"],
        properties: {
          id: { type: "string", format: "uuid", example: ORGAN_ID },
          name: { type: "string", example: "Consiglio di amministrazione" },
          category: ref("OrganCategory"),
          description: { type: "string", nullable: true, description: "Le funzioni dell'organo; `null` se mancano.", example: organPublicExample.description },
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella categoria; a parità vale la data di creazione, poi l'id.",
            example: 0,
          },
          status: ref("ContentStatus"),
          publishedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Quando l'organo è stato pubblicato per la prima volta; non si azzera più.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          memberCount: { type: "integer", minimum: 0, description: "Gli incarichi in questo organo, anche di persone in bozza.", example: 1 },
        },
      },
      OrganMemberAdmin: {
        allOf: [
          ref("MemberPublic"),
          {
            type: "object",
            required: ["roleId", "status", "position"],
            properties: {
              roleId: { type: "string", format: "uuid", description: "L'id dell'incarico della persona in questo organo.", example: ROLE_ID },
              status: { allOf: [ref("ContentStatus")], description: "Lo stato della persona." },
              position: { type: "integer", minimum: 0, maximum: 9999, description: "La posizione dell'incarico nell'elenco dei membri dell'organo.", example: 0 },
            },
          },
        ],
      },
      OrganAdminDetail: {
        allOf: [
          ref("OrganAdmin"),
          {
            type: "object",
            required: ["members"],
            properties: { members: { type: "array", items: ref("OrganMemberAdmin"), description: "Tutti i membri, anche in bozza, in ordine." } },
          },
        ],
      },
      OrganCreateRequest: {
        type: "object",
        required: ["name", "category"],
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 160, description: "Il nome, su una sola riga e unico.", example: "Consiglio di amministrazione" },
          category: ref("OrganCategory"),
          description: {
            type: "string",
            nullable: true,
            maxLength: 3000,
            description: "Le funzioni dell'organo, facoltative: `null` o vuota vale \"nessuna\".",
          },
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella categoria. Se manca, l'organo va in fondo alla categoria.",
          },
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, un nuovo organo è `DRAFT`." },
        },
      },
      OrganUpdateRequest: {
        type: "object",
        description: "Almeno un campo. I campi non inviati non cambiano.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 160, description: "Il nome, su una sola riga e unico." },
          category: ref("OrganCategory"),
          description: { type: "string", nullable: true, maxLength: 3000, description: "`null` o vuota toglie le funzioni." },
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella categoria. Cambiando categoria senza `position`, l'organo va in fondo alla nuova categoria.",
          },
          status: ref("ContentStatus"),
        },
      },
      OrganPublicList: {
        type: "object",
        required: ["organs"],
        properties: { organs: { type: "array", items: ref("OrganPublic"), description: "Gli organi pubblicati, in ordine." } },
      },
      OrganAdminList: {
        type: "object",
        required: ["organs"],
        properties: { organs: { type: "array", items: ref("OrganAdmin"), description: "Tutti gli organi, in ordine." } },
      },
      PersonPublicList: {
        type: "object",
        required: ["people"],
        properties: { people: { type: "array", items: ref("MemberPublic"), description: "Le persone pubblicate con l'incarico richiesto, in ordine." } },
      },
      PersonRoleAdmin: {
        type: "object",
        description: "Un incarico di una persona.",
        required: ["id", "kind", "organId", "organName", "title", "position"],
        properties: {
          id: { type: "string", format: "uuid", example: ROLE_ID },
          kind: ref("PersonRoleKind"),
          organId: { type: "string", format: "uuid", nullable: true, description: "L'organo, solo per `ORGAN_MEMBER`; altrimenti `null`.", example: ORGAN_ID },
          organName: { type: "string", nullable: true, description: "Il nome dell'organo; `null` se `organId` è `null`.", example: "Consiglio di amministrazione" },
          title: { type: "string", nullable: true, description: "La carica o il ruolo; `null` se non indicata.", example: "Presidente" },
          position: { type: "integer", minimum: 0, maximum: 9999, description: "Ordine nella lista dell'incarico.", example: 0 },
        },
      },
      PersonAdmin: {
        type: "object",
        required: ["id", "name", "bio", "photo", "status", "publishedAt", "createdAt", "updatedAt", "roles"],
        properties: {
          id: { type: "string", format: "uuid", example: PERSON_ID },
          name: { type: "string", example: "Anna Rossi" },
          bio: { type: "string", nullable: true, description: "Biografia; `null` se manca. Una riga vuota separa i paragrafi.", example: memberPublicExample.bio },
          photo: nullableRef("PersonPhoto", "La foto, se c'è (e il media non è stato cancellato); altrimenti `null`."),
          status: ref("ContentStatus"),
          publishedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Quando la persona è stata pubblicata per la prima volta; non si azzera più.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          roles: { type: "array", items: ref("PersonRoleAdmin"), description: "Gli incarichi della persona." },
        },
      },
      PersonRoleRequest: {
        type: "object",
        description: "Un incarico nell'elenco `roles` di una richiesta.",
        required: ["kind"],
        additionalProperties: false,
        properties: {
          kind: ref("PersonRoleKind"),
          organId: {
            type: "string",
            format: "uuid",
            nullable: true,
            description: "Un organo esistente. Obbligatorio se e solo se `kind` è `ORGAN_MEMBER`.",
            example: ORGAN_ID,
          },
          title: { type: "string", nullable: true, maxLength: 120, description: "La carica o il ruolo, su una sola riga, facoltativa.", example: "Presidente" },
          position: {
            type: "integer",
            minimum: 0,
            maximum: 9999,
            description: "Ordine nella lista dell'incarico. Se manca va in fondo, tranne in modifica per un incarico che resta uguale, che conserva la posizione.",
          },
        },
      },
      PersonCreateRequest: {
        type: "object",
        required: ["name"],
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 120, description: "Nome e cognome, su una sola riga (non è unico).", example: "Anna Rossi" },
          bio: { type: "string", nullable: true, maxLength: 3000, description: "Biografia, facoltativa: `null` o vuota vale \"nessuna\"." },
          photoId: {
            type: "string",
            format: "uuid",
            nullable: true,
            description: "Id di un media già registrato, di tipo immagine (non PDF), usato come foto.",
          },
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, una nuova persona è `DRAFT`." },
          roles: { type: "array", maxItems: 20, items: ref("PersonRoleRequest"), description: "Gli incarichi (massimo 20). Se manca, nessuno." },
        },
      },
      PersonUpdateRequest: {
        type: "object",
        description: "Almeno un campo. I campi non inviati non cambiano.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 120, description: "Nome e cognome, su una sola riga." },
          bio: { type: "string", nullable: true, maxLength: 3000, description: "`null` o vuota toglie la biografia." },
          photoId: { type: "string", format: "uuid", nullable: true, description: "Un media immagine esistente; `null` toglie la foto." },
          status: ref("ContentStatus"),
          roles: {
            type: "array",
            maxItems: 20,
            items: ref("PersonRoleRequest"),
            description: "L'elenco completo degli incarichi (massimo 20): sostituisce per intero quelli esistenti; `[]` li toglie tutti.",
          },
        },
      },
      PersonAdminList: {
        type: "object",
        required: ["people"],
        properties: { people: { type: "array", items: ref("PersonAdmin"), description: "Le persone." } },
      },

      DocumentCategory: {
        type: "string",
        enum: [...DOCUMENT_CATEGORIES],
        // No example or default here: the schema also types the list filters, and Swagger UI would send it.
        description: "`INSTITUTIONAL`: pagina Documenti istituzionali. `TRANSPARENCY`: pagina Trasparenza.",
      },
      PublicationType: {
        type: "string",
        enum: [...PUBLICATION_TYPES],
        description:
          "Tipo di pubblicazione: `RESEARCH` (Ricerca), `REPORT` (Report), `PAPER` (Paper), `PUBLICATION` (Pubblicazione), `DATA` (Dati), `ATLAS` (Atlante), " +
          "`SCENARIO` (Scenario), `CITIZEN_SCIENCE` (Citizen science), `LIVING_ARCHIVE` (Living Archive).",
      },
      LinkedFile: {
        type: "object",
        description: "Il file PDF di un documento o di una pubblicazione, risolto dal media.",
        required: ["id", "url", "mimeType", "alt"],
        properties: {
          id: { type: "string", format: "uuid", example: MEDIA_ID },
          url: { type: "string", nullable: true, description: "Indirizzo pubblico del file.", example: DOCUMENT_URL },
          mimeType: { type: "string", example: "application/pdf" },
          alt: { type: "string", nullable: true, description: "Descrizione del media." },
        },
      },
      PublicLink: {
        type: "object",
        description: "Dove porta un documento o una pubblicazione.",
        required: ["url", "kind", "mimeType"],
        properties: {
          url: { type: "string", nullable: true, description: "L'indirizzo del file caricato o l'indirizzo esterno.", example: DOCUMENT_URL },
          kind: { type: "string", enum: ["file", "external"], description: "`file`: PDF caricato. `external`: indirizzo esterno.", example: "file" },
          mimeType: { type: "string", nullable: true, description: "Il tipo del file per `file`; `null` per `external`.", example: "application/pdf" },
        },
      },
      DocumentPublic: {
        type: "object",
        required: ["id", "title", "section", "date", "description", "link"],
        properties: {
          id: { type: "string", format: "uuid", example: DOCUMENT_ID },
          title: { type: "string", example: "Statuto della Fondazione" },
          section: { type: "string", nullable: true, description: "La sezione dentro la pagina; `null` se manca.", example: "Statuto e regolamenti" },
          date: { type: "string", format: "date-time", description: "Il giorno del documento (mezzanotte UTC).", example: "2026-03-01T00:00:00.000Z" },
          description: { type: "string", nullable: true, description: "Descrizione; una riga vuota separa i paragrafi." },
          link: ref("PublicLink"),
        },
      },
      DocumentPublicList: {
        type: "object",
        required: ["documents"],
        properties: { documents: { type: "array", items: ref("DocumentPublic"), description: "I documenti pubblicati della categoria, in ordine." } },
      },
      DocumentAdmin: {
        type: "object",
        required: ["id", "title", "category", "section", "date", "description", "file", "externalUrl", "status", "publishedAt", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid", example: DOCUMENT_ID },
          title: { type: "string", example: "Statuto della Fondazione" },
          category: ref("DocumentCategory"),
          section: { type: "string", nullable: true, example: "Statuto e regolamenti" },
          date: { type: "string", format: "date-time", description: "Il giorno del documento (mezzanotte UTC)." },
          description: { type: "string", nullable: true },
          file: nullableRef("LinkedFile", "Il file PDF, se il documento ne ha uno; altrimenti `null`."),
          externalUrl: { type: "string", nullable: true, description: "L'indirizzo esterno, se il documento ne ha uno; altrimenti `null`." },
          status: ref("ContentStatus"),
          publishedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Quando il documento è stato pubblicato per la prima volta; non si azzera più.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DocumentAdminList: {
        type: "object",
        required: ["documents"],
        properties: { documents: { type: "array", items: ref("DocumentAdmin"), description: "I documenti." } },
      },
      DocumentCreateRequest: {
        type: "object",
        required: ["title", "category", "date"],
        additionalProperties: false,
        description: "Più `fileId` oppure `externalUrl` (uno solo dei due).",
        properties: {
          title: { type: "string", maxLength: DOCUMENT_TITLE_MAX, description: "Titolo, su una sola riga.", example: "Statuto della Fondazione" },
          category: ref("DocumentCategory"),
          section: { type: "string", nullable: true, maxLength: DOCUMENT_SECTION_MAX, description: "Sezione, su una sola riga, facoltativa.", example: "Statuto e regolamenti" },
          date: { type: "string", pattern: DATE_PATTERN, description: "Giorno del documento: `2026-03-01` (con un orario conta il giorno UTC di quell'istante).", example: "2026-03-01" },
          description: { type: "string", nullable: true, maxLength: DOCUMENT_DESCRIPTION_MAX, description: "Descrizione facoltativa." },
          fileId: { type: "string", format: "uuid", nullable: true, description: "Id di un media esistente di tipo PDF.", example: MEDIA_ID },
          externalUrl: {
            type: "string",
            nullable: true,
            maxLength: EXTERNAL_URL_MAX,
            description: "Indirizzo `http` o `https` valido.",
            example: "https://www.example.org/statuto.pdf",
          },
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, un nuovo documento è `DRAFT`." },
        },
      },
      DocumentUpdateRequest: {
        type: "object",
        description: "Almeno un campo. I campi non inviati non cambiano.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: DOCUMENT_TITLE_MAX, description: "Titolo, su una sola riga." },
          category: ref("DocumentCategory"),
          section: { type: "string", nullable: true, maxLength: DOCUMENT_SECTION_MAX, description: "`null` o vuota toglie la sezione." },
          date: { type: "string", pattern: DATE_PATTERN, description: "Giorno del documento." },
          description: { type: "string", nullable: true, maxLength: DOCUMENT_DESCRIPTION_MAX, description: "`null` o vuota toglie la descrizione." },
          fileId: { type: "string", format: "uuid", nullable: true, description: "Un media PDF esistente; `null` toglie il file (e allora serve `externalUrl`)." },
          externalUrl: { type: "string", nullable: true, maxLength: EXTERNAL_URL_MAX, description: "Un indirizzo `http` o `https`; `null` lo toglie (e allora serve `fileId`)." },
          status: ref("ContentStatus"),
        },
      },
      PublicationPublic: {
        type: "object",
        required: ["id", "title", "type", "authors", "date", "abstract", "link"],
        properties: {
          id: { type: "string", format: "uuid", example: PUBLICATION_ID },
          title: { type: "string", example: "Rapporto sullo stato dei territori costieri" },
          type: ref("PublicationType"),
          authors: { type: "string", nullable: true, description: "Autori, testo libero.", example: "A. Rossi, M. Bianchi" },
          date: { type: "string", format: "date-time", description: "Il giorno della pubblicazione (mezzanotte UTC)." },
          abstract: { type: "string", nullable: true, description: "Sintesi; una riga vuota separa i paragrafi." },
          link: ref("PublicLink"),
        },
      },
      PublicationPublicPage: pageOf("PublicationPublic", "Pagina di pubblicazioni pubblicate."),
      PublicationAdmin: {
        type: "object",
        required: ["id", "title", "type", "authors", "date", "abstract", "file", "externalUrl", "status", "publishedAt", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid", example: PUBLICATION_ID },
          title: { type: "string", example: "Rapporto sullo stato dei territori costieri" },
          type: ref("PublicationType"),
          authors: { type: "string", nullable: true, example: "A. Rossi, M. Bianchi" },
          date: { type: "string", format: "date-time", description: "Il giorno della pubblicazione (mezzanotte UTC)." },
          abstract: { type: "string", nullable: true },
          file: nullableRef("LinkedFile", "Il file PDF, se la pubblicazione ne ha uno; altrimenti `null`."),
          externalUrl: { type: "string", nullable: true, description: "L'indirizzo esterno, se la pubblicazione ne ha uno; altrimenti `null`." },
          status: ref("ContentStatus"),
          publishedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Quando la pubblicazione è stata pubblicata per la prima volta; non si azzera più.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PublicationAdminPage: pageOf("PublicationAdmin", "Pagina di pubblicazioni."),
      PublicationCreateRequest: {
        type: "object",
        required: ["title", "type", "date"],
        additionalProperties: false,
        description: "Più `fileId` oppure `externalUrl` (uno solo dei due).",
        properties: {
          title: { type: "string", maxLength: PUBLICATION_TITLE_MAX, description: "Titolo, su una sola riga.", example: "Rapporto sullo stato dei territori costieri" },
          type: ref("PublicationType"),
          authors: { type: "string", nullable: true, maxLength: PUBLICATION_AUTHORS_MAX, description: "Autori, testo libero su una sola riga, facoltativo.", example: "A. Rossi, M. Bianchi" },
          date: { type: "string", pattern: DATE_PATTERN, description: "Giorno della pubblicazione: `2026-06-15` (con un orario conta il giorno UTC di quell'istante).", example: "2026-06-15" },
          abstract: { type: "string", nullable: true, maxLength: PUBLICATION_ABSTRACT_MAX, description: "Sintesi facoltativa." },
          fileId: { type: "string", format: "uuid", nullable: true, description: "Id di un media esistente di tipo PDF.", example: MEDIA_ID },
          externalUrl: {
            type: "string",
            nullable: true,
            maxLength: EXTERNAL_URL_MAX,
            description: "Indirizzo `http` o `https` valido.",
            example: "https://www.example.org/rapporto-territori.pdf",
          },
          status: { allOf: [ref("ContentStatus")], description: "Stato di pubblicazione. Se manca, una nuova pubblicazione è `DRAFT`." },
        },
      },
      PublicationUpdateRequest: {
        type: "object",
        description: "Almeno un campo. I campi non inviati non cambiano.",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: PUBLICATION_TITLE_MAX, description: "Titolo, su una sola riga." },
          type: ref("PublicationType"),
          authors: { type: "string", nullable: true, maxLength: PUBLICATION_AUTHORS_MAX, description: "`null` o vuoto toglie gli autori." },
          date: { type: "string", pattern: DATE_PATTERN, description: "Giorno della pubblicazione." },
          abstract: { type: "string", nullable: true, maxLength: PUBLICATION_ABSTRACT_MAX, description: "`null` o vuota toglie la sintesi." },
          fileId: { type: "string", format: "uuid", nullable: true, description: "Un media PDF esistente; `null` toglie il file (e allora serve `externalUrl`)." },
          externalUrl: { type: "string", nullable: true, maxLength: EXTERNAL_URL_MAX, description: "Un indirizzo `http` o `https`; `null` lo toglie (e allora serve `fileId`)." },
          status: ref("ContentStatus"),
        },
      },
    },
  },
};
