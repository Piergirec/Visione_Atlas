// Read colors from CSS variables so they stay in sync
const rootStyles = getComputedStyle(document.documentElement);
const trackColors = {
    "Track A: Technology": rootStyles.getPropertyValue('--track-a-color').trim(),
    "Track B: Design": rootStyles.getPropertyValue('--track-b-color').trim(),
    "Track C: Business": rootStyles.getPropertyValue('--track-c-color').trim(),
};
const defaultTrackColor = rootStyles.getPropertyValue('--track-default-color').trim();

let linkSemanticColor = rootStyles.getPropertyValue('--link-semantic-color').trim();
let linkKeywordColor = rootStyles.getPropertyValue('--link-keyword-color').trim();

// Cache images to avoid reloading them on every render frame
const imageCache = new Map();

function getTrackColor(trackName) {
    return trackColors[trackName] || defaultTrackColor;
}

// Filter state
let activeTrackFilter = '';
let activeKeywordFilter = '';

function nodeMatchesFilters(node) {
    let matchTrack = true;
    let matchKeyword = true;

    if (activeTrackFilter) {
        matchTrack = node.track === activeTrackFilter;
    }
    
    if (activeKeywordFilter) {
        if (!node.keywords) matchKeyword = false;
        else {
            const kws = node.keywords.split(/[,;]/).map(k => k.trim().toLowerCase());
            matchKeyword = kws.includes(activeKeywordFilter.toLowerCase());
        }
    }
    
    return matchTrack && matchKeyword;
}

