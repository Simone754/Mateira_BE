/**
 * OpenAPI description of the whole API, served at /openapi.json and shown by Swagger UI at /docs.
 *
 * It is written by hand, so it must be updated together with the routes: every new endpoint goes here
 * (tests/docs.test.ts calls every documented operation on the real router and fails when one stops answering with a
 * status listed here, but it cannot notice a route nobody documented).
 * Technical names, enums and error strings follow the code; descriptions are in Italian.
 */

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

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Mateira API",
    version: "1.0.0",
    description: [
      "API del backend di **Mateira**: news pubbliche, media e area riservata al superuser.",
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
    },

    responses: {
      Unauthorized: errorResponse("Token di accesso mancante, non valido, scaduto o non di un superuser.", "Unauthorized"),
      NotFound: errorResponse("Risorsa non trovata (o id non valido).", "Not found"),
      PayloadTooLarge: errorResponse("Il body supera 1 MB (1000000 byte). La connessione viene chiusa.", "payload too large"),
      SlugConflict: errorResponse("Non è stato possibile ricavare uno slug univoco, per esempio per richieste concorrenti.", "could not generate a unique slug"),
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
          image: { type: "object", allOf: [ref("MediaRef")], nullable: true, description: "Immagine di copertina, se c'è." },
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
    },
  },
};
