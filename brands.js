// ── Brands that sell online — Exa searches these for product discovery ─────────
export const ONLINE_BRAND_DOMAINS = [
    // ── Ultra Luxury ──────────────────────────────────────────────────────────
    "cartier.com",           // Cartier
    "vancleefarpels.com",    // Van Cleef & Arpels
    "boucheron.com",         // Boucheron
    "chaumet.com",           // Chaumet
    "bulgari.com",           // Bvlgari
    "buccellati.com",        // Buccellati
    "boodles.com",           // Boodles
    "garrard.com",           // Garrard
    "asprey.com",            // Asprey
    "debeers.com",           // De Beers Jewellers
    "chopard.com",           // Chopard
    "harrywinston.com",      // Harry Winston
    "chanel.com",            // Chanel Fine Jewelry
    // ── High Luxury ───────────────────────────────────────────────────────────
    "tiffany.com",           // Tiffany & Co.
    "mauboussin.com",        // Mauboussin
    "fred.com",              // Fred
    "repossi.com",           // Repossi
    "pomellato.com",         // Pomellato
    "piaget.com",            // Piaget
    "davidyurman.com",       // David Yurman
    "mikimoto.com",          // Mikimoto
    "messika.com",           // Messika
    "dior.com",              // Dior Joaillerie
    "us.louisvuitton.com",   // Louis Vuitton Jewelry
    "hermes.com",            // Hermès Fine Jewelry
    "qeelin.com",            // Qeelin
    "jessicamccormack.com",  // Jessica McCormack
    "vhernier.com",          // Vhernier
    "niwaka.com",            // Niwaka
    "kwiat.com",             // Kwiat
    "anakhouri.com",         // Ana Khouri
    "ireneneuwithjewelry.com",// Irene Neuwirth
    "amrapalijewels.com",    // Amrapali Jewels
    // ── Mid Luxury ────────────────────────────────────────────────────────────
    "gucci.com",             // Gucci Fine Jewelry
    "fernandojorge.co.uk",   // Fernando Jorge
    "marcobicego.com",       // Marco Bicego
    "pasqualebruni.com",     // Pasquale Bruni
    "robertocoin.com",       // Roberto Coin
    "georgjensen.com",       // Georg Jensen
    "olelynggaard.com",      // Ole Lynggaard
    "sophiebillebrahe.com",  // Sophie Bille Brahe
    "tasaki.co.jp",          // Tasaki
    "hstern.com",            // H.Stern
    "ippolita.com",          // Ippolita
    "lagos.com",             // Lagos
    "johnhardy.com",         // John Hardy
    "tacori.com",            // Tacori
    "verragio.com",          // Verragio
    "simong.com",            // Simon G.
    "whiteflash.com",        // Whiteflash
    "zoechicco.com",         // Zoë Chicco
    "anitako.com",           // Anita Ko
    "foundrae.com",          // Foundrae
    "alisonlou.com",         // Alison Lou
    "lizziemandler.com",     // Lizzie Mandler
    "marlaaaron.com",        // Marla Aaron
    "loganhollowell.com",    // Logan Hollowell
    "marlolaz.com",          // Marlo Laz
    "spinellikilcollin.com", // Spinelli Kilcollin
    "charlottechesnais.fr",  // Charlotte Chesnais
    "nadineghosn.com",       // Nadine Ghosn
    "jadetrau.com",          // Jade Trau
    "jemmawynne.com",        // Jemma Wynne
    "doyledoyle.com",        // Doyle & Doyle (estate jewelry)
    "prounisjewelry.com",    // Prounis
    "damasjewellery.com",    // Damas Jewellery
    "forevermark.com",       // Forevermark
    "omegawatches.com",      // Omega
    // ── Entry Luxury ──────────────────────────────────────────────────────────
    "brilliantearth.com",    // Brilliant Earth
    "bluenile.com",          // Blue Nile
    "jamesallen.com",        // James Allen
    "cleanorigin.com",       // Clean Origin
    "vrai.com",              // Vrai
    "mejuri.com",            // Mejuri
    "catbirdnyc.com",        // Catbird
    "gorjana.com",           // Gorjana
    "monicavinader.com",     // Monica Vinader
    "kendrascott.com",       // Kendra Scott
    "gabrielny.com",         // Gabriel & Co.
    "neillanejewelry.com",   // Neil Lane
    "persee-paris.com",      // Persée
    "wwake.com",             // Wwake
    "levian.com",            // Le Vian
    "kay.com",               // Kay Jewelers
    "zales.com",             // Zales
    "alexandani.com",        // Alex and Ani
    "baublebar.com",         // BaubleBar
    // ── India ─────────────────────────────────────────────────────────────────
    "tanishq.co.in",              // Tanishq
    "malabargoldanddiamonds.com", // Malabar Gold & Diamonds
    "caratlane.com",              // CaratLane (Tata/Tanishq online)
    "bluestone.com",              // BlueStone
    "kalyanjewellers.net",        // Kalyan Jewellers
    "joyalukkas.com",             // Joyalukkas
    "pcjeweller.com",             // PC Jeweller
    "sencogold.com",              // Senco Gold
];

// ── Brands that do NOT sell online (appointment/bespoke/authorized dealers only) ──
// When RAG returns one of these, the LLM should redirect the user to visit a boutique.
export const APPOINTMENT_ONLY_DOMAINS = new Set([
    "rolex.com",                  // Rolex — authorized dealers only
    "audemarspiguet.com",         // Audemars Piguet — authorized dealers only
    "vacheron-constantin.com",    // Vacheron Constantin — authorized dealers only
    "patek.com",                  // Patek Philippe — authorized dealers only
    "jaeger-lecoultre.com",       // Jaeger-LeCoultre — authorized dealers only
    "breguet.com",                // Breguet — authorized dealers only
    "richardmille.com",           // Richard Mille — authorized dealers only
    "hublot.com",                 // Hublot — authorized dealers only
    "lorraineschwartzjewels.com", // Lorraine Schwartz — fully bespoke
    "hemmerle.com",               // Hemmerle — by appointment only
    "wallacechan.com",            // Wallace Chan — one-of-a-kind, appointment only
    "siegelson.com",              // Siegelson — gallery/appointment only
    "fredleighton.com",           // Fred Leighton — in-store/appointment
    "mouawad.com",                // Mouawad — limited, by appointment
    "mellerio.fr",                // Mellerio — primarily bespoke
    "graff.com",                  // Graff — limited online, by inquiry
]);

/**
 * Runtime check for appointment-only domains
 */
export function isAppointmentOnly(domain) {
    return APPOINTMENT_ONLY_DOMAINS.has(domain);
}

/**
 * Runtime check for online brands
 */
export function isOnlineBrand(domain) {
    return ONLINE_BRAND_DOMAINS.includes(domain);
}
