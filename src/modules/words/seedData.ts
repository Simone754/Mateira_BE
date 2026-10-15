import type { ContentStatusValue, WordPageValue } from "./dto";

export type WordSeed = {
  term: string;
  etymology: string;
  meaning: string;
  closing: string | null;
  page: WordPageValue;
  status: ContentStatusValue;
};

/**
 * The words of the first release, as in docs/superpowers/specs/2026-10-14-mateira-words-design.md. Fondazione,
 * Generare and Viaggio come from the consolidated content document and are published; MATEIRA, Disegnare and
 * Trasformazione come from the draft site and stay drafts until the Foundation confirms them.
 */
export const WORD_SEEDS: readonly WordSeed[] = [
  {
    term: "MATEIRA",
    page: "home",
    status: "DRAFT",
    etymology: "Ciò di cui qualcosa è fatto.\nCiò da cui qualcosa può prendere forma.",
    meaning:
      "Il nome MATEIRA richiama la materia nella sua dimensione materiale e immateriale.\n\n" +
      "Luoghi, territori ed ecosistemi incontrano conoscenze, memorie, pratiche, relazioni e immaginari.",
    closing: "MATEIRA lavora con ciò che esiste per creare le condizioni di ciò che può diventare.",
  },
  {
    term: "Fondazione",
    page: "mateira",
    status: "PUBLISHED",
    etymology:
      "Dal latino FUNDUS, I: “ciò su cui qualcosa può poggiare”; “scavare fino al sodo”; " +
      "“fondato motivo, ragione valida”; “porre ferma speranza”.",
    meaning:
      "Fondare significa partire da basi solide.\n\n" +
      "Per MATEIRA significa andare in profondità, riconoscere ciò che ha valore e creare condizioni perché " +
      "conoscenze, relazioni e possibilità possano svilupparsi nel tempo.",
    closing: "Porre solide basi per nuove reti e altre possibilità.",
  },
  {
    term: "Generare",
    page: "come-lavoriamo",
    status: "PUBLISHED",
    etymology: "Dal latino GENERARE, collegato a GENUS, GENERIS: “dare origine”, “far nascere”, “produrre”.",
    meaning:
      "Per MATEIRA generare significa creare le condizioni perché ciò che nasce possa, a sua volta, produrre altro.\n\n" +
      "Una conoscenza può diventare capacità.\n" +
      "Una pratica può diventare metodo.\n" +
      "Una relazione può diventare collaborazione.\n" +
      "Un’esperienza può aprire una nuova possibilità.",
    closing: "Questa capacità di continuare a produrre valore nel tempo è ciò che MATEIRA definisce generatività.",
  },
  {
    term: "Disegnare",
    page: "programmi",
    status: "DRAFT",
    etymology:
      "Dal latino DE e il sostantivo SIGNUM, I: “dare significato”; “prefiggersi nella mente le linee principali di un lavoro”; “ideare”.\n\n" +
      "CO-DESIGN: “tracciare insieme ad altri la relazione tra cose o idee”.",
    meaning:
      "Disegnare, per MATEIRA, significa osservare prima di agire, leggere i segni presenti nei territori e tracciare " +
      "insieme rotte praticabili.\n\n" +
      "La ricerca prende forma nell’individuazione delle sfide, nell’attivazione di programmi e nella co-progettazione " +
      "di attività capaci di generare trasformazione.",
    closing: "Tracciare insieme una rotta comune e renderla praticabile.",
  },
  {
    term: "Trasformazione",
    page: "impatto",
    status: "DRAFT",
    etymology:
      "Dal prefisso latino TRANS: “oltre”, “al di là”, e il verbo FORMARE: “plasmare”.\n\n" +
      "“Portare oltre la forma”.\n" +
      "“Dare una forma diversa”.",
    meaning:
      "Trasformare non significa cancellare ciò che esiste.\n\n" +
      "Significa riconoscerne potenzialità, capacità e relazioni e osservare come possano assumere nuove forme e nuove funzioni.",
    closing: "EREDITÀ → CAPACITÀ → POSSIBILITÀ",
  },
  {
    term: "Viaggio",
    page: "viaggio-dei-tirenauti",
    status: "PUBLISHED",
    etymology: "Dal latino VIATICUM, da VIA: ciò che serve per mettersi in cammino.",
    meaning:
      "Per MATEIRA il viaggio non è soltanto spostamento.\n" +
      "È un metodo di conoscenza, relazione e sperimentazione.\n\n" +
      "Muoversi significa uscire da un punto di osservazione fisso, incontrare altri luoghi, persone e conoscenze, " +
      "osservare ciò che cambia e mettere alla prova ciò che sappiamo.\n\n" +
      "Il viaggio incentiva l’incontro.\n" +
      "Non occupa un territorio: lo attraversa, lo osserva, ascolta e scambia conoscenze con chi lo abita.",
    closing: null,
  },
];
