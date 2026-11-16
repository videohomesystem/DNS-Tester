// --- Global State ---
let servers = [];
let isChecking = false;
let currentLang = localStorage.getItem('dns_checker_lang') || 'ru';
const langOrder = ['ru', 'en'];

// --- DOM Elements ---
const elements = {
    dnsList: document.getElementById('dns-list'),
    mainButton: document.getElementById('main-button'),
    buttonText: document.getElementById('button-text'),
    buttonLoader: document.getElementById('button-loader'),
    chartPercent: document.getElementById('chart-percent'),
    donutFg: document.getElementById('donut-fg'),
    themeToggle: document.getElementById('theme-toggle'),
    langToggle: document.getElementById('lang-toggle'),
    langFlag: document.getElementById('lang-flag'),
    themeSun: document.getElementById('theme-icon-sun'),
    themeMoon: document.getElementById('theme-icon-moon'),
    ipAddress: document.getElementById('ip-address'),
    geolocation: document.getElementById('geolocation'),
    countryFlag: document.getElementById('country-flag'),
    searchBox: document.getElementById('search-box'),
    addDnsButton: document.getElementById('add-dns-button'),
    historyButton: document.getElementById('history-button'),
    shareButton: document.getElementById('share-button'),
    sharePage: document.getElementById('share-page'),
    shareList: document.getElementById('share-list'),
    shareContentArea: document.getElementById('share-content-area'),
    downloadButton: document.getElementById('download-button'),
    shareScreenshotButton: document.getElementById('share-screenshot-button'),
    closeSharePage: document.getElementById('close-share-page'),
};

// --- Translation helper (with cache) ---
const _tCache = new Map();

function t(key, vars) {
    if (key == null) return '';
    const cacheKey = currentLang + '::' + key;
    let str = _tCache.get(cacheKey);
    if (str === undefined) {
        const dict = (typeof translations !== 'undefined' && translations[currentLang])
            || (typeof translations !== 'undefined' && translations.en)
            || {};
        str = dict[key] ?? key;
        _tCache.set(cacheKey, str);
    }
    if (vars) {
        for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
    }
    return str;
}

function tCountry(code) {
    if (!code) return '';
    const dict = (typeof translations !== 'undefined' && translations[currentLang]) || {};
    return (dict.countries && dict.countries[code]) || code;
}

function getPingColor(ping) {
    if (ping === null) return 'hsl(0, 0%, 50%)';
    const saturation = 90;
    const lightness = 50;
    const hue = ping <= 300 ? 120 - (ping / 300) * 60 : (ping <= 600 ? 60 - ((ping - 300) / 300) * 60 : 0);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getGradientWidthPercentage(ping) {
    if (ping === null) return 0;
    const percentage = (ping / 800) * 100;
    return Math.max(5, Math.min(100, percentage));
}

function formatDate(iso) {
    const locale = currentLang === 'ru' ? 'ru-RU' : 'en-GB';
    try { return new Date(iso).toLocaleString(locale); } catch { return iso; }
}

// --- Local Storage ---
function getCustomServers() {
    try { return JSON.parse(localStorage.getItem('customDnsServers') || '[]'); }
    catch { return []; }
}

function saveCustomServers(customServers) {
    localStorage.setItem('customDnsServers', JSON.stringify(customServers));
}

function loadServers() {
    const initialCopy = typeof initialServers !== 'undefined'
        ? JSON.parse(JSON.stringify(initialServers))
        : [];
    servers = [...initialCopy, ...getCustomServers()];
}

// --- Language ---
function updateLanguage(lang) {
    if (typeof translations === 'undefined' || !translations[lang]) return;

    currentLang = lang;
    const data = translations[lang];

    document.documentElement.lang = lang;
    document.documentElement.dir = data.dir;
    if (elements.langFlag) elements.langFlag.src = data.flag;
    if (data.font) document.body.style.fontFamily = data.font;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });

    if (elements.searchBox) elements.searchBox.placeholder = t('searchPlaceholder');

    updateMainButton();
    renderList();
    localStorage.setItem('dns_checker_lang', lang);
}

