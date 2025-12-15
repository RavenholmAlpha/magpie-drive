const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const port = process.argv[2] || 8000;

// --- Configuration ---
const BASE_DIR = process.cwd();
const FILES_DIR = path.join(BASE_DIR, 'files');
const SECRET_DIR = path.join(BASE_DIR, 'secret');

if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
}
if (!fs.existsSync(SECRET_DIR)) {
    fs.mkdirSync(SECRET_DIR, { recursive: true });
}

// --- Config & Auth ---

//不想用数据库
//用sqlite也行？
//算了吧
const USERS = {
    'admin': { password: 'admin', role: 'admin' },
    'guest': { password: 'guest', role: 'viewer' }
};

const TOKENS = new Map();
const TOKEN_TTL = 24 * 60 * 60 * 1000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer(async function (request, response) {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  // CORS，i don't like cors,应该送去地狱nmd
  //  构思CORS，但TM又不得不加
  // 直接开了所有源，爱咋咋地，出了问题再说
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
  }

  console.log(`${request.method} ${pathname}`);

  // fuck off
  // 别问为什么，问就是快，问就是不想写路由，几百K的项目写什么路由哥们
  if (pathname === '/' || pathname === '/index.html') {
      serveAppFile('index.html', response);
      return;
  }
  if (pathname === '/login' || pathname === '/login.html') {
      serveAppFile('login.html', response);
      return;
  }
  if (pathname === '/style.css') {
      serveAppFile('style.css', response);
      return;
  }
  if (pathname === '/script.js') {
      serveAppFile('script.js', response);
      return;
  }

  // --- API ---

  // Login
  if (pathname === '/api/login' && request.method === 'POST') {
      handleLogin(request, response);
      return;
  }

  // Auth
  if (pathname === '/api/me') {
      const user = authenticate(request);
      if (!user) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Invalid token' }));
      } else {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ username: user.username, role: user.role }));
      }
      return;
  }

  // List Files
  if (pathname === '/api/list') {
      const user = authenticate(request);
      if (!user) return send401(response);
      handleApiList(user, parsedUrl.query.path, response);
      return;
  }

  // Search Files
  if (pathname === '/api/search') {
      const user = authenticate(request);
      if (!user) return send401(response);
      handleApiSearch(user, parsedUrl.query.q, response);
      return;
  }

  // Admin APIs
  if (request.method === 'POST' || request.method === 'DELETE') {
      const user = authenticate(request);
      if (!user) return send401(response);
      if (user.role !== 'admin') return send403(response);

      if (pathname === '/api/upload') {
          handleApiUpload(user, parsedUrl.query.path, request, response);
          return;
      }
      if (pathname === '/api/delete') {
          handleApiDelete(user, parsedUrl.query.path, response);
          return;
      }
      if (pathname === '/api/mkdir') {
          handleApiMkdir(user, request, response);
          return;
      }
      if (pathname === '/api/move') {
          handleApiMove(user, request, response);
          return;
      }
  }

  // File Download
  let decodedPath;
  try {
      decodedPath = decodeURIComponent(pathname);
  } catch (e) {
      response.writeHead(400);
      response.end('Bad Request');
      return;
  }

  // Handle Download with Token
  // Note: pathname starts with /, e.g., /files/foo.txt
  // resolveVirtualPath expects "files/foo.txt"
  const token = parsedUrl.query.token;
  const user = validateToken(token); // Get user from token
  
  if (user) {
      const resolved = resolveVirtualPath(user, decodedPath);
      if (resolved.type === 'fs') {
          fs.stat(resolved.path, function(error, stat) {
            if (error) {
                response.writeHead(404);
                response.end('Not Found');
                return;
            }
            if (stat.isFile()) {
                serveFileContent(resolved.path, response, true);
            } else {
                response.writeHead(302, { 'Location': '/' });
                response.end();
            }
          });
          return;
      } else if (resolved.error) {
          // Fall through to 404/403 or static files check
      }
  }
  
  // If not a valid file download request, check strictly for static files
  // (index.html, etc handled above) or return 404/403.
  // Actually, the static handlers are at the top.
  // If we reached here, it's either a download attempt or invalid.
  
  if (!user && (decodedPath.startsWith('/files') || decodedPath.startsWith('/secret'))) {
       response.writeHead(403, { 'Content-Type': 'text/html' });
       response.end('<h1>403 Forbidden</h1><p>Invalid or missing token.</p>');
       return;
  }
});

