// downloadGameSuper.js
// Versi canggih: scan AST (acorn) utk literal string, decode data:base64, download assets, rewrite paths.
// WARNING: experimental. Use for learning/testing saja.

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import mkdirp from 'mkdirp';
import { parse as acornParse } from 'acorn';
import walk from 'acorn-walk';
import { URL } from 'url';

const gameURL = 'https://html5.gamemonetize.co/agdjn9arsoqij7a14ueo2fv02q2csa2t/'; // ganti kalau perlu
const outDir = './game-download-super';
const downloaded = new Map(); // map url -> localPath

const ASSET_EXTS = ['png','jpg','jpeg','gif','webp','mp3','wav','ogg','json','mp4','webm','wasm','svg','bmp','bin'];

// helper: make safe local path from URL pathname
function localPathFromURL(urlObj) {
  // preserve path structure under outDir
  const safe = urlObj.pathname.replace(/^\/+/, '');
  return path.join(outDir, safe || 'root');
}

// helper: ensure folder
function ensureDirFor(filePath) {
  mkdirp.sync(path.dirname(filePath));
}

// download binary/text with axios (responseType auto)
async function fetchResource(url, responseType = 'arraybuffer') {
  try {
    const resp = await axios.get(url, { responseType, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return resp;
  } catch (err) {
    // try fallback to text
    try {
      const r2 = await axios.get(url, { responseType: 'text', timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return r2;
    } catch (e) {
      throw err;
    }
  }
}

// save buffer/string to file
function saveFile(localPath, data, isBinary=true) {
  ensureDirFor(localPath);
  if (isBinary) fs.writeFileSync(localPath, Buffer.from(data));
  else fs.writeFileSync(localPath, data, 'utf8');
}

// resolve relative -> absolute based on base
function resolveURL(base, u) {
  try {
    return new URL(u, base).toString();
  } catch (e) {
    return null;
  }
}

// pick extension from URL or fallback
function extFromUrlString(urlStr) {
  try {
    const p = new URL(urlStr).pathname;
    const ext = path.extname(p).split('.').pop().toLowerCase();
    return ext || null;
  } catch { return null; }
}

// check if string looks like an asset path/url
function looksLikeAsset(s) {
  if (!s || typeof s !== 'string') return false;
  s = s.trim();
  if (s.startsWith('data:')) return true;
  // check if contains extension
  const m = s.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  if (m && ASSET_EXTS.includes(m[1].toLowerCase())) return true;
  // also allow common asset dirs
  if (s.match(/assets|img|images|media|audio|sprites|spritesheets|textures|wasm/i)) return true;
  // http(s)
  if (s.startsWith('http://') || s.startsWith('https://')) return true;
  return false;
}

// handle data:base64 URIs, save and return local path
function handleDataURI(dataUri, suggestedName='asset') {
  // format: data:[<mediatype>][;base64],<data>
  const m = dataUri.match(/^data:([^;]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const isBase64 = !!m[2];
  const dataPart = m[3];
  // derive extension from mime
  let ext = mime.split('/').pop().replace('+xml','xml');
  if (!ext || ext.length > 6) ext = 'bin';
  const filename = `${suggestedName}.${ext}`;
  const outPath = path.join(outDir, 'inlined', filename);
  ensureDirFor(outPath);
  try {
    if (isBase64) {
      const buf = Buffer.from(dataPart, 'base64');
      fs.writeFileSync(outPath, buf);
    } else {
      // percent-decoded text
      fs.writeFileSync(outPath, decodeURIComponent(dataPart), 'utf8');
    }
    return outPath;
  } catch (err) {
    return null;
  }
}

// download an asset URL and return local relative path to outDir (web path separator)
async function downloadAssetAbsolute(absUrl) {
  if (!absUrl) return null;
  if (downloaded.has(absUrl)) return downloaded.get(absUrl);
  try {
    const urlObj = new URL(absUrl);
    const localPath = localPathFromURL(urlObj);
    // if the path ends with '/', add index.bin
    const lp = localPath.endsWith(path.sep) ? path.join(localPath, 'index.bin') : localPath;
    const ext = extFromUrlString(absUrl);
    const isBinary = ext !== 'json' && ext !== 'txt' && ext !== 'js' && ext !== 'css' && ext !== 'html';
    const resp = await fetchResource(absUrl, isBinary ? 'arraybuffer' : 'text');
    const data = resp.data;
    saveFile(lp, data, isBinary);
    const rel = path.relative(outDir, lp).split(path.sep).join('/');
    downloaded.set(absUrl, rel);
    console.log('Saved asset:', absUrl, '->', rel);
    return rel;
  } catch (err) {
    console.warn('DOWNLOAD FAILED:', absUrl, err.message);
    return null;
  }
}

// attempt to find asset-like strings in JS content using AST + fallback regex
function findAssetStringsInJS(jsContent) {
  const found = new Set();
  try {
    const ast = acornParse(jsContent, { ecmaVersion: 'latest', sourceType: 'module' });
    walk.simple(ast, {
      Literal(node) {
        if (typeof node.value === 'string') {
          if (looksLikeAsset(node.value)) found.add(node.value);
        }
      },
      TemplateElement(node) {
        if (node.value && node.value.raw && looksLikeAsset(node.value.raw)) found.add(node.value.raw);
      }
    });
  } catch (e) {
    // parse failed (minified/obf?) -> fallback regex
    const regex = /(["'`])((?:\\\1|(?:(?!\1).))+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|json|mp4|webm|wasm|svg|bin))(?:\1)/gi;
    let m;
    while ((m = regex.exec(jsContent)) !== null) found.add(m[2]);
  }
  // also catch data URIs
  const dataRegex = /(data:[^'"\s]+)/g;
  let dm;
  while ((dm = dataRegex.exec(jsContent)) !== null) found.add(dm[1]);
  return Array.from(found);
}

// rewrite JS content: replace occurrences of original asset tokens with new relative paths (best-effort)
function rewriteJSContent(jsContent, replacements) {
  let out = jsContent;
  // Sort by length desc to avoid partial overlapping replacement
  const keys = Object.keys(replacements).sort((a,b)=>b.length-a.length);
  for (const orig of keys) {
    const repl = replacements[orig];
    // escape regex
    const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'g');
    out = out.replace(re, repl);
  }
  return out;
}

// parse HTML, gather resources (script/src, link href, img/audio/video src)
function getResourcesFromHTML(html, base) {
  const dom = new JSDOM(html);
  const d = dom.window.document;
  const res = [];
  d.querySelectorAll('script[src]').forEach(s => res.push({ attr:'src', url:s.getAttribute('src') }));
  d.querySelectorAll('link[rel="stylesheet"]').forEach(l => res.push({ attr:'href', url:l.getAttribute('href') }));
  d.querySelectorAll('img[src], audio[src], video[src], source[src]').forEach(el => {
    res.push({ attr: 'src', url: el.getAttribute('src') });
  });
  // also check <meta data-...> or inline JSON configs
  d.querySelectorAll('script[type="application/json"]').forEach(s => {
    res.push({ attr: 'inlineJSON', url: s.textContent });
  });
  return res.map(r => ({ ...r, abs: resolveURL(base, r.url) }));
}

// handle JSON content: find string values that look like assets and download/replace
async function processJSONContent(jsonText, baseURL, jsonLocalPath) {
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    // invalid JSON -> skip
    return jsonText;
  }

  async function walkObj(o) {
    if (typeof o === 'string') {
      if (looksLikeAsset(o)) {
        // resolve and download
        const resolved = resolveURL(baseURL, o);
        if (resolved) {
          const rel = await downloadAssetAbsolute(resolved);
          if (rel) return rel;
        } else if (o.startsWith('data:')) {
          const saved = handleDataURI(o, 'json_asset');
          if (saved) return path.relative(outDir, saved).split(path.sep).join('/');
        }
      }
      return o;
    } else if (Array.isArray(o)) {
      const arr = [];
      for (const item of o) arr.push(await walkObj(item));
      return arr;
    } else if (o && typeof o === 'object') {
      const copy = {};
      for (const [k,v] of Object.entries(o)) copy[k] = await walkObj(v);
      return copy;
    } else return o;
  }

  const res = await walkObj(obj);
  return JSON.stringify(res, null, 2);
}

// main recursive crawler
async function crawlAndFix(startUrl) {
  // ensure output dir
  mkdirp.sync(outDir);

  const queue = [startUrl];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    // skip external protocols we can't handle
    if (!current.startsWith('http://') && !current.startsWith('https://')) continue;

    try {
      console.log('Fetching:', current);
      const res = await axios.get(current, { responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0' } });
      const contentType = (res.headers['content-type'] || '').split(';')[0];
      let localRelPath;
      let localAbsPath;

      // determine where to store
      const urlObj = new URL(current);
      localAbsPath = localPathFromURL(urlObj);
      if (current.endsWith('/') || localAbsPath.endsWith(path.sep)) {
        localAbsPath = path.join(localAbsPath, 'index.html');
      }
      // ensure file has extension based on content-type if missing
      if (!path.extname(localAbsPath) && contentType.includes('html')) localAbsPath += '.html';

      // HTML
      if (contentType.includes('html')) {
        const html = res.data;
        // parse resources
        const resources = getResourcesFromHTML(html, current);
        // download each resource
        for (const r of resources) {
          if (!r.url) continue;
          // inline JSON scripts
          if (r.attr === 'inlineJSON') {
            // parse JSON and process assets inside
            try {
              const processed = await processJSONContent(r.url, current, localAbsPath);
              // replace original inline with processed
              // naive: replace first occurrence in html (best-effort)
              const replacedHtml = html.replace(r.url, processed);
              // continue with replaced HTML for next steps
            } catch (e) { /* ignore */ }
            continue;
          }
          // handle data: URI
          if (r.url.startsWith('data:')) {
            const saved = handleDataURI(r.url, 'inline');
            if (saved) {
              // no need to queue; but we could later patch HTML/JS references by rewriting file content
            }
            continue;
          }
          const abs = resolveURL(current, r.url);
          if (!abs) continue;
          const urlObj2 = new URL(abs);
          // enqueue for crawling if html or js or json
          const ext = path.extname(urlObj2.pathname).toLowerCase();
          if (!downloaded.has(abs)) {
            if (ext === '.js' || ext === '.json' || ext === '.wasm' || ext === '.html' || ext === '.css') {
              queue.push(abs);
            } else {
              // asset binary -> download directly
              await downloadAssetAbsolute(abs);
            }
          }
        }

        // save HTML (we'll later attempt to patch references when corresponding assets are downloaded)
        const absPathFinal = localAbsPath;
        saveFile(absPathFinal, html, false);
        downloaded.set(current, path.relative(outDir, absPathFinal).split(path.sep).join('/'));
        console.log('Saved HTML ->', downloaded.get(current));
      }
      // JS
      else if (contentType.includes('javascript') || current.endsWith('.js')) {
        const jsText = res.data;
        // 1) find asset-like strings
        const assetStrings = findAssetStringsInJS(jsText);
        const replacements = {};
        for (const s of assetStrings) {
          if (s.startsWith('data:')) {
            const saved = handleDataURI(s, 'inlined_js_asset');
            if (saved) {
              const rel = path.relative(outDir, saved).split(path.sep).join('/');
              replacements[s] = rel;
            }
          } else {
            const abs = resolveURL(current, s);
            if (!abs) continue;
            const rel = await downloadAssetAbsolute(abs);
            if (rel) replacements[s] = rel;
            // enqueue if JS/JSON/html to crawl further
            const ext = extFromUrlString(abs);
            if (ext === 'js' || ext === 'json' || ext === 'html') {
              const resolved = resolveURL(current, s);
              if (resolved) queue.push(resolved);
            }
          }
        }

        // 2) rewrite JS content with replacements
        const rewritten = rewriteJSContent(jsText, replacements);

        // 3) attempt simple de-minify: insert newline after semicolons (best-effort)
        let finalJs = rewritten.replace(/;/g, ';\n');

        // save file
        const absPathFinal = localAbsPath.endsWith(path.sep) ? path.join(localAbsPath, 'index.js') : localAbsPath;
        saveFile(absPathFinal, finalJs, false);
        downloaded.set(current, path.relative(outDir, absPathFinal).split(path.sep).join('/'));
        console.log('Saved JS ->', downloaded.get(current));
      }
      // JSON
      else if (contentType.includes('json') || current.endsWith('.json')) {
        const jsonText = res.data;
        const processed = await processJSONContent(jsonText, current, localAbsPath);
        const absPathFinal = localAbsPath;
        saveFile(absPathFinal, processed, false);
        downloaded.set(current, path.relative(outDir, absPathFinal).split(path.sep).join('/'));
        console.log('Saved JSON ->', downloaded.get(current));
      }
      // CSS or other text
      else if (contentType.includes('css') || current.endsWith('.css') || contentType.startsWith('text/')) {
        const text = res.data;
        // find url(...) patterns in CSS
        const cssUrls = [];
        const cssRegex = /url\(["']?([^)"']+)["']?\)/g;
        let mm;
        while ((mm = cssRegex.exec(text)) !== null) cssUrls.push(mm[1]);
        const replacements = {};
        for (const u of cssUrls) {
          if (u.startsWith('data:')) {
            const saved = handleDataURI(u, 'css_inlined');
            if (saved) replacements[u] = path.relative(outDir, saved).split(path.sep).join('/');
          } else {
            const abs = resolveURL(current, u);
            if (!abs) continue;
            const rel = await downloadAssetAbsolute(abs);
            if (rel) replacements[u] = rel;
          }
        }
        // replace in CSS
        let newCss = text;
        for (const [orig, repl] of Object.entries(replacements)) {
          const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          newCss = newCss.replace(new RegExp(esc, 'g'), repl);
        }
        const absPathFinal = localAbsPath;
        saveFile(absPathFinal, newCss, false);
        downloaded.set(current, path.relative(outDir, absPathFinal).split(path.sep).join('/'));
        console.log('Saved CSS ->', downloaded.get(current));
      }
      // binary or other
      else {
        // attempt binary save
        try {
          const binResp = await axios.get(current, { responseType: 'arraybuffer', timeout: 30000 });
          const absPathFinal = localAbsPath;
          saveFile(absPathFinal, binResp.data, true);
          downloaded.set(current, path.relative(outDir, absPathFinal).split(path.sep).join('/'));
          console.log('Saved binary ->', downloaded.get(current));
        } catch (e) {
          console.warn('Unable to save resource', current, e.message);
        }
      }

    } catch (err) {
      console.warn('Fetch failed for', current, err.message);
    }
  }

  // POST-PROCESS: patch HTML/JS files to replace remote URLs with local ones using downloaded map
  console.log('Post-processing replacements in saved files...');
  for (const [remoteUrl, localRel] of downloaded.entries()) {
    // iterate through saved files in outDir and replace remoteUrl occurrences with localRel
    // naive but practical: scan .html .js .css .json
    const files = walkFiles(outDir, ['.html','.js','.css','.json']);
    for (const f of files) {
      try {
        let txt = fs.readFileSync(f, 'utf8');
        if (txt.includes(remoteUrl)) {
          const newtxt = txt.split(remoteUrl).join(localRel);
          fs.writeFileSync(f, newtxt, 'utf8');
        }
      } catch {}
    }
  }

  console.log('Crawl+Fix complete. Output directory:', outDir);
}

// helper: list files recursively with allowed extensions
function walkFiles(dir, exts) {
  const out = [];
  (function rec(d) {
    const items = fs.readdirSync(d);
    for (const it of items) {
      const full = path.join(d, it);
      const st = fs.statSync(full);
      if (st.isDirectory()) rec(full);
      else {
        if (!exts || exts.includes(path.extname(full))) out.push(full);
      }
    }
  })(dir);
  return out;
}

// run
(async () => {
  try {
    console.log('Starting advanced download (best-effort). This may take a while...');
    await crawlAndFix(gameURL);
    console.log('Done. Open:', path.join(outDir, 'index.html'));
    console.log('If game fails: cek console devtools, mungkin ada server-side checks atau signed URLs.');
  } catch (e) {
    console.error('Fatal error:', e);
  }
})();