function toggleLanguage() {
    const idx = langOrder.indexOf(currentLang);
    updateLanguage(langOrder[(idx + 1) % langOrder.length]);
}

// --- Render ---
function renderList() {
    const searchTerm = (elements.searchBox?.value || '').toLowerCase();

    const filteredServers = servers.filter(s =>
        s.name.toLowerCase().includes(searchTerm) ||
        t(s.group).toLowerCase().includes(searchTerm) ||
        (s.country && tCountry(s.country).toLowerCase().includes(searchTerm)) ||
        (s.url && s.url.toLowerCase().includes(searchTerm))
    );

    elements.dnsList.innerHTML = '';
    if (filteredServers.length === 0) {
        elements.dnsList.innerHTML =
            `<p class="text-center text-gray-400 col-span-full mt-8">${t('noServers')}</p>`;
        return;
    }

    filteredServers.forEach((server, index) => {
        const div = document.createElement('div');
        div.className = 'dns-item-box flex items-center justify-between p-2.5 rounded-xl hover:!bg-[var(--hover-bg)] cursor-pointer';
        div.style.opacity = '0';
        div.style.animation = `fadeInUp 0.5s ease-out ${index * 0.03}s forwards`;
        div.onclick = () => showServerInfoModal(server);

        let statusHtml;
        div.style.backgroundImage = 'none';

        switch (server.status) {
            case 'success': {
                const pingColor = getPingColor(server.ping);
                const gradientColor = pingColor.replace('hsl', 'hsla').replace(')', ', 0.35)');
                const widthPercent = getGradientWidthPercentage(server.ping);
                div.style.backgroundImage =
                    `linear-gradient(to right, ${gradientColor} ${widthPercent}%, transparent ${widthPercent}%)`;
                statusHtml = `<div class="flex items-center justify-end text-xs"><span style="color: ${pingColor};" class="text-lg mx-1.5">●</span><span class="font-semibold">${server.ping}ms</span></div>`;
                break;
            }
            case 'error':
                statusHtml = `<div class="flex items-center justify-end text-xs"><span class="text-red-400 text-lg mx-1.5">●</span><span class="text-gray-400">${t('error')}</span></div>`;
                break;
            case 'loading':
                statusHtml = `<div class="loader !w-4 !h-4 mx-auto"></div>`;
                break;
            default:
                statusHtml = '';
        }

        const bestIcon = server.isBest
            ? `<i class="fa-solid fa-star text-yellow-400 mx-2 text-xs"></i>` : '';
        const deleteButton = server.isCustom
            ? `<button data-server-id="${server.id}" class="delete-button p-1 text-[var(--icon-color)] hover:text-red-500 transition-colors z-10"><i class="fa-solid fa-trash"></i></button>`
            : '';

        div.innerHTML = `
            <div class="flex items-center flex-grow min-w-0 gap-1 pointer-events-none">
                ${bestIcon}
                <span class="font-medium text-xs text-[var(--text-color)] truncate">${server.name}</span>
            </div>
            <div class="flex items-center flex-shrink-0 gap-2">
                <div class="transition-all duration-300 w-16 text-center">${statusHtml}</div>
                <button class="info-button p-1 text-[var(--icon-color)] hover:text-blue-500 transition-colors"><i class="fa-solid fa-circle-info"></i></button>
                ${deleteButton}
            </div>`;
        elements.dnsList.appendChild(div);
    });

    elements.dnsList.querySelectorAll('.delete-button').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const serverId = e.currentTarget.dataset.serverId;
            const server = servers.find(s => s.id === serverId);
            if (!server) return;

            const msg = t('deleteConfirmMsg', { name: `<span class="font-bold mx-1">${server.name}</span>` });
            const content = `
                <h3 class="text-lg font-bold mb-4">${t('deleteConfirmTitle')}</h3>
                <p class="mb-5">${msg}</p>
                <div class="flex justify-end gap-3">
                    <button class="modal-cancel-button bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">${t('cancel')}</button>
                    <button class="modal-confirm-delete bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">${t('delete')}</button>
                </div>`;
            const modal = createCustomModal(content);
            modal.querySelector('.modal-cancel-button').onclick = () => removeModal(modal);
            modal.querySelector('.modal-confirm-delete').onclick = () => {
                saveCustomServers(getCustomServers().filter(s => s.id !== serverId));
                loadServers();
                renderList();
                removeModal(modal);
            };
        });
    });
}

