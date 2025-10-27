(function(){
  // Inyecta el CSS automáticamente si no existe
  if(!document.getElementById("ri-news-style")){
    const style = document.createElement("link");
    style.id = "ri-news-style";
    style.rel = "stylesheet";
    style.href = "https://mercadovi.github.io/newsappri/embed-ri-news.css"; // 👈 tu hoja de estilo remota
    document.head.appendChild(style);
  }

  // Espera a que el DOM esté listo
  function ready(fn){ 
    if(document.readyState !== 'loading'){ fn(); } 
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  ready(function(){
    // === Aquí pegas TODO el script que te pasé ===
    // (empezando en const GITHUB_USER = "MercadoVI"; ... etc.)

  // ========= CONFIG =========
  const GITHUB_USER = "MercadoVI";
  const REPO_NAME   = "newsappri";
  const LOOKBACK_DAYS = 60;
  const PAGE_SIZE   = 5;
  const RI_BASE     = "https://realtyinvestor.eu";
  // ==========================

  const embeds = Array.from(document.querySelectorAll(".ri-news-embed"));

  // --- FECHAS (Europe/Madrid) ---
  function dateInMadrid(d = new Date()) {
    const str = d.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
    return new Date(str);
  }
  function todayMadrid() {
    const nowES = dateInMadrid();
    return new Date(nowES.getFullYear(), nowES.getMonth(), nowES.getDate());
  }
  function yyyymmdd(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function fmtES(iso){
    if(!iso) return "";
    try{
      const d = new Date(new Date(iso).toLocaleString("en-US",{timeZone:"Europe/Madrid"}));
      return d.toLocaleDateString("es-ES",{year:"numeric",month:"long",day:"2-digit"});
    }catch{ return ""; }
  }

  // --- FETCH HELPERS ---
  async function j(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
  async function t(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }

  // --- PARSE META ---
  function extractMeta(md, fallbackSlug){
    const m = md.match(/<!--\s*meta\s*({[\s\S]*?})\s*-->/i);
    let meta = {};
    if(m && m[1]){ try{ meta = JSON.parse(m[1]); }catch{} }
    meta.slug = meta.slug || fallbackSlug || "";
    meta.title = meta.title || "(Sin título)";
    meta.published_at = meta.published_at || null;
    meta.hero_image = meta.hero_image || "";
    meta.category = (meta.category || "").toString().trim().toLowerCase();
    const body = m ? md.replace(m[0],"").trim() : md.trim();
    return { meta, body };
  }

  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }

  function card(meta){
    const img = meta.hero_image
      ? `<img class="ri-thumb" src="${meta.hero_image}" alt="">`
      : `<div class="ri-thumb" aria-hidden="true"></div>`;
    return `
      <a class="ri-card" href="${RI_BASE}/noticias.html#/noticia/${encodeURIComponent(meta.slug)}" target="_blank" rel="noopener">
        ${img}
        <div class="ri-body">
          <h3 class="ri-h3">${esc(meta.title)}</h3>
          <div class="ri-meta">${fmtES(meta.published_at)}</div>
        </div>
      </a>`;
  }

  // --- RECOGE LAS NOTICIAS POR CATEGORÍA (empieza por HOY ES) ---
  async function gatherEntriesByCategory(targetCategory){
    const results = [];
    let d = todayMadrid();

    for(let i=0; i<=LOOKBACK_DAYS; i++){
      const day = yyyymmdd(d);
      const idxUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/news/${day}/index.json`;
      try{
        const idx = await j(idxUrl);
        if(Array.isArray(idx.items) && idx.items.length){
          const mdEntries = await Promise.all(idx.items.map(async fname=>{
            const mdUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/news/${day}/${fname}`;
            try{
              const md = await t(mdUrl);
              const { meta, body } = extractMeta(md, fname.replace(/\.(mb|md|markdown)$/i,""));
              return { meta, body };
            }catch{ return null; }
          }));

          mdEntries.filter(Boolean).forEach(e=>{
            if(e.meta.category === targetCategory) results.push(e);
          });
        }
      }catch{}
      d.setDate(d.getDate()-1);
    }

    // Más recientes primero
    results.sort((a,b)=> new Date(b.meta.published_at||0) - new Date(a.meta.published_at||0));
    return results;
  }

  // --- CREA EL CARRUSEL ---
  function setupCarousel(root, entries){
    const title = root.querySelector(".ri-title");
    const track = root.querySelector(".ri-track");
    const prev  = root.querySelector(".ri-prev");
    const next  = root.querySelector(".ri-next");
    const more  = root.querySelector(".ri-loadmore"); // botón “base” (lo moveremos dentro del track)
    const fallback = root.querySelector(".ri-fallback");

    const cat = (root.getAttribute("data-category")||"").toLowerCase();
    title.textContent = cat === "crowdfunding"
      ? "Noticias de hoy: Crowdfunding inmobiliario"
      : "Noticias de hoy: Sector institucional";

    let page = 0;

    // Crea el botón de “Cargar más” como ítem del carrusel
    function createInlineMore(){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ri-loadmore-inline";
      btn.setAttribute("aria-label", "Cargar más noticias");
      btn.innerHTML = `
        <div class="ri-more-inner">
          <div class="ri-more-icon">＋</div>
          <div> Cargar más </div>
        </div>`;
      btn.addEventListener("click", onLoadMore);
      return btn;
    }

    let moreInline = null;

    function mountMore(){
      if(moreInline) moreInline.remove();
      if(!more.hidden){
        moreInline = createInlineMore();
        track.appendChild(moreInline); // va SIEMPRE al final del carrusel
      }
    }

    function renderPage(){
      const end = Math.min((page+1)*PAGE_SIZE, entries.length);
      const html = entries.slice(0, end).map(e=>card(e.meta)).join("");
      track.innerHTML = html;
      more.hidden = end >= entries.length; // decide si hay más
      mountMore();
      requestAnimationFrame(syncNav);
    }

    function onLoadMore(){
      page++;
      const end = Math.min((page+1)*PAGE_SIZE, entries.length);
      const add = entries.slice(page*PAGE_SIZE, end).map(e=>card(e.meta)).join("");
      // Insertamos nuevas tarjetas antes del botón “Cargar más”
      if(moreInline && moreInline.parentElement === track){
        moreInline.insertAdjacentHTML("beforebegin", add);
      }else{
        track.insertAdjacentHTML("beforeend", add);
      }
      more.hidden = end >= entries.length;
      mountMore();
      syncNav();
    }

    function syncNav(){
      prev.disabled = track.scrollLeft <= 5;
      next.disabled = (track.scrollLeft + track.clientWidth) >= (track.scrollWidth - 5);
    }

    prev.addEventListener("click", ()=> track.scrollBy({left: -track.clientWidth * 0.9, behavior:"smooth"}));
    next.addEventListener("click", ()=> track.scrollBy({left:  track.clientWidth * 0.9, behavior:"smooth"}));
    track.addEventListener("scroll", syncNav);
    window.addEventListener("resize", syncNav);

    if(entries.length){
      renderPage();
      fallback.hidden = true;
    } else {
      track.innerHTML = "";
      more.hidden = true;
      fallback.hidden = false;
    }
  }

  // --- INICIALIZAR ---
  embeds.forEach(async (root)=>{
    const cat = (root.getAttribute("data-category")||"").toLowerCase().trim();
    if(cat !== "crowdfunding" && cat !== "institucional"){
      root.querySelector(".ri-title").textContent = "Categoría no soportada";
      root.querySelector(".ri-actions .ri-loadmore").hidden = true;
      return;
    }
    const entries = await gatherEntriesByCategory(cat);
    setupCarousel(root, entries);
  });
})();