// --- Handlers ---

function authenticate(request) {
    // 认证，支持两种方式：
    //  标准的Bearer Token
    //  URL参数token
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        return validateToken(token);
    }
    const urlParts = url.parse(request.url, true);
    if (urlParts.query.token) {
        return validateToken(urlParts.query.token);
    }
    return null;
}

function validateToken(token) {
    if (!token || !TOKENS.has(token)) return null;
    const session = TOKENS.get(token);
    if (Date.now() > session.expires) {
        TOKENS.delete(token);
        return null;
    }
    return { username: session.username, role: USERS[session.username].role };
}

function resolveVirtualPath(user, queryPath) {
    //我恨斜杠反斜杠
    let safePath = queryPath || '';
    // Normalize slashes and remove leading
    safePath = safePath.replace(/\\/g, '/').replace(/^\/+/, '');
    
    if (safePath === '') {
        return { type: 'virtual_root' };
    }
    
    const parts = safePath.split('/');
    const firstSegment = parts[0];
    const restPath = parts.slice(1).join(path.sep);
    
    if (firstSegment === 'files') {
        const target = path.join(FILES_DIR, restPath);
        if (!path.resolve(target).startsWith(FILES_DIR)) return { error: 'Forbidden' };
        return { type: 'fs', path: target, root: 'files' };
    }
    
    if (firstSegment === 'secret') {
        if (!user || user.role !== 'admin') return { error: 'Forbidden' };
        const target = path.join(SECRET_DIR, restPath);
        if (!path.resolve(target).startsWith(SECRET_DIR)) return { error: 'Forbidden' };
        return { type: 'fs', path: target, root: 'secret' };
    }
    
    return { error: 'Not Found' };
}

async function handleLogin(request, response) {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
        try {
            const { username, password } = JSON.parse(body);
            const user = USERS[username];
            if (user && user.password === password) {
                const token = crypto.randomBytes(32).toString('hex');
                TOKENS.set(token, { username: username, expires: Date.now() + TOKEN_TTL });
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ success: true, token: token, username: username, role: user.role }));
            } else {
                response.writeHead(401, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'Invalid credentials' }));
            }
        } catch (e) {
            response.writeHead(400);
            response.end('Bad Request');
        }
    });
}

function handleApiList(user, queryPath, response) {
    const resolved = resolveVirtualPath(user, queryPath);
    
    if (resolved.error) {
        response.writeHead(resolved.error === 'Forbidden' ? 403 : 404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: resolved.error }));
        return;
    }

    if (resolved.type === 'virtual_root') {
        // Virtual Root Listing
        const roots = [
            { name: 'files', isDirectory: true, size: 0, mtime: Date.now() }
        ];
        if (user && user.role === 'admin') {
            roots.push({ name: 'secret', isDirectory: true, size: 0, mtime: Date.now() });
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(roots));
        return;
    }

    // FS Listing
    fs.readdir(resolved.path, { withFileTypes: true }, (err, files) => {
        if (err) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Path not found' }));
            return;
        }
        const fileList = files.map(f => {
            let stats = { size: 0, mtime: Date.now() };
            try {
                const fullPath = path.join(resolved.path, f.name);
                stats = fs.statSync(fullPath);
            } catch (e) {}
            return {
                name: f.name,
                isDirectory: f.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
            };
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(fileList));
    });
}

function handleApiSearch(user, query, response) {
    if (!query) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Missing query' }));
        return;
    }
    
    const results = [];
    const lowerQuery = query.toLowerCase();

    function walk(currentPath, relativePath) {
        let files;
        try {
            files = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) { return; }

        for (const f of files) {
            const fullPath = path.join(currentPath, f.name);
            const relPath = path.join(relativePath, f.name);
            
            if (f.name.toLowerCase().includes(lowerQuery)) {
                let stats = { size: 0, mtime: Date.now() };
                try { stats = fs.statSync(fullPath); } catch(e) {}
                
                results.push({
                    name: f.name,
                    path: relPath.replace(/\\/g, '/'),
                    isDirectory: f.isDirectory(),
                    size: stats.size,
                    mtime: stats.mtime
                });
            }

            if (f.isDirectory()) {
                walk(fullPath, relPath);
            }
        }
    }

    // Always search files
    walk(FILES_DIR, 'files');
    
    // Search secret if admin
    if (user && user.role === 'admin') {
        walk(SECRET_DIR, 'secret');
    }

    const limitedResults = results.slice(0, 200);

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(limitedResults));
}