function updateMainButton() {
    elements.mainButton.disabled = isChecking;
    elements.buttonLoader.classList.toggle('hidden', !isChecking);
    elements.buttonText.innerText = isChecking ? t('checking') : t('checkServers');
}

function updateChart(percent) {
    elements.donutFg.style.strokeDashoffset = 100 - percent;
    elements.chartPercent.textContent = `${Math.round(percent)}%`;
}

// --- IP ---
async function fetchUserIP() {
    try {
        const res = await fetch('https://ifconfig.me/all.json');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (elements.ipAddress) elements.ipAddress.textContent = data.ip_addr || '---';
        if (elements.geolocation) {
            const parts = [data.city, data.country].filter(Boolean);
            elements.geolocation.textContent = parts.length ? parts.join(', ') : '---';
        }
    } catch {
        if (elements.ipAddress) elements.ipAddress.textContent = '---';
        if (elements.geolocation) elements.geolocation.textContent = '---';
    }
}

// --- Ping measurement ---
async function measurePing(url) {
    try {
        const warmupController = new AbortController();
        setTimeout(() => warmupController.abort(), 1500);
        await fetch(url, {
            method: 'HEAD', mode: 'no-cors', cache: 'no-cache',
            signal: warmupController.signal
        });
    } catch { /* ignore warm-up errors */ }

    const startTime = performance.now();
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 4000);
        await fetch(url, {
            method: 'HEAD', mode: 'no-cors', cache: 'no-cache',
            signal: controller.signal
        });
        return Math.round(performance.now() - startTime);
    } catch {
        return null;
    }
}

// Simple concurrency pool (limits parallel checks)
async function pool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return results;
}

async function checkDnsServers() {
    isChecking = true;
    servers.forEach(s => { s.status = 'loading'; s.ping = null; s.isBest = false; });
    renderList();
    updateMainButton();
    updateChart(0);
    elements.chartPercent.textContent = '...';

    await pool(servers, 8, async (server) => {
        const ping = await measurePing(server.url);
        server.status = ping !== null ? 'success' : 'error';
        server.ping = ping;
    });

    const successful = servers.filter(s => s.status === 'success');
    if (successful.length > 0) {
        successful.sort((a, b) => a.ping - b.ping)[0].isBest = true;
    }
    servers.sort((a, b) => {
        if (a.status === 'success' && b.status !== 'success') return -1;
        if (a.status !== 'success' && b.status === 'success') return 1;
        if (a.status === 'success' && b.status === 'success') return a.ping - b.ping;
        return 0;
    });

    isChecking = false;
    updateChart(servers.length ? (successful.length / servers.length) * 100 : 0);
    saveHistory();
    elements.shareButton.disabled = false;
    renderList();
    updateMainButton();
}

function saveHistory() {
    const history = JSON.parse(localStorage.getItem('dnsTestHistory') || '[]');
    const top = servers.find(s => s.isBest);
    history.unshift({
        date: new Date().toISOString(),
        topServer: top ? top.name : 'N/A',
        ping: top ? top.ping : 'N/A'
    });
    localStorage.setItem('dnsTestHistory', JSON.stringify(history.slice(0, 5)));
}