// Initialize the graph
fetch('graph_data.json').then(res => res.json()).then(data => {
    // --- Pre-process links for curvature (handle double connections) ---
    const linkMap = {};
    data.links.forEach(link => {
        const s = typeof link.source === 'object' ? link.source.id : link.source;
        const t = typeof link.target === 'object' ? link.target.id : link.target;
        const key = [s, t].sort().join('-');
        if (!linkMap[key]) {
            linkMap[key] = [];
        }
        linkMap[key].push(link);
    });

    data.links.forEach(link => {
        const s = typeof link.source === 'object' ? link.source.id : link.source;
        const t = typeof link.target === 'object' ? link.target.id : link.target;
        const key = [s, t].sort().join('-');
        const siblingLinks = linkMap[key];
        if (siblingLinks.length > 1) {
            const index = siblingLinks.indexOf(link);
            link.curvature = index === 0 ? 0.2 : -0.2;
        } else {
            link.curvature = 0;
        }
    });

    const graph = ForceGraph()(document.getElementById('graph-container'))
        .graphData(data)
        .linkCurvature('curvature')
        .onRenderFramePre((ctx, globalScale) => {
            // Render Semantic Space Clusters
            if (!data.clusters) return;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            data.clusters.forEach(cluster => {
                const cNodes = data.nodes.filter(n => n.cluster === cluster.id);
                if (cNodes.length === 0) return;
                
                let sumX = 0, sumY = 0;
                cNodes.forEach(n => { sumX += n.x; sumY += n.y; });
                const cx = sumX / cNodes.length;
                const cy = sumY / cNodes.length;
                
                const fontSize = 32 / globalScale; // Font gigante per renderlo ben visibile
                ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // Bianco solido e acceso
                ctx.fillText(cluster.label, cx, cy);
            });
        })
        .nodeId('id')
        .nodeLabel('title')
        .linkLabel(link => {
            if (link.type === 'keyword' && link.shared && link.shared.length > 0) {
                return `<div style="background: rgba(0,0,0,0.8); padding: 5px; border-radius: 4px;">Shared Keyword(s): <b>${link.shared.join(', ')}</b></div>`;
            }
            return '';
        })
        .linkVisibility(link => link.type !== 'semantic') // Nasconde dal rendering e dall'hover
        .linkColor(link => {
            const sNode = typeof link.source === 'object' ? link.source : data.nodes.find(n => n.id === link.source);
            const tNode = typeof link.target === 'object' ? link.target : data.nodes.find(n => n.id === link.target);
            const isHighlighted = (!activeTrackFilter && !activeKeywordFilter) || 
                                  (nodeMatchesFilters(sNode) || nodeMatchesFilters(tNode));
            
            if (!isHighlighted) return 'rgba(255,255,255,0.02)';
            return linkKeywordColor;
        })
        .linkWidth(link => {
            if (link.type === 'semantic') return 0;
            
            const sNode = typeof link.source === 'object' ? link.source : data.nodes.find(n => n.id === link.source);
            const tNode = typeof link.target === 'object' ? link.target : data.nodes.find(n => n.id === link.target);
            const isHighlighted = (!activeTrackFilter && !activeKeywordFilter) || 
                                  (nodeMatchesFilters(sNode) || nodeMatchesFilters(tNode));
            
            // Lo spessore varia in base a quante keyword condividono (link.value)
            const thickness = link.value * 0.4; // 1kw = 0.4px (sottile), 3kw = 1.2px (spesso)
            
            if (!isHighlighted) return thickness * 0.2; // quasi invisibile se non evidenziato
            return thickness;
        })
    .linkDirectionalParticles(link => 0) // Disabilita le particelle per alleggerire la vista
    .linkDirectionalParticleSpeed(0.005)
    .nodeCanvasObject((node, ctx, globalScale) => {
        const size = 12; // Node radius
        
        const isHighlighted = (!activeTrackFilter && !activeKeywordFilter) || nodeMatchesFilters(node);
        ctx.globalAlpha = isHighlighted ? 1.0 : 0.15;
        
        // 1. Draw Border (Track Color)
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI, false);
        ctx.fillStyle = getTrackColor(node.track);
        ctx.fill();

        // 2. Draw Image inside (or fallback to color if no image)
        const imgSrc = node.thumb || node.img; // Usa la miniatura se esiste
        if (imgSrc) {
            let img = imageCache.get(imgSrc);
            if (!img) {
                img = new Image();
                img.src = imgSrc;
                imageCache.set(imgSrc, img);
            }
            
            // Clip to circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.clip();
            
            try {
                // Draw image centered
                ctx.drawImage(img, node.x - size, node.y - size, size * 2, size * 2);
            } catch(e) {
                // Image not loaded yet, fill with background
                ctx.fillStyle = '#333';
                ctx.fill();
            }
            ctx.restore();
        } else {
            // Fallback if no image
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#333';
            ctx.fill();
        }
        ctx.globalAlpha = 1.0; // Reset alpha
    })
    .onNodeClick(node => {
        // Zoom into node
        graph.centerAt(node.x, node.y, 1000);
        graph.zoom(3, 2000);
        
        // Open Side Panel
        openPanel(node);
    });

    // Customizza le forze fisiche del grafo per separare i nodi
    graph.d3Force('charge').strength(-800).distanceMax(1000); // Repulsione molto più alta per un grafo aperto
    graph.d3Force('link').distance(link => link.type === 'semantic' ? 120 : 200); // Distanze più ampie tra i paper
    
    // Auto-center the camera when the simulation settles
    graph.onEngineStop(() => {
        graph.zoomToFit(600, 40); // animate for 600ms, with 40px padding
    });

    // --- Filter Initialization ---
    const tracks = new Set();
    const keywords = new Set();
    
    data.nodes.forEach(n => {
        if (n.track) tracks.add(n.track);
        if (n.keywords) {
            n.keywords.split(/[,;]/).forEach(k => {
                const kw = k.trim();
                if(kw) keywords.add(kw);
            });
        }
    });

    const trackSelect = document.getElementById('track-filter');
    Array.from(tracks).sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        trackSelect.appendChild(opt);
    });

    const keywordSelect = document.getElementById('keyword-filter');
    Array.from(keywords).sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        keywordSelect.appendChild(opt);
    });

    trackSelect.addEventListener('change', (e) => {
        activeTrackFilter = e.target.value;
        // Force redraw by resetting accessors
        graph.nodeCanvasObject(graph.nodeCanvasObject());
        graph.linkColor(graph.linkColor());
    });
    
    keywordSelect.addEventListener('change', (e) => {
        activeKeywordFilter = e.target.value;
        // Force redraw by resetting accessors
        graph.nodeCanvasObject(graph.nodeCanvasObject());
        graph.linkColor(graph.linkColor());
    });

    // --- Legend and Settings ---
    const legendTracks = document.getElementById('legend-tracks');
    const trackColorsContainer = document.getElementById('track-colors-container');
    
    // Add base link colors to settings
    trackColorsContainer.innerHTML += `
        <div class="color-picker-group">
            <label>Keyword Link</label>
            <input type="color" id="color-link-keyword" value="${linkKeywordColor.substring(0,7).padEnd(7, '0')}">
        </div>
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:10px 0;">
    `;

    Object.keys(trackColors).forEach(track => {
        // Legenda
        const legItem = document.createElement('div');
        legItem.className = 'legend-item';
        legItem.innerHTML = `<span class="legend-track-color" style="background-color: ${trackColors[track]}"></span> ${track}`;
        legendTracks.appendChild(legItem);
        
        // Impostazioni Colore (if it maps to a var)
        let varName = '';
        if(track === 'Track A: Technology') varName = '--track-a-color';
        if(track === 'Track B: Design') varName = '--track-b-color';
        if(track === 'Track C: Business') varName = '--track-c-color';
        
        if (varName) {
            const colorGroup = document.createElement('div');
            colorGroup.className = 'color-picker-group';
            colorGroup.innerHTML = `
                <label>${track}</label>
                <input type="color" data-var="${varName}" data-track="${track}" value="${trackColors[track].substring(0,7).padEnd(7, '0')}">
            `;
            trackColorsContainer.appendChild(colorGroup);
        }
    });

    // Settings Toggle
    document.getElementById('settings-toggle').addEventListener('click', () => {
        document.getElementById('settings-panel').classList.toggle('hidden');
    });

    // Sliders
    document.getElementById('setting-repulsion').addEventListener('input', (e) => {
        graph.d3Force('charge').strength(-parseInt(e.target.value)).distanceMax(500);
        graph.d3ReheatSimulation();
    });
    document.getElementById('setting-link-distance').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        graph.d3Force('link').distance(link => link.type === 'semantic' ? val/2 : val);
        graph.d3ReheatSimulation();
    });
    
    // Reset Button
    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        // Reset inputs
        document.getElementById('setting-repulsion').value = 300;
        document.getElementById('setting-link-distance').value = 120;
        
        // Reset forces
        graph.d3Force('charge').strength(-300).distanceMax(500);
        graph.d3Force('link').distance(link => link.type === 'semantic' ? 60 : 120);
        
        // Reheat and re-center
        graph.d3ReheatSimulation();
        graph.zoomToFit(1000, 40);
    });

    // Color Pickers
    document.querySelectorAll('.color-picker-group input[type="color"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const color = e.target.value;
            if (e.target.id === 'color-link-keyword') {
                linkKeywordColor = color;
                document.documentElement.style.setProperty('--link-keyword-color', color);
                graph.linkColor(graph.linkColor());
            } else {
                const varName = e.target.getAttribute('data-var');
                const trackName = e.target.getAttribute('data-track');
                document.documentElement.style.setProperty(varName, color);
                trackColors[trackName] = color;
                
                // Update legend
                Array.from(legendTracks.children).forEach(child => {
                    if (child.textContent.trim() === trackName) {
                        child.querySelector('.legend-track-color').style.backgroundColor = color;
                    }
                });
                
                graph.nodeCanvasObject(graph.nodeCanvasObject());
            }
        });
    });

});