function handleApiUpload(user, queryPath, request, response) {
    const resolved = resolveVirtualPath(user, queryPath);
    if (resolved.error) return send403(response);
    if (resolved.type === 'virtual_root') return send403(response); // Cannot upload to root

    const dir = path.dirname(resolved.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileStream = fs.createWriteStream(resolved.path);
    request.pipe(fileStream);
    fileStream.on('error', () => { response.writeHead(500); response.end('Upload Error'); });
    fileStream.on('finish', () => { response.writeHead(200); response.end('Upload Complete'); });
}

function handleApiDelete(user, queryPath, response) {
    if (!queryPath) { response.writeHead(400); response.end('Missing path'); return; }
    
    const resolved = resolveVirtualPath(user, queryPath);
    if (resolved.error) return send403(response);
    if (resolved.type === 'virtual_root') return send403(response);

    fs.stat(resolved.path, (err, stats) => {
        if (err) { response.writeHead(404); response.end('Not found'); return; }
        const op = stats.isDirectory() ? 
            (cb) => fs.rm(resolved.path, { recursive: true, force: true }, cb) : 
            (cb) => fs.unlink(resolved.path, cb);
        
        op((err) => {
            if (err) { response.writeHead(500); response.end('Delete failed'); }
            else { response.writeHead(200); response.end('Deleted'); }
        });
    });
}

function handleApiMkdir(user, request, response) {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
        try {
            const { path: dirPath } = JSON.parse(body);
            if (!dirPath) throw new Error('Missing path');
            
            const resolved = resolveVirtualPath(user, dirPath);
            if (resolved.error) return send403(response);
            if (resolved.type === 'virtual_root') return send403(response);
            
            if (fs.existsSync(resolved.path)) {
                response.writeHead(409, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'Exists' }));
            } else {
                fs.mkdirSync(resolved.path, { recursive: true });
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ success: true }));
            }
        } catch (e) {
            response.writeHead(500);
            response.end(JSON.stringify({ error: e.message }));
        }
    });
}

function handleApiMove(user, request, response) {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
        try {
            const { files, destination } = JSON.parse(body);
            
            // Resolve destination
            const resDest = resolveVirtualPath(user, destination);
            if (resDest.error || resDest.type === 'virtual_root') {
                 response.writeHead(404); // Destination invalid or root
                 response.end(JSON.stringify({ error: 'Invalid destination' }));
                 return;
            }
            if (!fs.existsSync(resDest.path)) {
                 response.writeHead(404);
                 response.end(JSON.stringify({ error: 'Destination not found' }));
                 return;
            }

            let errors = [];
            files.forEach(file => {
                const resSource = resolveVirtualPath(user, file);
                if (resSource.error || resSource.type === 'virtual_root') {
                    errors.push(`Forbidden: ${file}`);
                    return;
                }
                
                const fileName = path.basename(resSource.path);
                const targetPath = path.join(resDest.path, fileName);
                try {
                    fs.renameSync(resSource.path, targetPath);
                } catch (err) {
                    errors.push(`Failed ${file}: ${err.message}`);
                }
            });
            
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ success: true, errors }));
        } catch (e) {
            response.writeHead(400);
            response.end(JSON.stringify({ error: 'Bad Request' }));
        }
    });
}

function send401(response) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Unauthorized' })); }
function send403(response) { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Forbidden' })); }
// 服务应用文件
function serveAppFile(filename, response) { serveFileContent(path.join(process.cwd(), filename), response, false); }

// 服务文件内容
function serveFileContent(filePath, response, forceDownload = false) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    fs.readFile(filePath, (error, content) => {
        if (error) { 
            response.writeHead(404); 
            response.end('Not Found'); 
        } else { 
            const headers = { 'Content-Type': contentType };
            if (forceDownload) {
                headers['Content-Disposition'] = 'attachment';
            }
            response.writeHead(200, headers); 
            response.end(content, 'utf-8'); 
        }
    });
}

server.listen(port);

console.log(`Magpie Drive (Features) running at http://127.0.0.1:${port}/`);
console.log(`Files Dir: ${FILES_DIR}`);
console.log(`Secret Dir: ${SECRET_DIR}`);
console.log('Users: admin/admin, guest/guest'); // 纯纯占位符，不是变量
