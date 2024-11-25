import"./hoisted.BScVxmeO.js";let n=1,a=!1,l=!0;const c=12,o=document.getElementById("loading"),d=document.getElementById("episodes-grid"),m={root:null,rootMargin:"100px",threshold:.1};async function h(){if(!(a||!l)){a=!0,o?.classList.remove("hidden");try{const e=await(await fetch(`/api/episodes?page=${n+1}&limit=${c}`)).json();e.episodes.length<c&&(l=!1),e.episodes.length>0&&(n+=1,e.episodes.forEach(t=>{const s=document.createElement("article");s.className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden transform hover:scale-[1.02] transition-all duration-300",s.innerHTML=`
            <div class="p-6">
              <h3 class="text-xl font-bold mb-2">
                <a href="/ep/${t.number}" class="hover:text-primary transition-colors">
                  ${t.title}
                </a>
              </h3>
              <p class="text-gray-600 dark:text-gray-400 mb-4">
                ${t.pubDate}
              </p>
              <div class="prose dark:prose-invert prose-sm max-h-32 overflow-hidden relative">
                ${t.description}
                <div class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-800"></div>
              </div>
              <a 
                href="/ep/${t.number}"
                class="inline-flex items-center gap-2 mt-4 text-primary hover:text-secondary transition-colors"
              >
                続きを読む
                <span class="i-[ri:arrow-right-line]"></span>
              </a>
            </div>
          `,d?.appendChild(s)}))}catch(r){console.error("Error loading more episodes:",r)}finally{a=!1,o?.classList.add("hidden")}}}const g=new IntersectionObserver(r=>{r.forEach(e=>{e.isIntersecting&&h()})},m);o&&g.observe(o);const p=new MutationObserver(r=>{r.forEach(e=>{if(e.attributeName==="class"){const t=document.documentElement.classList.contains("dark");document.querySelectorAll(".prose").forEach(s=>{const i=s.querySelector(".absolute");i&&(i.className=`absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-${t?"gray-800":"white"}`)})}})});p.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]});