// Side Panel Logic
const sidePanel = document.getElementById('side-panel');
const closeBtn = document.getElementById('close-btn');

function openPanel(node) {
    document.getElementById('panel-img').src = node.img || '';
    
    const trackEl = document.getElementById('panel-track');
    trackEl.textContent = node.track || 'No Track';
    trackEl.style.backgroundColor = getTrackColor(node.track);
    trackEl.style.color = '#000'; // dark text on bright badge
    
    document.getElementById('panel-title').textContent = node.title || 'Untitled';
    
    // Authors List
    const authorsContainer = document.getElementById('panel-authors-list');
    authorsContainer.innerHTML = '';
    if (node.authors_list && node.authors_list.length > 0) {
        node.authors_list.forEach(a => {
            const authorDiv = document.createElement('div');
            authorDiv.className = 'author-item';
            
            const nameEl = document.createElement('span');
            nameEl.className = 'author-name';
            nameEl.textContent = a.name;
            authorDiv.appendChild(nameEl);
            
            if (a.affiliation) {
                const affilEl = document.createElement('span');
                affilEl.className = 'author-affil';
                affilEl.textContent = a.affiliation;
                authorDiv.appendChild(affilEl);
            }
            
            if (a.contact) {
                const contactEl = document.createElement('a');
                contactEl.className = 'author-contact';
                contactEl.href = a.contact.includes('@') ? 'mailto:' + a.contact : a.contact;
                contactEl.textContent = a.contact;
                authorDiv.appendChild(contactEl);
            }
            
            authorsContainer.appendChild(authorDiv);
        });
    } else {
        authorsContainer.innerHTML = '<span class="author-name">' + (node.authors || 'Unknown Authors') + '</span>';
    }

    document.getElementById('panel-abstract').textContent = node.abstract || 'No abstract available.';
    
    const linkEl = document.getElementById('panel-link');
    if (node.pdfUrl) {
        linkEl.href = node.pdfUrl;
        linkEl.style.display = 'block';
    } else if (node.link) {
        linkEl.href = node.link;
        linkEl.style.display = 'block';
    } else {
        linkEl.style.display = 'none';
    }

    // Render Keywords
    const kwContainer = document.getElementById('panel-keywords');
    kwContainer.innerHTML = ''; // clear old
    if (node.keywords) {
        const keywords = node.keywords.split(/[,;]/);
        keywords.forEach(kw => {
            const trimmed = kw.trim();
            if(trimmed) {
                const span = document.createElement('span');
                span.className = 'keyword-tag';
                span.textContent = trimmed;
                kwContainer.appendChild(span);
            }
        });
    }

    sidePanel.classList.add('open');
}

closeBtn.addEventListener('click', () => {
    sidePanel.classList.remove('open');
});
