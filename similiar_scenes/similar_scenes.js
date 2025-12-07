(function () {
    'use strict';

    const GRAPHQL_ENDPOINT = '/graphql';

    // --- Configuration ---
    const MIN_MATCHING_TAGS = 2;
    const MAX_MATCHING_TAGS = 7;
    const TOTAL_SCENES = 10;

    let initCheckInterval = null;

    // Helper to check if the user is on a small screen (mobile view)
    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const GET_SCENE_QUERY = `
        query FindScene($id: ID!) {
            findScene(id: $id) {
                id
                title
                tags { id name }
            }
        }
    `;

    const FIND_SCENES_QUERY = `
        query FindScenes($filter: FindFilterType) {
            findScenes(filter: $filter) {
                count
                scenes {
                    id
                    title
                    files { basename }
                    paths { screenshot preview }
                    tags { id name }
                }
            }
        }
    `;

    async function graphqlRequest(query, variables = {}) {
        try {
            const response = await fetch(GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables })
            });
            const result = await response.json();
            if (result.errors) {
                console.error("GraphQL Errors:", result.errors);
                return null;
            }
            return result.data;
        } catch (e) {
            console.error("Similar Scenes: API Error", e);
            return null;
        }
    }

    function getSceneIdFromUrl() {
        const match = window.location.pathname.match(/\/scenes\/(\d+)/);
        return match ? match[1] : null;
    }

    function calculateTagSimilarity(currentTags, otherTags) {
        const currentTagIds = new Set(currentTags.map(t => t.id));
        const matchingTags = otherTags.filter(t => currentTagIds.has(t.id));
        return matchingTags.length;
    }

    function getRandomSimilarScenes(currentScene, allScenes, count) {
        const currentTagIds = new Set(currentScene.tags.map(t => t.id));
        const similarScenes = allScenes
            .filter(scene => scene.id !== currentScene.id)
            .map(scene => {
                const matchingTags = scene.tags.filter(t => currentTagIds.has(t.id));
                return {
                    ...scene,
                    matchCount: matchingTags.length,
                    matchingTags: matchingTags
                };
            })
            .filter(scene => scene.matchCount >= MIN_MATCHING_TAGS && scene.matchCount <= MAX_MATCHING_TAGS);

        return similarScenes.sort(() => Math.random() - 0.5).slice(0, count);
    }

    function createCard(scene) {
        const card = document.createElement('a');
        card.href = `/scenes/${scene.id}`;
        card.className = 'similar-scene-card';

        const media = document.createElement('div');
        media.className = 'similar-scene-media';

        const img = document.createElement('img');
        img.src = scene.paths.screenshot;
        img.loading = "lazy";
        img.className = 'similar-scene-img';

        const video = document.createElement('video');
        video.className = 'similar-scene-preview';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = "none";

        if (scene.paths.preview) {
            video.src = scene.paths.preview;
        }

        media.appendChild(img);
        media.appendChild(video);

        card.addEventListener('mouseenter', () => {
            if (video.src) {
                img.style.opacity = 0;
                video.style.opacity = 1;
                video.play().catch(() => { });
            }
        });

        card.addEventListener('mouseleave', () => {
            if (video.src) {
                video.pause();
                video.style.opacity = 0;
                img.style.opacity = 1;
            }
        });

        const info = document.createElement('div');
        info.className = 'similar-scene-info';

        const title = document.createElement('div');
        title.className = 'similar-scene-title';
        title.textContent = scene.title || (scene.files[0] ? scene.files[0].basename : "Untitled");

        const tags = document.createElement('div');
        tags.className = 'similar-scene-tags';
        const tagNames = scene.matchingTags.map(t => t.name).join(', ');
        tags.textContent = tagNames;

        info.appendChild(title);
        info.appendChild(tags);

        card.appendChild(media);
        card.appendChild(info);

        return card;
    }

    // Renders the UI - tabs for mobile, inline for desktop
    function buildPluginUI(currentScene, allScenes, targetAnchor) {
        const isMobileView = isMobile();
        const initialScenes = getRandomSimilarScenes(currentScene, allScenes, TOTAL_SCENES);

        if (initialScenes.length === 0) return;

        if (isMobileView) {
            // MOBILE: Add as a tab
            buildTabUI(currentScene, allScenes, initialScenes);
            return; // Exit early to prevent inline UI from being created
        }

        // DESKTOP: Insert inline below video player
        buildInlineUI(currentScene, allScenes, initialScenes, targetAnchor);
    }

    // Tab-based UI for mobile
    function buildTabUI(currentScene, allScenes, initialScenes) {
        // Prevent duplicate tabs
        if (document.getElementById('similar-scenes-panel')) {
            console.log('Similar Scenes: Tab already exists, skipping creation');
            return;
        }

        // 1. Find the tabs container
        const tabsNav = document.querySelector('.scene-tabs .nav-tabs');
        const tabContent = document.querySelector('.scene-tabs .tab-content');

        if (!tabsNav || !tabContent) {
            console.warn('Similar Scenes: Could not find scene tabs structure');
            return;
        }

        // 2. Create the tab navigation button
        const tabNavItem = document.createElement('li');
        tabNavItem.className = 'nav-item';

        const tabNavLink = document.createElement('a');
        tabNavLink.className = 'nav-link';
        tabNavLink.href = '#similar-scenes-panel';
        tabNavLink.setAttribute('data-rb-event-key', 'similar-scenes');
        tabNavLink.setAttribute('data-toggle', 'tab'); // Bootstrap tab trigger
        tabNavLink.setAttribute('role', 'tab');
        tabNavLink.setAttribute('aria-controls', 'similar-scenes-panel');
        tabNavLink.textContent = 'Similar Scenes';

        tabNavItem.appendChild(tabNavLink);
        tabsNav.appendChild(tabNavItem);

        // 3. Create the tab panel content
        const tabPane = document.createElement('div');
        tabPane.id = 'similar-scenes-panel';
        tabPane.className = 'tab-pane';
        tabPane.setAttribute('role', 'tabpanel');
        tabPane.setAttribute('aria-labelledby', 'similar-scenes-tab');

        // 4. Build the content for the tab
        const wrapper = document.createElement('div');
        wrapper.className = 'similar-scenes-container';

        const header = document.createElement('div');
        header.className = 'similar-scenes-header';

        const title = document.createElement('h4');
        title.textContent = 'Similar Scenes';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn btn-secondary btn-sm similar-scenes-refresh-btn';
        refreshBtn.textContent = 'Refresh';

        const grid = document.createElement('div');
        grid.id = 'similar-scenes-grid';
        grid.className = 'similar-scenes-grid';

        initialScenes.forEach(s => grid.appendChild(createCard(s)));

        header.appendChild(title);
        header.appendChild(refreshBtn);

        wrapper.appendChild(header);
        wrapper.appendChild(grid);

        tabPane.appendChild(wrapper);
        tabContent.appendChild(tabPane);

        // Minimal click handler: prevent navigation, trigger tab manually if needed
        tabNavLink.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent # navigation

            // Deactivate all tabs first
            tabsNav.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            tabContent.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active', 'show'));

            // Activate Similar Scenes tab
            tabNavLink.classList.add('active');
            tabPane.classList.add('active', 'show');
        });


        // Use event delegation to deactivate Similar Scenes when ANY other tab is clicked
        // This doesn't interfere with other tabs' native behavior  
        tabsNav.addEventListener('click', (e) => {
            const clickedLink = e.target.closest('.nav-link');
            if (clickedLink && clickedLink !== tabNavLink) {
                // Another tab was clicked, deactivate Similar Scenes
                // Do this in a short timeout to let the native handler run first
                setTimeout(() => {
                    tabNavLink.classList.remove('active');
                    tabPane.classList.remove('active', 'show');
                }, 0);
            }
        });

        // Refresh Handler
        refreshBtn.onclick = async (e) => {
            e.preventDefault();
            const newSet = getRandomSimilarScenes(currentScene, allScenes, TOTAL_SCENES);
            grid.innerHTML = '';
            newSet.forEach(s => grid.appendChild(createCard(s)));
        };
    }

    // Inline UI for desktop
    function buildInlineUI(currentScene, allScenes, initialScenes, targetAnchor) {
        // Prevent duplicate wrappers
        if (document.getElementById('similar-scenes-wrapper')) {
            console.log('Similar Scenes: Inline wrapper already exists, skipping creation');
            return;
        }

        // Build wrapper
        const wrapper = document.createElement('div');
        wrapper.id = 'similar-scenes-wrapper'; // Unique ID for inline wrapper
        wrapper.className = 'similar-scenes-container';

        const header = document.createElement('div');
        header.className = 'similar-scenes-header';

        const title = document.createElement('h4');
        title.textContent = 'Similar Scenes';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn btn-secondary btn-sm similar-scenes-refresh-btn';
        refreshBtn.textContent = 'Refresh';

        const grid = document.createElement('div');
        grid.className = 'similar-scenes-grid';

        initialScenes.forEach(s => grid.appendChild(createCard(s)));

        header.appendChild(title);
        header.appendChild(refreshBtn);

        wrapper.appendChild(header);
        wrapper.appendChild(grid);

        // Insert inline after target anchor (below video player)
        if (targetAnchor) {
            targetAnchor.insertAdjacentElement('afterend', wrapper);
        } else {
            console.warn('Similar Scenes: Could not find target anchor for inline UI.');
            return;
        }

        // Refresh Handler
        refreshBtn.onclick = async (e) => {
            e.preventDefault();
            const newSet = getRandomSimilarScenes(currentScene, allScenes, TOTAL_SCENES);
            grid.innerHTML = '';
            newSet.forEach(s => grid.appendChild(createCard(s)));
        };
    }

    async function displaySimilarScenes() {
        const sceneId = getSceneIdFromUrl();
        if (!sceneId) return;

        // Check if tabs exist
        const tabsElement = document.querySelector('.scene-tabs');
        if (!tabsElement) return;

        // Find target anchor for desktop inline insertion
        const targetAnchor = tabsElement.closest('.row');

        // Ensure plugin isn't duplicated (check both mobile tab and desktop wrapper)
        if (document.getElementById('similar-scenes-panel') || document.getElementById('similar-scenes-wrapper')) return;

        if (initCheckInterval) clearInterval(initCheckInterval);

        try {
            // 1. Get Data
            const currentData = await graphqlRequest(GET_SCENE_QUERY, { id: sceneId });
            if (!currentData || !currentData.findScene) throw new Error("Scene data not found");

            const currentScene = currentData.findScene;
            if (!currentScene.tags.length) return;

            const allData = await graphqlRequest(FIND_SCENES_QUERY, { filter: { per_page: -1 } });
            const allScenes = allData.findScenes.scenes;

            buildPluginUI(currentScene, allScenes, targetAnchor);

        } catch (err) {
            console.error("Similar Scenes Plugin Error:", err);
            if (!initCheckInterval) startPluginCheck();
        }
    }

    // --- Plugin Lifecycle Management ---

    function startPluginCheck() {
        if (initCheckInterval) clearInterval(initCheckInterval);
        initCheckInterval = setInterval(() => {
            const isScenePage = window.location.pathname.includes("/scenes/") && getSceneIdFromUrl();
            const tabExists = document.getElementById('similar-scenes-panel');
            const wrapperExists = document.getElementById('similar-scenes-wrapper');

            if (isScenePage && !tabExists && !wrapperExists) {
                displaySimilarScenes();
            } else if (!isScenePage) {
                // Remove mobile tab when navigating away from scene page
                if (tabExists) {
                    const tabNavLink = document.querySelector('a[href="#similar-scenes-panel"]');
                    if (tabNavLink && tabNavLink.parentElement) {
                        tabNavLink.parentElement.remove();
                    }
                    tabExists.remove();
                }
                // Remove desktop wrapper when navigating away
                if (wrapperExists) {
                    wrapperExists.remove();
                }
            }
        }, 500);
    }

    // Use URL change listener for cleanup/re-run when navigating between scenes/pages
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;

            // Clean up mobile tab
            const tabPanel = document.getElementById('similar-scenes-panel');
            if (tabPanel) {
                const tabNavLink = document.querySelector('a[href="#similar-scenes-panel"]');
                if (tabNavLink && tabNavLink.parentElement) {
                    tabNavLink.parentElement.remove();
                }
                tabPanel.remove();
            }

            // Clean up desktop wrapper
            const wrapper = document.getElementById('similar-scenes-wrapper');
            if (wrapper) {
                wrapper.remove();
            }

            if (window.location.pathname.includes("/scenes/")) {
                if (initCheckInterval) clearInterval(initCheckInterval);
                startPluginCheck();
            }
        }
    }).observe(document.body, { subtree: true, childList: true });

    // Initial load
    startPluginCheck();

})();