import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const treemapJs = readFileSync(
  join(repoRoot, 'node_modules/rollup-plugin-visualizer/dist/lib/treemap.js'),
  'utf-8',
)
const treemapCss = readFileSync(
  join(repoRoot, 'node_modules/rollup-plugin-visualizer/dist/lib/treemap.css'),
  'utf-8',
)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bundle Treemap Viewer</title>
  <style>
${treemapCss}
  </style>
  <style>
    body { margin: 0; overflow: hidden; }
    .landing, .error-msg, .loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100vh; font-family: system-ui, sans-serif;
      color: #333; text-align: center; padding: 2rem;
    }
    .landing h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .landing p { color: #666; max-width: 480px; }
    .error-msg { color: #c00; }
    .error-msg pre {
      background: #fee; padding: 1rem; border-radius: 6px;
      max-width: 600px; overflow: auto; text-align: left; font-size: 0.85rem;
    }
    .loading .spinner {
      width: 36px; height: 36px; border: 3px solid #e0e0e0;
      border-top-color: #666; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin-bottom: 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main></main>
  <script>
${treemapJs}
  </script>
  <script>
    (function () {
      var main = document.querySelector("main");

      function showLanding() {
        main.innerHTML =
          '<div class="landing">' +
            "<h1>Bundle Treemap Viewer</h1>" +
            "<p>This page renders bundle treemap data encoded in the URL hash. " +
            "Open a treemap link from a bundle-stats PR comment to view it.</p>" +
          "</div>";
      }

      function showError(msg) {
        main.innerHTML =
          '<div class="error-msg">' +
            "<h2>Failed to load treemap</h2>" +
            "<pre>" + msg + "</pre>" +
          "</div>";
      }

      function showLoading() {
        main.innerHTML =
          '<div class="loading">' +
            '<div class="spinner"></div>' +
            "<p>Decoding treemap data\\u2026</p>" +
          "</div>";
      }

      function getHashData() {
        var hash = location.hash.slice(1);
        var params = new URLSearchParams(hash);
        return params.get("data");
      }

      async function decodeData(encoded) {
        var binaryStr = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
        var bytes = new Uint8Array(binaryStr.length);
        for (var i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        var ds = new DecompressionStream("gzip");
        var writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        var reader = ds.readable.getReader();
        var chunks = [];
        while (true) {
          var result = await reader.read();
          if (result.done) break;
          chunks.push(result.value);
        }
        var totalLength = chunks.reduce(function (sum, c) { return sum + c.length; }, 0);
        var merged = new Uint8Array(totalLength);
        var offset = 0;
        for (var j = 0; j < chunks.length; j++) {
          merged.set(chunks[j], offset);
          offset += chunks[j].length;
        }
        return new TextDecoder().decode(merged);
      }

      function render(data) {
        main.innerHTML = "";
        var width = window.innerWidth;
        var height = window.innerHeight;
        drawChart.default(main, data, width, height);
      }

      var currentData = null;

      async function load() {
        var encoded = getHashData();
        if (!encoded) {
          showLanding();
          return;
        }
        showLoading();
        try {
          var json = await decodeData(encoded);
          currentData = JSON.parse(json);
          render(currentData);
        } catch (err) {
          showError(err.message || String(err));
        }
      }

      window.addEventListener("resize", function () {
        if (currentData) render(currentData);
      });

      window.addEventListener("hashchange", load);

      load();
    })();
  </script>
</body>
</html>
`

const outPath = join(repoRoot, 'treemap/index.html')
mkdirSync(dirname(outPath), {recursive: true})
writeFileSync(outPath, html)
console.log(`Wrote ${outPath}`)