// --- Modals ---
function createCustomModal(contentHtml) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] transition-opacity duration-300 opacity-0';
    modal.innerHTML = `<div class="bg-[var(--card-bg)] backdrop-blur-xl p-5 rounded-2xl shadow-lg w-full max-w-md transition-transform duration-300 scale-95">${contentHtml}</div>`;

    // Клик по фону (не по карточке) — закрыть
    modal.addEventListener('click', (e) => {
        if (e.target === modal) removeModal(modal);
    });

    // Esc — закрыть
    const onKey = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            removeModal(modal);
        }
    };
    document.addEventListener('keydown', onKey);

    // Чистим слушатель, когда модалка реально удалена
    const observer = new MutationObserver(() => {
        if (!document.body.contains(modal)) {
            document.removeEventListener('keydown', onKey);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });

    document.body.appendChild(modal);
    setTimeout(() => {
        modal.classList.add('opacity-100');
        modal.firstElementChild.classList.add('scale-100');
    }, 10);
    return modal;
}

function removeModal(modal) {
    if (!modal) return;
    modal.classList.remove('opacity-100');
    modal.firstElementChild.classList.remove('scale-100');
    setTimeout(() => modal.remove(), 300);
}

function showModal(contentHtml) {
    const modal = createCustomModal(`
        ${contentHtml}
        <button class="modal-close-button mt-5 bg-blue-600 text-white px-5 py-2 rounded-lg w-full text-sm hover:bg-blue-700 transition">${t('back')}</button>
    `);
    modal.querySelector('.modal-close-button').onclick = () => removeModal(modal);
    modal.querySelectorAll('[data-copy-target]').forEach(copyBtn => {
        copyBtn.onclick = () => {
            const text = modal.querySelector(`#${copyBtn.dataset.copyTarget}`).innerText.trim();
            navigator.clipboard.writeText(text).then(() => {
                const original = copyBtn.innerText;
                copyBtn.innerText = t('copied');
                setTimeout(() => { copyBtn.innerText = original; }, 1500);
            });
        };
    });
}

function showServerInfoModal(server) {
    const createRow = (label, val, id) => {
        if (!val || val === 'N/A') return '';
        return `<div class="mt-3 pt-3 border-t border-[var(--item-border-color)]">
            <p class="font-bold text-sm mb-1">${label}:</p>
            <div class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-left p-3 rounded-md font-mono text-xs select-all break-all" id="${id}" dir="ltr">${val}</div>
            <button data-copy-target="${id}" class="mt-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-1 rounded text-xs w-full sm:w-auto">${t('copy')}</button>
        </div>`;
    };

    const content = `
        <h3 class="text-base font-bold mb-3 text-center">${server.name}</h3>
        <div class="text-xs space-y-2 mb-3">
            <p><strong>${t('groupLabel')}:</strong> ${t(server.group)}</p>
            <p><strong>${t('featuresLabel')}:</strong> ${server.features.map(f => t(f)).join(', ')}</p>
            <p><strong>${t('privacyLabel')}:</strong> ${t(server.privacy)}</p>
            ${server.country && server.country !== 'N/A'
                ? `<p><strong>${t('countryLabel')}:</strong> ${tCountry(server.country)}</p>`
                : ''}
        </div>
        ${createRow('DNS over HTTPS', server.url, `url-${server.id}`)}
        ${createRow('IPv4', server.ipv4, `ipv4-${server.id}`)}
        ${createRow('IPv6', server.ipv6, `ipv6-${server.id}`)}
    `;
    showModal(content);
}

// --- Event Listeners ---
elements.mainButton.addEventListener('click', checkDnsServers);
elements.searchBox.addEventListener('input', renderList);

elements.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('dns_checker_theme', isDark ? 'dark' : 'light');
    elements.themeSun.classList.toggle('hidden', isDark);
    elements.themeMoon.classList.toggle('hidden', !isDark);
});

if (elements.langToggle) {
    elements.langToggle.addEventListener('click', toggleLanguage);
}

