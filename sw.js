/* =====================================================================
   LingoCrafter - Service Worker

   Zwei Aufgaben:

   1) Ohne einen Service Worker bietet Chrome auf Android gar keinen
      Installations-Dialog an (das Ereignis "beforeinstallprompt" bleibt
      sonst aus). Er ist also die Voraussetzung dafuer, dass der Knopf
      "Jetzt installieren" ueberhaupt erscheinen kann.

   2) Er macht die App offline benutzbar - im Zug, im Ferienhaus, im
      Funkloch.

   WICHTIG - Strategie: Fuer die Seite selbst NETZ ZUERST, fuer Bilder
   ZWISCHENSPEICHER ZUERST.

   Der Grund: An LingoCrafter wird oft etwas geaendert. Wuerde die Seite aus
   dem Zwischenspeicher kommen, sitzen Kinder wochenlang auf einer alten
   Fassung und melden Fehler, die laengst behoben sind. Deshalb wird die
   Seite immer frisch geholt, wenn Netz da ist - und nur bei fehlendem Netz
   aus dem Speicher. Die Bilder aendern sich dagegen fast nie und duerfen
   sofort aus dem Speicher kommen.

   ---------------------------------------------------------------------
   FEHLER, DER LANGE UNBEMERKT BLIEB (behoben in v3):

   "Netz zuerst" war ein Irrtum. Ein schlichtes fetch() aus dem Service
   Worker fragt ZUERST den HTTP-Zwischenspeicher des Browsers - und
   GitHub Pages liefert die Seite mit "Cache-Control: max-age=600".
   Zehn Minuten lang bekam der Service Worker also die ALTE Seite, gab
   sie aus UND schrieb sie sich erneut in seinen eigenen Speicher.

   Am laufenden Browser gemessen, unmittelbar nach einem Upload:
       fetch("./")                    -> 7ddebf02   (alte Fassung)
       fetch("./", {cache:"reload"})  -> b516c5bb   (neue Fassung)

   Genau daher kamen die Faelle "ich habe hochgeladen, aber es hat sich
   nichts geaendert". Fuer die Seite wird der HTTP-Zwischenspeicher jetzt
   ausdruecklich uebergangen.
===================================================================== */

const CACHE = "lingocrafter-v3";
const MITNEHMEN = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./lingora.webp"];

/* Holt etwas unter Umgehung des HTTP-Zwischenspeichers. Faellt auf den
   gewoehnlichen Weg zurueck, falls ein Browser "reload" nicht mag -
   lieber eine alte Seite als gar keine. */
function frischHolen(url){
  return fetch(url, {cache: "reload", credentials: "same-origin"})
           .catch(()=> fetch(url));
}

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(MITNEHMEN.map(u =>
        frischHolen(u).then(a => a && a.ok ? c.put(u, a) : null).catch(()=>{})
      )))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(()=> self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const anfrage = e.request;
  if(anfrage.method !== "GET") return;

  const url = new URL(anfrage.url);
  if(url.origin !== self.location.origin) return;      // Firebase & Co. nie anfassen

  const istSeite = anfrage.mode === "navigate" ||
                   url.pathname.endsWith("/") ||
                   url.pathname.endsWith("index.html");

  if(istSeite){
    // Netz zuerst - und zwar WIRKLICH das Netz, nicht der
    // HTTP-Zwischenspeicher des Browsers.
    e.respondWith(
      frischHolen(anfrage.url)
        .then(antwort => {
          if(!antwort || !antwort.ok) throw new Error("nicht ok");
          const kopie = antwort.clone();
          caches.open(CACHE).then(c => c.put(anfrage, kopie)).catch(()=>{});
          return antwort;
        })
        .catch(()=> caches.match(anfrage).then(t => t || caches.match("./index.html")))
    );
    return;
  }

  // Bilder und Manifest: Zwischenspeicher zuerst, im Hintergrund auffrischen.
  e.respondWith(
    caches.match(anfrage).then(treffer => {
      const ausDemNetz = fetch(anfrage).then(antwort => {
        const kopie = antwort.clone();
        caches.open(CACHE).then(c => c.put(anfrage, kopie)).catch(()=>{});
        return antwort;
      }).catch(()=> treffer);
      return treffer || ausDemNetz;
    })
  );
});
