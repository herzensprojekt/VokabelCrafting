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
===================================================================== */

const CACHE = "lingocrafter-v2";
const MITNEHMEN = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./lingora.webp"];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(MITNEHMEN).catch(()=>{}))   // eine fehlende Datei darf nichts umwerfen
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
    // Netz zuerst - so kommt eine neue Fassung sofort an.
    e.respondWith(
      fetch(anfrage)
        .then(antwort => {
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