elements.addDnsButton.addEventListener('click', () => {
    const content = `
        <h3 class="text-lg font-bold mb-4">${t('addCustomDns')}</h3>
        <form id="add-dns-form" class="space-y-4">
            <div><label class="block text-sm font-medium mb-1">${t('customName')}</label><input type="text" id="c-name" class="w-full bg-gray-100 dark:bg-gray-800 p-2 rounded-lg text-sm"></div>
            <div><label class="block text-sm font-medium mb-1">${t('customUrl')}</label><input type="url" id="c-url" class="w-full bg-gray-100 dark:bg-gray-800 p-2 rounded-lg text-sm text-left" dir="ltr"></div>
            <div class="pt-2 flex justify-end gap-3">
                 <button type="button" class="c-cancel bg-gray-500 text-white px-4 py-2 rounded-lg">${t('cancel')}</button>
                 <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded-lg">${t('save')}</button>
            </div>
        </form>`;
    const modal = createCustomModal(content);
    modal.querySelector('.c-cancel').onclick = () => removeModal(modal);
    modal.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('c-name').value.trim();
        const url = document.getElementById('c-url').value.trim();
        if (!name || !url) return alert(t('errorEmpty'));

        const newServer = {
            id: `custom-${Date.now()}`,
            name, url,
            features: ['custom'],
            privacy: 'unknown',
            group: 'custom',
            country: 'N/A',
            isCustom: true,
            status: 'neutral',
            ping: null,
            ipv4: 'N/A',
            ipv6: 'N/A'
        };
        const customs = getCustomServers();
        customs.push(newServer);
        saveCustomServers(customs);

        loadServers();
        renderList();
        removeModal(modal);
    };
});

elements.historyButton.addEventListener('click', () => {
    const history = JSON.parse(localStorage.getItem('dnsTestHistory') || '[]');
    let html = `<h3 class="text-lg font-bold mb-4">${t('history')}</h3>`;
    if (history.length === 0) {
        html += `<p>${t('noHistory')}</p>`;
    } else {
        html += `<ul class="space-y-2 text-sm">`;
        history.forEach(h => {
            html += `<li class="p-2 bg-black/10 rounded-lg flex justify-between"><span>${formatDate(h.date)}</span><span class="font-bold">${h.topServer} (${h.ping}ms)</span></li>`;
        });
        html += `</ul>`;
    }
    showModal(html);
});

// --- Share & Download ---
elements.shareButton.addEventListener('click', () => {
    elements.shareList.innerHTML = '';
    servers.forEach(s => {
        const color = s.status === 'success' ? getPingColor(s.ping) : '#9ca3af';
        const txt = s.status === 'success' ? `${s.ping}ms` : '-';
        elements.shareList.innerHTML +=
            `<div class="dns-item-box flex flex-col items-center p-2 rounded-lg"><span class="truncate w-full text-center font-medium">${s.name}</span><span style="color:${color}" class="font-bold">${txt}</span></div>`;
    });
    elements.sharePage.classList.remove('hidden');
    setTimeout(() => elements.sharePage.classList.remove('opacity-0'), 10);
});

elements.closeSharePage.addEventListener('click', () => {
    elements.sharePage.classList.add('opacity-0');
    setTimeout(() => elements.sharePage.classList.add('hidden'), 300);
});

elements.downloadButton.addEventListener('click', () => {
    html2canvas(elements.shareContentArea, {
        backgroundColor: document.documentElement.classList.contains('dark') ? '#0D1117' : '#F9FAFB',
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'dns-result.png';
        link.href = canvas.toDataURL();
        link.click();
    });
});

elements.shareScreenshotButton.addEventListener('click', () => {
    html2canvas(elements.shareContentArea, {
        backgroundColor: document.documentElement.classList.contains('dark') ? '#0D1117' : '#F9FAFB',
        scale: 2
    }).then(canvas => {
        canvas.toBlob(blob => {
            const file = new File([blob], 'dns-result.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: 'DNS Result' });
            } else {
                alert(t('shareNotSupported'));
            }
        });
    });
});

// --- Initialization ---
(function init() {
    const theme = localStorage.getItem('dns_checker_theme') || 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    elements.themeSun.classList.toggle('hidden', theme !== 'dark');
    elements.themeMoon.classList.toggle('hidden', theme === 'dark');

    loadServers();

    const savedLang = localStorage.getItem('dns_checker_lang') || 'ru';
    updateLanguage(savedLang);

    if (typeof fetchUserIP === 'function') fetchUserIP();
})();
