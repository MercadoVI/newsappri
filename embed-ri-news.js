(function(){
  // ===== Carga de CSS remoto (solo una vez) =====
  (function injectCSS(){
    if(!document.getElementById("ri-news-style")){
      const link = document.createElement("link");
      link.id = "ri-news-style";
      link.rel = "stylesheet";
      link.href = "https://mercadovi.github.io/newsappri/embed-ri-news.css"; // ajusta si usas otra ruta
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

  // ===== Utilidad: esperar DOM =====
  function ready(fn){
    if(document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ===== Modal (contenido renderizado) =====
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
            <a class="ri-open-new" target="_blank" rel="noopener">Abrir en pestaña nueva ↗</a>
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
  function openModalWithEntry(entry, openUrl){
    ensureModal();
    const el = document.getElementById("ri-modal");
    const hero = el.querySelector(".ri-article-hero");
    const title = el.querySelector(".ri-article-title");
    const meta = el.querySelector(".ri-article-meta");
    const body = el.querySelector(".ri-article-body");
    const openNew = el.querySelector(".ri-open-new");

    // Imagen
    if(entry.meta.hero_image){
      hero.src = entry.meta.hero_image;
      hero.parentElement.style.display = "";
    }else{
      hero.removeAttribute("src");
      hero.parentElement.style.display = "none";
    }

    title.textContent = entry.meta.title || "(Sin título)";
    meta.textContent = entry.meta.published_at ? fmtES(entry.meta.published_at) : "";

    // Body Markdown → HTML
    body.innerHTML = mdToHtml(entry.body || "");

    if(openUrl){
      openNew.href = openUrl;
      openNew.style.display = "";
    }else{
      openNew.style.display = "none";
    }

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

    // Paragraphs (bloques por doble salto)
    s = s.split(/\n{2,}/).map(block=>{
      if (/^\s*<h[1-6]|^\s*<ul|^\s*<pre|\s*<blockquote|\s*<p|\s*<table|\s*<img|\s*<figure/.test(block.trim())){
        return block;
      }
      const withBr = block.replace(/\n/g, "<br>");
      return `<p>${withBr}</p>`;
    }).join("\n");

    return s;
  }

  // ====== Inicio cuando el DOM está listo ======
  ready(function(){
    // CONFIG (overridable con data-*)
    const GITHUB_USER   = scriptTag.getAttribute("data-github-user") || "MercadoVI";
    const REPO_NAME     = scriptTag.getAttribute("data-repo")        || "newsappri";
    const LOOKBACK_DAYS = Number(scriptTag.getAttribute("data-lookback") || 60);
    const PAGE_SIZE     = Number(scriptTag.getAttribute("data-page-size") || 5);
    const CATEGORY      = (scriptTag.getAttribute("data-category") || "crowdfunding").toLowerCase().trim();
    const RI_BASE       = scriptTag.getAttribute("data-ri-base")    || "https://realtyinvestor.eu";
    const TITLE_OVERRIDE= scriptTag.getAttribute("data-title") || "";

    // Inserta contenedor
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
    scriptTag.parentNode.insertBefore(container, scriptTag.nextSibling);

    // Crea modal ya (evita carreras)
    ensureModal();

    // ===== Fechas (Europe/Madrid) =====
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

    // Fetch helpers
    async function j(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
    async function t(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }

    // Parse meta
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

    // Slug fallback
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

    // Tarjeta
    function card(meta){
      const slug = normalizeSlug(meta);
      const openUrl = `${RI_BASE}/noticias.html#/noticia/${encodeURIComponent(slug)}`;
      const img = meta.hero_image
        ? `<img class="ri-thumb" src="${meta.hero_image}" alt="">`
        : `<div class="ri-thumb" aria-hidden="true"></div>`;
      return `
        <a class="ri-card" href="${openUrl}" data-slug="${slug}">
          ${img}
          <div class="ri-body">
            <h3 class="ri-h3">${esc(meta.title || "(Sin título)")}</h3>
            <div class="ri-meta">${fmtES(meta.published_at)}</div>
          </div>
        </a>`;
    }
    function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }

    // Recoge noticias empezando por HOY (ES)
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
      results.sort((a,b)=> new Date(b.meta.published_at||0) - new Date(a.meta.published_at||0));
      return results;
    }

    // Monta carrusel
    (async function initEmbed(root){
      const title = root.querySelector(".ri-title");
      const track = root.querySelector(".ri-track");
      const prev  = root.querySelector(".ri-prev");
      const next  = root.querySelector(".ri-next");
      const more  = root.querySelector(".ri-loadmore");
      const fallback = root.querySelector(".ri-fallback");

      title.textContent = TITLE_OVERRIDE || (CATEGORY === "crowdfunding"
        ? "Noticias de hoy: Crowdfunding inmobiliario"
        : "Noticias de hoy: Sector institucional");

      const entries = await gatherEntriesByCategory(CATEGORY);

      // Mapa slug → entry (usa slug normalizado)
      const entryBySlug = new Map(
        entries.map(e=>{
          const slug = normalizeSlug(e.meta);
          return [slug, e];
        })
      );

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
          track.appendChild(moreInline);
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

      // Navegación carrusel
      prev.addEventListener("click", ()=> track.scrollBy({left: -track.clientWidth * 0.9, behavior:"smooth"}));
      next.addEventListener("click", ()=> track.scrollBy({left:  track.clientWidth * 0.9, behavior:"smooth"}));
      track.addEventListener("scroll", syncNav);
      window.addEventListener("resize", syncNav);

      // ===== Intercepta click en tarjeta → abrir modal con contenido (robusto) =====
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
        const linkUrl = a.getAttribute("href"); // para botón "Abrir en pestaña nueva"
        if(entry){
          openModalWithEntry(entry, linkUrl);
        }
      });

      if(entries.length){
        renderPage();
        fallback.hidden = true;
      }else{
        track.innerHTML = "";
        more.hidden = true;
        fallback.hidden = false;
      }
    })(container);

  });
})();
