document.addEventListener('DOMContentLoaded', async () => {
    console.log("Magpie Drive System v2.0 Loaded");
    let currentPath = '/';
    let userRole = null;
    let currentUser = null;
    let authToken = localStorage.getItem('auth_token');
    let selectedFiles = new Set();
    let currentFiles = [];
    let searchTimeout = null;
    let sortState = { key: 'name', order: 'asc' }; // 'asc' or 'desc'

    // DOM Elements
    const fileListEl = document.getElementById('fileList');
    const breadcrumbEl = document.getElementById('breadcrumb');
    
    // Buttons
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadFolderBtn = document.getElementById('uploadFolderBtn');
    const newDirBtn = document.getElementById('newDirBtn');
    const moveBtn = document.getElementById('moveBtn');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    const batchDownloadBtn = document.getElementById('batchDownloadBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const userInfoEl = document.getElementById('userInfo');
    const adminToolbar = document.getElementById('adminToolbar');
    const uploadProgressContainer = document.getElementById('uploadProgressContainer');
    const progressList = document.getElementById('progressList');
    const selectAllCheckbox = document.getElementById('selectAll');
    const dragOverlay = document.getElementById('dragOverlay');

    // Viewer Elements
    const viewerOverlay = document.getElementById('viewerOverlay');
    const viewerBody = document.getElementById('viewerBody');
    const viewerFilename = document.getElementById('viewerFilename');
    const viewerDownloadBtn = document.getElementById('viewerDownloadBtn');
    const viewerCloseBtn = document.getElementById('viewerCloseBtn');

    // Modal Elements
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalInputContainer = document.getElementById('modalInputContainer');
    const modalInput = document.getElementById('modalInput');
    const modalOkBtn = document.getElementById('modalOkBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    // --- Auth Check ---
    if (!authToken) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const res = await fetchWithAuth('/api/me');
        if (!res.ok) throw new Error('Auth failed');
        const data = await res.json();
        currentUser = data.username;
        userRole = data.role;
        
        userInfoEl.querySelector('span').innerText = currentUser;
        if (userRole === 'admin') {
            adminToolbar.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Auth error:', e);
        logout();
        return;
    }

    // --- Initial Load ---
    loadFiles(currentPath);

    // --- Header Sorting ---
    const headers = document.querySelectorAll('.file-list-header > div');
    headers.forEach(header => {
        if (header.classList.contains('col-name')) {
            header.style.cursor = 'pointer';
            header.onclick = () => sortFiles('name');
        } else if (header.classList.contains('col-size')) {
            header.style.cursor = 'pointer';
            header.onclick = () => sortFiles('size');
        } else if (header.classList.contains('col-date')) {
            header.style.cursor = 'pointer';
            header.onclick = () => sortFiles('mtime');
        }
    });

    // --- Event Listeners ---
    if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
    if (uploadFolderBtn) uploadFolderBtn.addEventListener('click', () => folderInput.click());
    
    if (newDirBtn) newDirBtn.addEventListener('click', createNewFolder);
    if (moveBtn) moveBtn.addEventListener('click', moveSelectedFiles);
    if (batchDeleteBtn) batchDeleteBtn.addEventListener('click', deleteSelectedFiles);
    if (batchDownloadBtn) batchDownloadBtn.addEventListener('click', batchDownload);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleSelectAll);

    // Search Listeners
    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 500);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                performSearch();
            }
            if (e.key === 'Escape') {
                searchInput.value = '';
                loadFiles(currentPath);
            }
        });
    }
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploads(e.target.files);
            fileInput.value = '';
        }
    });

    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleUploads(e.target.files);
                folderInput.value = '';
            }
        });
    }

    // --- Drag & Drop Logic --- 
    // 我是天才，解决了鼠标进出子元素反复触发的傻逼问题
    let dragCounter = 0;

    document.body.addEventListener('dragenter', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter++;
        if (userRole === 'admin') {
            dragOverlay.classList.remove('hidden');
            dragOverlay.classList.add('active');
        }
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
    });

    document.body.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            dragOverlay.classList.add('hidden');
            dragOverlay.classList.remove('active');
        }
    });

    document.body.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter = 0;
        dragOverlay.classList.add('hidden');
        dragOverlay.classList.remove('active');

        if (userRole === 'admin') {
            const items = Array.from(e.dataTransfer.items);
            if (items && items.length > 0) {
                const files = await scanFiles(items);
                handleUploads(files);
            } else if (e.dataTransfer.files.length > 0) {
                handleUploads(e.dataTransfer.files);
            }
        }
    });

    if (viewerCloseBtn) viewerCloseBtn.addEventListener('click', closeViewer);
    if (viewerOverlay) {
        viewerOverlay.addEventListener('click', (e) => {
            if (e.target === viewerOverlay) closeViewer();
        });
    }

    // Context Menu Listener
    document.addEventListener('contextmenu', (e) => {
        const fileItem = e.target.closest('.file-item');
        if (fileItem) {
            e.preventDefault();
            const filename = fileItem.dataset.name;
            showContextMenu(e.pageX, e.pageY, filename);
        } else {
            hideContextMenu();
        }
    });
    document.addEventListener('click', hideContextMenu);

    // --- Modal System Functions --- 
    // 修复过的屎山
    // 模态框不重置干净下次准出问题，信我

    function resetModal() {
        modalOverlay.classList.add('hidden');
        modalInputContainer.classList.add('hidden');
        modalCancelBtn.classList.add('hidden');
        modalInput.value = '';
        modalTitle.innerText = 'SYSTEM_MESSAGE';
        
        // Clear handlers
        modalOkBtn.onclick = null;
        modalCancelBtn.onclick = null;
        modalInput.onkeydown = null;
    }

    function showAlert(message) {
        return new Promise((resolve) => {
            resetModal();
            modalMessage.innerText = message;
            modalOverlay.classList.remove('hidden');
            
            modalOkBtn.innerText = 'ACKNOWLEDGE';
            modalOkBtn.onclick = () => {
                resetModal();
                resolve();
            };
        });
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            resetModal();
            modalMessage.innerText = message;
            modalCancelBtn.classList.remove('hidden');
            modalOverlay.classList.remove('hidden');
            
            modalOkBtn.innerText = 'CONFIRM';
            modalOkBtn.onclick = () => {
                resetModal();
                resolve(true);
            };
            
            modalCancelBtn.onclick = () => {
                resetModal();
                resolve(false);
            };
        });
    }

    function showPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            resetModal();
            modalMessage.innerText = message;
            modalInput.value = defaultValue;
            modalInputContainer.classList.remove('hidden');
            modalCancelBtn.classList.remove('hidden');
            modalOverlay.classList.remove('hidden');
            
            modalOkBtn.innerText = 'EXECUTE';
            modalOkBtn.onclick = () => {
                const val = modalInput.value;
                resetModal();
                resolve(val);
            };
            
            modalCancelBtn.onclick = () => {
                resetModal();
                resolve(null);
            };

            // Focus input
            setTimeout(() => modalInput.focus(), 100);
            
            // Handle Enter key in input
            modalInput.onkeydown = (e) => {
                if (e.key === 'Enter') modalOkBtn.click();
                if (e.key === 'Escape') modalCancelBtn.click();
            };
        });
    }


    // --- Core Functions ---

    function logout() {
        localStorage.removeItem('auth_token');
        window.location.href = '/login.html';
    }

    async function fetchWithAuth(url, options = {}) {
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${authToken}`;
        options.headers = headers;
        return fetch(url, options);
    }

    async function loadFiles(path) {
        if (searchInput) searchInput.value = ''; // Clear search on navigation
        currentPath = path;
        updateBreadcrumb(path);
        selectedFiles.clear();
        updateSelectionUI();
        
        fileListEl.innerHTML = '<div class="loading">SCANNING SECTOR...</div>';

        try {
            const encodedPath = encodeURIComponent(path);
            const response = await fetchWithAuth(`/api/list?path=${encodedPath}`);
            
            if (response.status === 401 || response.status === 403) {
                if (response.status === 401) logout();
                return;
            }
            
            if (!response.ok) throw new Error('Failed to load files');
            currentFiles = await response.json();
            renderFiles(currentFiles);
        } catch (error) {
            fileListEl.innerHTML = `<div class="loading" style="color:var(--alert-red)">ERROR: ${error.message}</div>`;
        }
    }

    function sortFiles(key) {
        if (sortState.key === key) {
            sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.key = key;
            sortState.order = 'asc';
        }
        renderFiles(currentFiles);
    }

    function renderFiles(files) {
        fileListEl.innerHTML = '';
        
        files.sort((a, b) => {
            // Always directories first
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }

            let valA = a[sortState.key];
            let valB = b[sortState.key];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortState.order === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.order === 'asc' ? 1 : -1;
            return 0;
        });

        // Update sorting indicators
        document.querySelectorAll('.file-list-header > div').forEach(h => {
             h.innerHTML = h.innerHTML.replace(/ <i class="fas fa-caret-.*"><\/i>/, '');
             if ((h.classList.contains('col-name') && sortState.key === 'name') ||
                 (h.classList.contains('col-size') && sortState.key === 'size') ||
                 (h.classList.contains('col-date') && sortState.key === 'mtime')) {
                     const icon = sortState.order === 'asc' ? 'down' : 'up';
                     h.innerHTML += ` <i class="fas fa-caret-${icon}"></i>`;
             }
        });

        if (files.length === 0) {
            fileListEl.innerHTML = '<div class="loading">SECTOR EMPTY</div>';
            return;
        }

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = `file-item ${file.isDirectory ? 'folder' : 'file'}`;
            item.dataset.name = file.name;
            
            const iconClass = file.isDirectory ? 'fa-folder' : getFileIcon(file.name);
            const sizeText = file.isDirectory ? '<DIR>' : formatSize(file.size);
            const dateText = new Date(file.mtime).toLocaleDateString();

            const checkboxHtml = `<input type="checkbox" class="file-checkbox" ${selectedFiles.has(file.name) ? 'checked' : ''}>`;

            let actionsHtml = '';
            if (!file.isDirectory) {
                if (getPreviewType(file.name)) {
                    actionsHtml += `<button class="action-btn-icon preview" title="Preview"><i class="fas fa-eye"></i></button>`;
                }
                actionsHtml += `<button class="action-btn-icon copy-link" title="Copy Direct Link"><i class="fas fa-link"></i></button>`;
                actionsHtml += `<button class="action-btn-icon download" title="Download"><i class="fas fa-download"></i></button>`;
            }

            const parentDir = file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
            const nameHtml = file.path 
                ? `${file.name} <span class="file-path-hint">${parentDir || '/'}</span>` 
                : file.name;

            // Mobile Kebab
            const kebabHtml = `<button class="mobile-action-btn"><i class="fas fa-ellipsis-v"></i></button>`;

            item.innerHTML = `
                <div class="col-select">${checkboxHtml}</div>
                <div class="col-icon"><i class="fas ${iconClass}"></i></div>
                <div class="col-name" title="${file.path || file.name}">${nameHtml}</div>
                <div class="col-size">${sizeText}</div>
                <div class="col-date">${dateText}</div>
                <div class="col-actions">${actionsHtml}</div>
                <div class="col-kebab">${kebabHtml}</div>
            `;

            const kebabBtn = item.querySelector('.mobile-action-btn');
            if (kebabBtn) {
                kebabBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = kebabBtn.getBoundingClientRect();
                    showContextMenu(rect.left - 150, rect.bottom, file.name);
                });
            }

            item.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn-icon') || e.target.closest('.file-checkbox')) return;
                toggleFileSelection(file.name);
            });

            const checkbox = item.querySelector('.file-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleFileSelection(file.name, e.target.checked);
            });

            item.addEventListener('dblclick', (e) => {
                if (file.isDirectory) {
                    const nextPath = file.path ? file.path : (currentPath === '/' ? file.name : `${currentPath}/${file.name}`);
                    loadFiles(nextPath);
                } else {
                    openFileViewer(file.name, file.path);
                }
            });

            const previewBtn = item.querySelector('.preview');
            if (previewBtn) previewBtn.addEventListener('click', (e) => { e.stopPropagation(); openFileViewer(file.name, file.path); });

            const downloadBtn = item.querySelector('.download');
            if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(file.name, file.path); });

            const copyBtn = item.querySelector('.copy-link');
            if (copyBtn) copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyDirectLink(file.name, file.path); });

            fileListEl.appendChild(item);
        });
        updateSelectionUI();
    }

    function toggleFileSelection(filename, forceState = null) {
        if (forceState !== null) {
            if (forceState) selectedFiles.add(filename);
            else selectedFiles.delete(filename);
        } else {
            if (selectedFiles.has(filename)) selectedFiles.delete(filename);
            else selectedFiles.add(filename);
        }
        
        const rows = fileListEl.querySelectorAll('.file-item');
        rows.forEach(row => {
            if (row.dataset.name === filename) {
                const cb = row.querySelector('.file-checkbox');
                if (selectedFiles.has(filename)) {
                    row.classList.add('selected');
                    cb.checked = true;
                } else {
                    row.classList.remove('selected');
                    cb.checked = false;
                }
            }
        });
        updateSelectionUI();
    }

    function toggleSelectAll(e) {
        const isChecked = e.target.checked;
        if (isChecked) {
            currentFiles.forEach(f => selectedFiles.add(f.name));
        } else {
            selectedFiles.clear();
        }
        renderFiles(currentFiles);
    }

    function updateSelectionUI() {
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = currentFiles.length > 0 && selectedFiles.size === currentFiles.length;
        }
    }

    function resolveFilePath(filename, fullPath = null) {
        return fullPath ? fullPath : (currentPath === '/' ? filename : `${currentPath}/${filename}`);
    }

    function buildFileUrl(filePath) {
        return `/${encodeURIComponent(filePath.replace(/^\//, ''))}?token=${encodeURIComponent(authToken)}`;
    }

    function getPreviewType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const imageTypes = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
        const videoTypes = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);
        const audioTypes = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);
        const textTypes = new Set(['txt', 'md', 'js', 'css', 'html', 'json', 'xml', 'log', 'sh', 'bat', 'yml', 'yaml', 'ini']);
        if (imageTypes.has(ext)) return 'image';
        if (videoTypes.has(ext)) return 'video';
        if (audioTypes.has(ext)) return 'audio';
        if (textTypes.has(ext)) return 'text';
        return null;
    }

    // --- Action Functions ---

    async function copyDirectLink(filename, fullPath = null) {
        // 1. 现代Clipboard API
        // 2. 过时的execCommand
        // 3. 最原始的手动复制框
        // 总有一款能他妈用
        const filePath = fullPath ? fullPath : (currentPath === '/' ? filename : `${currentPath}/${filename}`);
        const url = `${window.location.origin}/${encodeURIComponent(filePath.replace(/^\//, ''))}?token=${encodeURIComponent(authToken)}`;
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
                showToast('LINK COPIED TO CLIPBOARD');
            } else {
                throw new Error('Clipboard API unavailable');
            }
        } catch (err) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) {
                    showToast('LINK COPIED TO CLIPBOARD');
                } else {
                    throw new Error('execCommand failed');
                }
            } catch (fallbackErr) {
                await showPrompt("COPY THIS LINK:", url);
            }
        }
    }

    async function batchDownload() {
        // 用了JSZip
        if (selectedFiles.size === 0) return await showAlert('NO FILES SELECTED');
        const filesToZip = currentFiles.filter(f => selectedFiles.has(f.name) && !f.isDirectory);
        if (filesToZip.length === 0) return await showAlert('NO DOWNLOADABLE FILES SELECTED');
        if (filesToZip.length < selectedFiles.size) await showAlert('NOTE: DIRECTORIES SKIPPED');

        const zip = new JSZip();
        const folderName = currentPath === '/' ? 'root' : currentPath.split('/').pop();
        
        batchDownloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ZIPPING';
        
        try {
            const promises = filesToZip.map(async file => {
                const filePath = currentPath === '/' ? file.name : `${currentPath}/${file.name}`;
                const res = await fetchWithAuth(`/${encodeURIComponent(filePath.replace(/^\//, ''))}?token=${encodeURIComponent(authToken)}`);
                if (!res.ok) throw new Error(`Failed to fetch ${file.name}`);
                const blob = await res.blob();
                zip.file(file.name, blob);
            });

            await Promise.all(promises);
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${folderName}_archive.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (e) {
            await showAlert('BATCH DOWNLOAD FAILED: ' + e.message);
        } finally {
            batchDownloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> ZIP';
        }
    }

    async function createNewFolder() {
        const name = await showPrompt("INPUT NEW DIRECTORY NAME:");
        if (!name) return;
        const targetPath = currentPath === '/' ? name : `${currentPath}/${name}`;
        try {
            const res = await fetchWithAuth('/api/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath })
            });
            if (res.ok) loadFiles(currentPath);
            else await showAlert(`ERROR: ${(await res.json()).error}`);
        } catch (e) { await showAlert('CONNECTION FAILURE'); }
    }

    async function moveSelectedFiles() {
        if (selectedFiles.size === 0) return await showAlert('NO FILES SELECTED');
        const destination = await showPrompt("INPUT DESTINATION PATH:", "/");
        if (destination === null) return;
        const filesToMove = Array.from(selectedFiles).map(name => currentPath === '/' ? name : `${currentPath}/${name}`);
        try {
            const res = await fetchWithAuth('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesToMove, destination: destination })
            });
            if (res.ok) loadFiles(currentPath);
            else await showAlert(`MOVE FAILED: ${(await res.json()).error}`);
        } catch (e) { await showAlert('CONNECTION FAILURE'); }
    }

    async function renameFile(filename) {
        const newName = await showPrompt("INPUT NEW NAME:", filename);
        if (!newName || newName === filename) return;

        const oldPath = currentPath === '/' ? filename : `${currentPath}/${filename}`;
        const newPath = currentPath === '/' ? newName : `${currentPath}/${newName}`;

        try {
             const res = await fetchWithAuth('/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            });
            if (res.ok) {
                showToast('RENAME SUCCESSFUL');
                loadFiles(currentPath);
            } else {
                showToast('RENAME FAILED: ' + (await res.json()).error, 'error');
            }
        } catch (e) {
            showToast('CONNECTION ERROR', 'error');
        }
    }

    async function deleteSelectedFiles() {
        if (selectedFiles.size === 0) return await showAlert('NO FILES SELECTED');
        const confirmed = await showConfirm(`CONFIRM DELETION OF ${selectedFiles.size} ITEMS?`);
        if (!confirmed) return;

        for (const name of selectedFiles) {
            const filePath = currentPath === '/' ? name : `${currentPath}/${name}`;
            try { await fetchWithAuth(`/api/delete?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' }); } catch (e) {}
        }
        loadFiles(currentPath);
    }

    async function performSearch() {
        const term = searchInput.value.toLowerCase().trim();
        if (!term) {
            loadFiles(currentPath);
            return;
        }
        
        fileListEl.innerHTML = '<div class="loading">SEARCHING DATABASE...</div>';
        breadcrumbEl.innerHTML = `<span class="breadcrumb-item"><i class="fas fa-home"></i> ROOT</span> <span class="breadcrumb-separator">></span> <span class="breadcrumb-item">SEARCH: "${term}"</span>`;
        breadcrumbEl.querySelector('.breadcrumb-item').onclick = () => loadFiles('/');
        
        selectedFiles.clear();
        updateSelectionUI();

        try {
            const res = await fetchWithAuth(`/api/search?q=${encodeURIComponent(term)}`);
            if (!res.ok) throw new Error('Search failed');
            currentFiles = await res.json();
            renderFiles(currentFiles);
        } catch (e) {
            fileListEl.innerHTML = `<div class="loading" style="color:var(--alert-red)">ERROR: ${e.message}</div>`;
        }
    }

    function downloadFile(filename, fullPath = null) {
        const filePath = resolveFilePath(filename, fullPath);
        const url = buildFileUrl(filePath);
        window.open(url, '_blank');
    }

    async function openFileViewer(filename, fullPath = null) {
        const previewType = getPreviewType(filename);
        if (!previewType) {
            downloadFile(filename, fullPath);
            return;
        }

        const filePath = resolveFilePath(filename, fullPath);
        const url = buildFileUrl(filePath) + '&preview=true';
        viewerFilename.innerText = filename;
        viewerBody.innerHTML = '<div class="loading">LOADING CONTENT...</div>';
        viewerOverlay.classList.remove('hidden');

        // Remove existing save btn if any
        const existingSaveBtn = document.getElementById('viewerSaveBtn');
        if (existingSaveBtn) existingSaveBtn.remove();

        try {
            if (previewType === 'text') {
                 const res = await fetch(url);
                 if (!res.ok) throw new Error('Failed to load text');
                 const text = await res.text();

                 const textarea = document.createElement('textarea');
                 textarea.className = 'viewer-editor';
                 textarea.value = text;
                 textarea.spellcheck = false;

                 viewerBody.innerHTML = '';
                 viewerBody.appendChild(textarea);

                 if (userRole === 'admin') {
                     const footer = document.querySelector('.viewer-footer') || createViewerFooter();
                     footer.innerHTML = '';
                     footer.classList.remove('hidden');

                     const saveBtn = document.createElement('button');
                     saveBtn.id = 'viewerSaveBtn';
                     saveBtn.className = 'upload-btn';
                     saveBtn.innerHTML = '<i class="fas fa-save"></i> SAVE CHANGES';
                     saveBtn.onclick = async () => {
                         saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SAVING';
                         try {
                             const res = await fetchWithAuth('/api/save', {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({ path: filePath, content: textarea.value })
                             });
                             if (res.ok) showToast('FILE SAVED SUCCESSFULLY');
                             else showToast('SAVE FAILED: ' + (await res.json()).error, 'error');
                         } catch (e) {
                             showToast('CONNECTION ERROR', 'error');
                         } finally {
                             saveBtn.innerHTML = '<i class="fas fa-save"></i> SAVE CHANGES';
                         }
                     };
                     footer.appendChild(saveBtn);
                 }

            } else {
                viewerBody.innerHTML = '';
                // Hide footer for non-text
                const footer = document.querySelector('.viewer-footer');
                if (footer) footer.classList.add('hidden');

                let previewEl = null;
                if (previewType === 'image') {
                    previewEl = document.createElement('img');
                    previewEl.className = 'viewer-content-img';
                    previewEl.src = url;
                    previewEl.alt = filename;
                } else if (previewType === 'video') {
                    previewEl = document.createElement('video');
                    previewEl.className = 'viewer-content-video';
                    previewEl.src = url;
                    previewEl.controls = true;
                } else if (previewType === 'audio') {
                    previewEl = document.createElement('audio');
                    previewEl.className = 'viewer-content-audio';
                    previewEl.src = url;
                    previewEl.controls = true;
                }

                if (previewEl) {
                    viewerBody.appendChild(previewEl);
                }
            }
        } catch (e) {
            viewerBody.innerHTML = `<div style="color:var(--alert-red)">ERROR: ${e.message}</div>`;
        }

        viewerDownloadBtn.onclick = () => downloadFile(filename, fullPath);
    }

    function closeViewer() {
        viewerOverlay.classList.add('hidden');
        viewerBody.innerHTML = '';
        const footer = document.querySelector('.viewer-footer');
        if (footer) footer.classList.add('hidden');
    }

    function createViewerFooter() {
        const footer = document.createElement('div');
        footer.className = 'viewer-footer hidden';
        document.querySelector('.viewer-window').appendChild(footer);
        return footer;
    }

    function updateBreadcrumb(path) {
        breadcrumbEl.innerHTML = '';
        const parts = path.split('/').filter(p => p);
        const home = document.createElement('span');
        home.className = 'breadcrumb-item';
        home.innerHTML = '<i class="fas fa-home"></i> ROOT';
        home.onclick = () => loadFiles('/');
        breadcrumbEl.appendChild(home);

        let accumulatedPath = '';
        parts.forEach((part, index) => {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.innerText = '>';
            breadcrumbEl.appendChild(sep);
            accumulatedPath += (index === 0 ? '' : '/') + part;
            const currentAccumulated = accumulatedPath;
            const item = document.createElement('span');
            item.className = 'breadcrumb-item';
            item.innerText = part;
            item.onclick = () => loadFiles(currentAccumulated);
            breadcrumbEl.appendChild(item);
        });
    }

    // --- Upload Helper Functions ---

    async function scanFiles(items) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].webkitGetAsEntry) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) entries.push(entry);
            }
        }
        const files = [];
        for (const entry of entries) {
            await traverseFileTree(entry, '', files);
        }
        return files;
    }

    async function traverseFileTree(item, path, files) {
        if (item.isFile) {
            return new Promise(resolve => {
                item.file(file => {
                    file.customRelativePath = path + file.name;
                    files.push(file);
                    resolve();
                });
            });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const entries = await readAllEntries(dirReader);
            for (const entry of entries) {
                await traverseFileTree(entry, path + item.name + '/', files);
            }
        }
    }

    function readAllEntries(dirReader) {
        return new Promise(resolve => {
            let allEntries = [];
            function read() {
                dirReader.readEntries(entries => {
                    if (entries.length === 0) {
                        resolve(allEntries);
                    } else {
                        allEntries = allEntries.concat(entries);
                        read();
                    }
                });
            }
            read();
        });
    }

    async function handleUploads(files) {
        uploadProgressContainer.classList.remove('hidden');
        progressList.innerHTML = '';
        const filesArray = Array.from(files);
        for (const file of filesArray) { await uploadSingleFile(file); }
        setTimeout(() => { uploadProgressContainer.classList.add('hidden'); loadFiles(currentPath); }, 1000);
    }

    function uploadSingleFile(file) {
        return new Promise((resolve) => {
            const progressItem = document.createElement('div');
            progressItem.className = 'progress-item';
            progressItem.innerHTML = `<div class="name">${file.name}</div><div class="progress-bar-bg"><div class="progress-bar-fill"></div></div>`;
            progressList.appendChild(progressItem);
            const progressBar = progressItem.querySelector('.progress-bar-fill');

            const xhr = new XMLHttpRequest();
            const uploadPath = currentPath === '/' ? '' : currentPath;
            const relativePath = file.customRelativePath || file.webkitRelativePath || file.name;
            const targetPath = `${uploadPath}/${relativePath}`.replace(/^\/+/, '');
            
            xhr.open('POST', `/api/upload?path=${encodeURIComponent(targetPath)}`, true);
            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) progressBar.style.width = ((e.loaded / e.total) * 100) + '%'; };
            xhr.onload = () => { progressBar.style.background = xhr.status === 200 ? '#33ff00' : '#ff3333'; resolve(); };
            xhr.onerror = () => { progressBar.style.background = '#ff3333'; resolve(); };
            xhr.send(file);
        });
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'js': 'fa-file-code', 'html': 'fa-file-code', 'css': 'fa-file-code', 'json': 'fa-file-code',
            'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image', 'gif': 'fa-file-image',
            'pdf': 'fa-file-pdf', 'zip': 'fa-file-archive', 'rar': 'fa-file-archive',
            'mp4': 'fa-file-video', 'mp3': 'fa-file-audio', 'txt': 'fa-file-alt'
        };
        return icons[ext] || 'fa-file';
    }

    // --- New HCI Functions ---

    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function createToastContainer() {
        const div = document.createElement('div');
        div.id = 'toastContainer';
        div.className = 'toast-container';
        document.body.appendChild(div);
        return div;
    }

    function showContextMenu(x, y, filename) {
        hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';

        // Prevent menu from going off-screen
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        const file = currentFiles.find(f => f.name === filename);
        if (!file) return;

        const actions = [
            { icon: 'fa-eye', label: 'OPEN / PREVIEW', action: () => file.isDirectory ? loadFiles(file.path || (currentPath === '/' ? file.name : `${currentPath}/${file.name}`)) : openFileViewer(file.name, file.path) },
            { icon: 'fa-download', label: 'DOWNLOAD', action: () => downloadFile(file.name, file.path), condition: !file.isDirectory },
            { icon: 'fa-link', label: 'COPY LINK', action: () => copyDirectLink(file.name, file.path), condition: !file.isDirectory },
            { separator: true },
            { icon: 'fa-edit', label: 'RENAME', action: () => renameFile(file.name), condition: userRole === 'admin' },
            { icon: 'fa-trash', label: 'DELETE', action: () => { selectedFiles.add(file.name); deleteSelectedFiles(); }, danger: true, condition: userRole === 'admin' }
        ];

        actions.forEach(item => {
            if (item.condition === false) return;
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                menu.appendChild(sep);
                return;
            }
            const el = document.createElement('div');
            el.className = 'context-menu-item';
            if (item.danger) el.style.color = 'var(--alert-red)';
            el.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
            el.onclick = item.action;
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        // Adjust position after append to get dimensions
        const rect = menu.getBoundingClientRect();
        let posX = x;
        let posY = y;

        if (posX + rect.width > winWidth) posX = winWidth - rect.width - 10;
        if (posY + rect.height > winHeight) posY = winHeight - rect.height - 10;

        menu.style.top = posY + 'px';
        menu.style.left = posX + 'px';
    }

    function hideContextMenu() {
        const existing = document.querySelector('.context-menu');
        if (existing) existing.remove();
    }
});
