document.addEventListener('DOMContentLoaded', async () => {
    console.log("Magpie Drive System v2.0 Loaded");
    let currentPath = '/';
    let userRole = null;
    let currentUser = null;
    let authToken = localStorage.getItem('auth_token');
    let selectedFiles = new Set();
    let currentFiles = [];

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
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') performSearch();
            if (e.key === 'Escape') {
                searchInput.value = '';
                renderFiles(currentFiles);
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

    function renderFiles(files) {
        fileListEl.innerHTML = '';
        
        files.sort((a, b) => {
            // 文件夹优先，然后按名字排序
            // 写了三次才对，我是傻逼
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
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
                actionsHtml += `<button class="action-btn-icon copy-link" title="Copy Direct Link"><i class="fas fa-link"></i></button>`;
                actionsHtml += `<button class="action-btn-icon download" title="Download"><i class="fas fa-download"></i></button>`;
            }

            const parentDir = file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
            const nameHtml = file.path 
                ? `${file.name} <span class="file-path-hint">${parentDir || '/'}</span>` 
                : file.name;

            item.innerHTML = `
                <div class="col-select">${checkboxHtml}</div>
                <div class="col-icon"><i class="fas ${iconClass}"></i></div>
                <div class="col-name" title="${file.path || file.name}">${nameHtml}</div>
                <div class="col-size">${sizeText}</div>
                <div class="col-date">${dateText}</div>
                <div class="col-actions">${actionsHtml}</div>
            `;

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
                    downloadFile(file.name, file.path);
                }
            });

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
                await showAlert('LINK COPIED TO CLIPBOARD');
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
                    await showAlert('LINK COPIED TO CLIPBOARD');
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
        const filePath = fullPath ? fullPath : (currentPath === '/' ? filename : `${currentPath}/${filename}`);
        const url = `/${encodeURIComponent(filePath.replace(/^\//, ''))}?token=${encodeURIComponent(authToken)}`;
        window.open(url, '_blank');
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
});
