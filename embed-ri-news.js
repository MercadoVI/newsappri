(function(){
  // ===== Carga de CSS remoto (solo una vez) =====
  (function injectCSS(){
    if(!document.getElementById("ri-news-style")){
      const link = document.createElement("link");
      link.id = "ri-news-style";
      link.rel = "stylesheet";
      link.href = "https://mercadovi.github.io/newsappri/embed-ri-news.css";
      document.head.appendChild(link);
    }
  })();

  // ===== Localiza el <script> invocador de forma robusta =====
  const scriptTag = (function(){
    // 1) Mejor opción: mientras se ejecuta el script
    if (document.currentScript) return document.currentScript;

    // 2) Fallback: busca el último <script> cuyo src coincida con embed-ri-news.js
    const scripts = document.querySelectorAll('script[src]');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if (/embed-ri-news\.js(\?|#|$)/.test(s.src)) return s;
    }

    // 3) Ultimo recurso: el último <script> de la página
    return scripts[scripts.length - 1] || null;
  })();

  if (!scriptTag) {
    console.error("[RI-NEWS] No se pudo localizar el <script> invocador.");
    return;
  }

  // ===== Utilidad: esperar DOM si hace falta =====
  function ready(fn){
    if(document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // --- Mueve aquí la ejecución principal ---
  ready(function(){
    // ====== CONFIG por defecto (overridable con data-*) ======
    const GITHUB_USER   = scriptTag.getAttribute("data-github-user") || "MercadoVI";
    const REPO_NAME     = scriptTag.getAttribute("data-repo")        || "newsappri";
    const LOOKBACK_DAYS = Number(scriptTag.getAttribute("data-lookback") || 60);
    const PAGE_SIZE     = Number(scriptTag.getAttribute("data-page-size") || 5);
    const CATEGORY      = (scriptTag.getAttribute("data-category") || "crowdfunding").toLowerCase().trim();
    const RI_BASE       = scriptTag.getAttribute("data-ri-base")    || "https://realtyinvestor.eu";
    const TITLE_OVERRIDE= scriptTag.getAttribute("data-title") || "";

    if(CATEGORY !== "crowdfunding" && CATEGORY !== "institucional"){
      console.warn("[RI-NEWS] data-category debe ser 'crowdfunding' o 'institucional'. Valor recibido:", CATEGORY);
    }

    // ====== Inserta el contenedor después del script si no existe uno explícito ======
    const container = document.createElement("div");
    container.className = "ri-news-embed";
    container.setAttribute("data-category", CATEGORY);
    container.innerHTML = `
      <h2 class="ri-title"></h2>

      <div class="ri-carousel">
        <button class="ri-nav ri-prev" aria-label="Anterior">‹</button>
        <div class="ri-track" role="region" aria-live="polite"></div>
        <button class="ri-nav ri-next" aria-label="Siguiente">›</button>
      </div>

      <div class="ri-actions">
        <button class="ri-loadmore" type="button" hidden>Cargar más</button>
        <div class="ri-fallback" hidden>No hay noticias por ahora.</div>
      </div>
    `;
    // Inserta inmediatamente tras el <script>
    scriptTag.parentNode.insertBefore(container, scriptTag.nextSibling);

    // ====== Funciones de fecha (Europe/Madrid) ======
    function dateInMadrid(d = new Date()){
      const str = d.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
      return new Date(str);
    }
    function todayMadrid(){
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

    // ====== Fetch helpers ======
    async function j(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
    async function t(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }

    // ====== Parse meta desde <!--meta{...}--> ======
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

    // ====== Recolecta noticias empezando por HOY (ES) ======
    async function gatherEntriesByCategory(targetCategory){
      const results = [];
      let d = todayMadrid(); // HOY exactamente en hora de España

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
        d.setDate(d.getDate()-1); // día anterior
      }

      // Más recientes primero
      results.sort((a,b)=> new Date(b.meta.published_at||0) - new Date(a.meta.published_at||0));
      return results;
    }

    // ====== Monta el carrusel en este contenedor ======
    (async function initEmbed(root){
      const title = root.querySelector(".ri-title");
      const track = root.querySelector(".ri-track");
      const prev  = root.querySelector(".ri-prev");
      const next  = root.querySelector(".ri-next");
      const more  = root.querySelector(".ri-loadmore"); // base (usamos hidden y clon inline)
      const fallback = root.querySelector(".ri-fallback");

      title.textContent = TITLE_OVERRIDE || (CATEGORY === "crowdfunding"
        ? "Noticias de hoy: Crowdfunding inmobiliario"
        : "Noticias de hoy: Sector institucional");

      const entries = await gatherEntriesByCategory(CATEGORY);
      let page = 0;
      let moreInline = null;

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

      function mountMore(){
        if(moreInline) moreInline.remove();
        if(!more.hidden){
          moreInline = createInlineMore();
          track.appendChild(moreInline); // siempre al final del carrusel
        }
      }

      function renderPage(){
        const end = Math.min((page+1)*PAGE_SIZE, entries.length);
        track.innerHTML = entries.slice(0, end).map(e=>card(e.meta)).join("");
        more.hidden = end >= entries.length;
        mountMore();
        requestAnimationFrame(syncNav);
      }

      function onLoadMore(){
        page++;
        const end = Math.min((page+1)*PAGE_SIZE, entries.length);
        const add = entries.slice(page*PAGE_SIZE, end).map(e=>card(e.meta)).join("");
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
    })(container);

  });
})();
