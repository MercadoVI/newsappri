<script>
(function(){ 
  // ===== Inyecta CSS una sola vez =====
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
    if (document.currentScript) return document.currentScript;
    const scripts = document.querySelectorAll('script[src]');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if (/embed-ri-news\.js(\?|#|$)/.test(s.src)) return s;
    }
    return scripts[scripts.length - 1] || null;
  })();

  if (!scriptTag) {
    console.error("[RI-NEWS] No se pudo localizar el <script> invocador.");
    return;
  }

  // ===== Utilidad: esperar al DOM =====
  function ready(fn){
    if(document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ===== Fecha → “27 de octubre de 2025” (zona Europe/Madrid) =====
  function fmtES(iso){
    if(!iso) return "";
    try{
      const d = new Date(new Date(iso).toLocaleString("en-US",{timeZone:"Europe/Madrid"}));
      return d.toLocaleDateString("es-ES",{year:"numeric",month:"long",day:"2-digit"});
    }catch{ return ""; }
  }
  function safeFmtES(iso){
    try { return fmtES ? fmtES(iso) : (iso||""); } catch { return iso||""; }
  }

  // ===== Modal =====
  function ensureModal(){
    if(document.getElementById("ri-modal")) return;
    const wrap = document.createElement("div");
    wrap.id = "ri-modal";
    wrap.className = "ri-modal";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="ri-modal-backdrop" data-ri-close></div>
      <div class="ri-modal-dialog" role="dialog" aria-modal="true" aria-label="Noticia">
        <button class="ri-modal-close" type="button" aria-label="Cerrar" data-ri-close>×</button>

        <article class="ri-article">
          <div class="ri-article-hero-wrap">
            <img class="ri-article-hero" alt="" />
          </div>
          <header class="ri-article-head">
            <h3 class="ri-article-title"></h3>
            <div class="ri-article-meta"></div>
          </header>
          <div class="ri-article-body"></div>

          <footer class="ri-article-foot">
            <a class="ri-brand-link" href="https://realtyinvestor.eu/" target="_blank" rel="noopener">by Realty Investor</a>
          </footer>
        </article>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener("click", (e)=>{
      if(e.target.matches("[data-ri-close]")) closeModal();
    });
    document.addEventListener("keydown",(e)=>{
      if(e.key === "Escape" && !wrap.hidden) closeModal();
    });
  }

  function openModalWithEntry(entry){
    ensureModal();
    const el = document.getElementById("ri-modal");
    const hero = el.querySelector(".ri-article-hero");
    const title = el.querySelector(".ri-article-title");
    const meta = el.querySelector(".ri-article-meta");
    const body = el.querySelector(".ri-article-body");

    if(entry.meta.hero_image){
      hero.src = entry.meta.hero_image;
      hero.parentElement.style.display = "";
    }else{
      hero.removeAttribute("src");
      hero.parentElement.style.display = "none";
    }

    title.textContent = entry.meta.title || "(Sin título)";
    meta.textContent = entry.meta.published_at ? safeFmtES(entry.meta.published_at) : "";
    body.innerHTML = mdToHtml(entry.body || "");

    el.hidden = false;
    document.documentElement.classList.add("ri-modal-open");
  }

  function closeModal(){
    const el = document.getElementById("ri-modal");
    if(!el) return;
    el.hidden = true;
    document.documentElement.classList.remove("ri-modal-open");
  }

  // ===== Markdown -> HTML (ligero) =====
  function mdToHtml(md){
    if(!md) return "";
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    let s = md.replace(/\r\n?/g, "\n");

    // Code blocks ``` ```
    s = s.replace(/```([\s\S]*?)```/g, (m,code)=> `<pre class="ri-code"><code>${esc(code)}</code></pre>`);
    // Inline code `code`
    s = s.replace(/`([^`]+)`/g, (m,code)=> `<code class="ri-inline-code">${esc(code)}</code>`);
    // Headers
    s = s.replace(/^\s*######\s+(.+)$/gm, "<h6>$1</h6>")
         .replace(/^\s*#####\s+(.+)$/gm,  "<h5>$1</h5>")
         .replace(/^\s*####\s+(.+)$/gm,   "<h4>$1</h4>")
         .replace(/^\s*###\s+(.+)$/gm,    "<h3>$1</h3>")
         .replace(/^\s*##\s+(.+)$/gm,     "<h2>$1</h2>")
         .replace(/^\s*#\s+(.+)$/gm,      "<h1>$1</h1>");
    // Bold / Italic
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
         .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);
    // Lists (simple)
    s = s.replace(/^(?:-|\*)\s+(.+)$/gm, "<li>$1</li>")
         .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<\/ul>)/g, "<ul>$1</ul>");

    // Paragraphs por doble salto
    s = s.split(/\n{2,}/).map(block=>{
      if (/^\s*<h[1-6]|^\s*<ul|^\s*<pre|\s*<blockquote|\s*<p|\s*<table|\s*<img|\s*<figure/.test(block.trim())){
        return block;
      }
      const withBr = block.replace(/\n/g, "<br>");
      return `<p>${withBr}</p>`;
    }).join("\n");

    return s;
  }

  // ===== Fechas SIEMPRE en Europe/Madrid =====
  const FMT_YMD_MAD = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }); // -> "YYYY-MM-DD"

  function yyyymmddMadrid(date){ return FMT_YMD_MAD.format(date); }
  // offset 0 = hoy (Madrid), -1 = ayer, -2 = anteayer...
  function dayShiftMadrid(offsetDays){
    return yyyymmddMadrid(new Date(Date.now() + offsetDays * 86400000));
  }

  function escHtml(s){
    return String(s).replace(/[&<>"']/g, c => (
      {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]
    ));
  }

  // ===== Fetch helpers =====
  async function j(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
  async function t(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }

  // ===== Parse meta desde <!--meta{...}--> =====
  function extractMeta(md, fallbackSlug){
    const m = md.match(/<!--\s*meta\s*({[\s\S]*?})\s*-->/i);
    let meta = {};
    if(m && m[1]){ try{ meta = JSON.parse(m[1]); }catch{} }
    meta.slug = meta.slug || fallbackSlug || "";
    meta.title = meta.title || "(Sin título)";
    meta.published_at = meta.published_at || null;
    meta.hero_image = meta.hero_image || "";
    meta.category = (meta.category || "").toString().trim().toLowerCase(); // "crowdfunding" | "institucional"
    const body = m ? md.replace(m[0],"").trim() : md.trim();
    return { meta, body };
  }

  // ===== Normaliza slug =====
  function normalizeSlug(meta){
    if (meta.slug && String(meta.slug).trim()) return meta.slug;
    const base = (meta.title || "").toString().trim().toLowerCase();
    if (!base) return "";
    return base
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quita acentos
      .replace(/[^a-z0-9\s-]/g,'')
      .replace(/\s+/g,'-')
      .replace(/-+/g,'-');
  }

  // ===== Card =====
  function makeCard(meta, RI_BASE){
    const slug = normalizeSlug(meta);
    const openUrl = `${RI_BASE}/noticias.html#/noticia/${encodeURIComponent(slug)}`;
    const img = meta.hero_image
      ? `<img class="ri-thumb" src="${meta.hero_image}" alt="">`
      : `<div class="ri-thumb" aria-hidden="true"></div>`;
    return `
      <a class="ri-card" href="${openUrl}" data-slug="${slug}">
        ${img}
        <div class="ri-body">
          <h3 class="ri-h3">${escHtml(meta.title || "(Sin título)")}</h3>
          <div class="ri-meta">${safeFmtES(meta.published_at)}</div>
        </div>
      </a>`;
  }

  // ===== Stream: leer días y pintar por tandas =====
  async function gatherEntriesByCategoryStream(cfg, onBatch){
    const { LOOKBACK_DAYS, CATEGORY, GITHUB_USER, REPO_NAME } = cfg;
    const results = [];

    for (let offset = 0; offset >= -LOOKBACK_DAYS; offset--) {
      const day = dayShiftMadrid(offset);
      const idxUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/news/${day}/index.json`;

      try {
        const idx = await j(idxUrl);
        if (Array.isArray(idx.items) && idx.items.length) {
          const mdEntries = await Promise.all(idx.items.map(async fname => {
            const mdUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/news/${day}/${fname}`;
            try {
              const md = await t(mdUrl);
              const parsed = extractMeta(md, fname.replace(/\.(mb|md|markdown)$/i,""));
              if (!parsed.meta.published_at) parsed.meta.published_at = `${day}T00:00:00Z`;
              return parsed;
            } catch { return null; }
          }));

          const newItems = mdEntries.filter(Boolean).filter(e=>e.meta.category===CATEGORY);
          if (newItems.length){
            results.push(...newItems);
            results.sort((a,b)=> new Date(b.meta.published_at||0) - new Date(a.meta.published_at||0));
            onBatch([...results]); // pinta parcial
          }
        }
      } catch {
        // 404: no hay carpeta ese día; continuar
      }
    }

    results.sort((a,b)=> new Date(b.meta.published_at||0) - new Date(a.meta.published_at||0));
    return results;
  }

  // ===== Inicializa un embed concreto =====
  async function initEmbed(root, cfg){
    const {
      CATEGORY, PAGE_SIZE, LOOKBACK_DAYS, RI_BASE,
      GITHUB_USER, REPO_NAME
    } = cfg;

    const title = root.querySelector(".ri-title");
    const track = root.querySelector(".ri-track");
    const prev  = root.querySelector(".ri-prev");
    const next  = root.querySelector(".ri-next");
    const more  = root.querySelector(".ri-loadmore");
    const fallback = root.querySelector(".ri-fallback");

    // Elimina cualquier título existente (para asegurar que no se muestre)
    if (title) title.remove();

    // STREAMING
    let entries = [];
    let page = 0;
    let moreInline = null;
    const entryBySlug = new Map();

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
        track.appendChild(moreInline);
      }
    }

    function renderPartial(batch){
      entries = batch;
      // reconstruye mapa slug → entry
      entryBySlug.clear();
      for (const e of entries) entryBySlug.set(normalizeSlug(e.meta), e);

      const end = Math.min((page+1)*PAGE_SIZE, entries.length);
      track.innerHTML = entries.slice(0, end).map(e=>makeCard(e.meta, RI_BASE)).join("");
      more.hidden = end >= entries.length;
      mountMore();
      requestAnimationFrame(syncNav);
      fallback.hidden = entries.length > 0;
    }

    function renderPage(){
      const end = Math.min((page+1)*PAGE_SIZE, entries.length);
      track.innerHTML = entries.slice(0, end).map(e=>makeCard(e.meta, RI_BASE)).join("");
      more.hidden = end >= entries.length;
      mountMore();
      requestAnimationFrame(syncNav);
    }

    function onLoadMore(){
      page++;
      const end = Math.min((page+1)*PAGE_SIZE, entries.length);
      const add = entries.slice(page*PAGE_SIZE, end).map(e=>makeCard(e.meta, RI_BASE)).join("");
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

    // Nav carrusel
    prev.addEventListener("click", ()=> track.scrollBy({left: -track.clientWidth * 0.9, behavior:"smooth"}));
    next.addEventListener("click", ()=> track.scrollBy({left:  track.clientWidth * 0.9, behavior:"smooth"}));
    track.addEventListener("scroll", syncNav);
    window.addEventListener("resize", syncNav);

    // Click robusto en tarjeta → abrir modal
    track.addEventListener("click", (e)=>{
      const path = (e.composedPath && e.composedPath()) || [];
      let a = null;
      for (const node of path) {
        if (node && node.nodeType === 1 && node.matches && node.matches("a.ri-card")) {
          a = node; break;
        }
      }
      if (!a && e.target && e.target.closest) a = e.target.closest("a.ri-card");
      if (!a) return;

      e.preventDefault();
      const slug = a.getAttribute("data-slug");
      const entry = entryBySlug.get(slug);
      if(entry) openModalWithEntry(entry);
    });

    // Carga progresiva: imprime según llegan batches
    gatherEntriesByCategoryStream(
      { LOOKBACK_DAYS, CATEGORY, GITHUB_USER, REPO_NAME },
      renderPartial
    ).then(all => { entries = all; });

    // Muestra el fallback hasta recibir el primer batch
    fallback.hidden = false;
  }

  // ===== Arranque =====
  ready(function(){
    // Defaults
    const DEF_GITHUB_USER   = scriptTag.getAttribute("data-github-user") || "MercadoVI";
    const DEF_REPO_NAME     = scriptTag.getAttribute("data-repo")        || "newsappri";
    const DEF_LOOKBACK_DAYS = Number(scriptTag.getAttribute("data-lookback") || 60);
    const DEF_PAGE_SIZE     = Number(scriptTag.getAttribute("data-page-size") || 5);
    const DEF_CATEGORY      = (scriptTag.getAttribute("data-category") || "crowdfunding").toLowerCase().trim();
    const DEF_RI_BASE       = scriptTag.getAttribute("data-ri-base")    || "https://realtyinvestor.eu";
    // const DEF_TITLE      = scriptTag.getAttribute("data-title") || ""; // (ya no se usa)

    // Si ya hay contenedores en el HTML, inicialízalos todos.
    // Si no hay, crea UNO tomando los data-* del script.
    const roots = Array.from(document.querySelectorAll(".ri-news-embed"));
    if (roots.length === 0) {
      const container = document.createElement("div");
      container.className = "ri-news-embed";
      container.setAttribute("data-category", DEF_CATEGORY);
      container.setAttribute("data-page-size", String(DEF_PAGE_SIZE));
      container.setAttribute("data-lookback", String(DEF_LOOKBACK_DAYS));
      container.setAttribute("data-ri-base", DEF_RI_BASE);
      container.innerHTML = `
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
      scriptTag.parentNode.insertBefore(container, scriptTag.nextSibling);
      roots.push(container);
    }

    // Crea el modal ya (una vez)
    ensureModal();

    // Inicializa cada embed leyendo sus propios data-*
    roots.forEach(root => {
      // Lee atributos por-embed (con defaults si faltan)
      const cfg = {
        CATEGORY:      (root.getAttribute("data-category")   || DEF_CATEGORY).toLowerCase().trim(),
        PAGE_SIZE:     Number(root.getAttribute("data-page-size") || DEF_PAGE_SIZE),
        LOOKBACK_DAYS: Number(root.getAttribute("data-lookback")  || DEF_LOOKBACK_DAYS),
        RI_BASE:       root.getAttribute("data-ri-base") || DEF_RI_BASE,
        GITHUB_USER:   DEF_GITHUB_USER,
        REPO_NAME:     DEF_REPO_NAME
      };

      // Si el root aún no tiene estructura interna, se la inyectamos
      if (!root.querySelector(".ri-track")) {
        root.innerHTML = `
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
      }

      // Elimina cualquier h2 residual si existiera en este root
      const strayTitle = root.querySelector(".ri-title");
      if (strayTitle) strayTitle.remove();

      // Lanza el embed
      initEmbed(root, cfg);
    });
  });
})();
</script>
